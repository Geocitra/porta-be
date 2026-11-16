import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  GateTicketBookStatus,
  GeneralTariffDomain,
  HandoverStatus,
  TerminalClass,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import {
  CloseGateHandoverDto,
  CreateFerryRouteDto,
  CreateGateTicketBookDto,
  CreateVesselManifestDto,
  OpenGateHandoverDto,
} from './dto/gate-ticketing.dto';

@Injectable()
export class GateTicketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listTicketBooks(scope: ScopeFilter) {
    return this.prisma.gateTicketBook.findMany({
      where: { ...(scope.portId ? { portId: scope.portId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTicketBook(dto: CreateGateTicketBookDto, actor: AuthenticatedUser) {
    if (dto.serialEnd < dto.serialStart) {
      throw new BadRequestException('serialEnd must be >= serialStart');
    }

    return this.prisma.$transaction(async (tx) => {
      const book = await tx.gateTicketBook.create({
        data: {
          ...dto,
          porporasiDate: dto.porporasiDate ? new Date(dto.porporasiDate) : null,
        },
      });
      await this.auditLog.record({
        actorId: actor.id,
        action: 'GATE_BOOK_CREATED',
        entityName: 'gate_ticket_books',
        entityId: book.id,
        afterData: book,
        tx,
      });
      return book;
    });
  }

  async openHandover(dto: OpenGateHandoverDto, actor: AuthenticatedUser, scope: ScopeFilter) {
    const book = await this.prisma.gateTicketBook.findUnique({ where: { id: dto.bookId } });
    if (!book) throw new NotFoundException(`GateTicketBook #${dto.bookId} not found`);
    if (scope.portId && book.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const lastSettled = await this.prisma.gateWardenHandover.findFirst({
      where: { bookId: book.id, status: HandoverStatus.SETTLED },
      orderBy: { settleTime: 'desc' },
    });

    const dispatchedSerialStart = lastSettled?.lastReturnedSerial ?? book.serialStart;
    if (dispatchedSerialStart > book.serialEnd) {
      throw new ConflictException('Ticket book is already exhausted');
    }

    return this.prisma.$transaction(async (tx) => {
      // Optimistic locking: only one shift can claim a STOK book
      const claimed = await tx.gateTicketBook.updateMany({
        where: { id: book.id, status: GateTicketBookStatus.STOK },
        data: { status: GateTicketBookStatus.ACTIVE },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          `Book ${book.bookCode} is not in STOK status (currently ${book.status})`,
        );
      }

      const handover = await tx.gateWardenHandover.create({
        data: {
          portId: book.portId,
          bookId: book.id,
          wardenName: dto.wardenName,
          dispatchedSerialStart,
          dispatchedSerialEnd: book.serialEnd,
          status: HandoverStatus.DISTRIBUTED,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'GATE_HANDOVER_OPENED',
        entityName: 'gate_warden_handovers',
        entityId: handover.id,
        afterData: handover,
        tx,
      });

      return handover;
    });
  }

  async closeHandover(
    handoverId: number,
    dto: CloseGateHandoverDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const handover = await this.prisma.gateWardenHandover.findUnique({
      where: { id: handoverId },
      include: { book: true },
    });
    if (!handover) throw new NotFoundException(`Handover #${handoverId} not found`);
    if (scope.portId && handover.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (handover.status !== HandoverStatus.DISTRIBUTED) {
      throw new ConflictException('Handover is already settled');
    }

    const maxAllowedReturn = handover.dispatchedSerialEnd + 1;
    if (
      dto.lastReturnedSerial < handover.dispatchedSerialStart ||
      dto.lastReturnedSerial > maxAllowedReturn
    ) {
      throw new BadRequestException(
        `lastReturnedSerial must be between ${handover.dispatchedSerialStart} and ${maxAllowedReturn}`,
      );
    }

    const soldQty = dto.lastReturnedSerial - handover.dispatchedSerialStart;
    const expectedAmountIdr = DecimalUtil.roundIdr(
      soldQty * DecimalUtil.toNumber(handover.book.nominalPerTicket),
    );
    const actualSettled = DecimalUtil.roundIdr(dto.actualCashSettledIdr);
    const unmatchedAmountIdr = actualSettled - expectedAmountIdr;

    // Zero Discrepancy policy (aligned with MARS)
    if (unmatchedAmountIdr !== 0) {
      throw new BadRequestException(
        `Zero Discrepancy violation: expected Rp ${expectedAmountIdr}, settled Rp ${actualSettled} (diff: Rp ${unmatchedAmountIdr})`,
      );
    }

    const nextBookStatus =
      dto.lastReturnedSerial > handover.dispatchedSerialEnd
        ? GateTicketBookStatus.HABIS
        : GateTicketBookStatus.STOK;

    return this.prisma.$transaction(async (tx) => {
      const settled = await tx.gateWardenHandover.update({
        where: { id: handoverId },
        data: {
          lastReturnedSerial: dto.lastReturnedSerial,
          soldQty,
          expectedAmountIdr,
          actualCashSettledIdr: actualSettled,
          unmatchedAmountIdr: 0,
          status: HandoverStatus.SETTLED,
          notes: dto.notes,
          settleTime: new Date(),
        },
      });

      await tx.gateTicketBook.update({
        where: { id: handover.bookId },
        data: { status: nextBookStatus },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'GATE_HANDOVER_SETTLED',
        entityName: 'gate_warden_handovers',
        entityId: handoverId,
        afterData: settled,
        tx,
      });

      return settled;
    });
  }

  listFerryRoutes(portId?: number) {
    return this.prisma.ferryRoute.findMany({
      where: {
        isActive: true,
        ...(portId ? { portId } : {}),
      },
      orderBy: { destinationName: 'asc' },
    });
  }

  createFerryRoute(dto: CreateFerryRouteDto) {
    return this.prisma.ferryRoute.create({ data: dto });
  }

  listManifests(scope: ScopeFilter) {
    return this.prisma.vesselManifest.findMany({
      where: { ...(scope.portId ? { portId: scope.portId } : {}) },
      include: {
        visit: { select: { id: true, visitNumber: true, vessel: { select: { name: true } } } },
        ferryRoute: { select: { id: true, destinationName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createManifest(dto: CreateVesselManifestDto, actor: AuthenticatedUser) {
    const visit = await this.prisma.shipVisit.findUnique({ where: { id: dto.visitId } });
    if (!visit || visit.portId !== dto.portId) {
      throw new BadRequestException(`Visit #${dto.visitId} does not belong to port #${dto.portId}`);
    }

    if (dto.ferryRouteId) {
      const route = await this.prisma.ferryRoute.findUnique({ where: { id: dto.ferryRouteId } });
      if (!route || route.portId !== dto.portId) {
        throw new BadRequestException(
          `FerryRoute #${dto.ferryRouteId} does not belong to port #${dto.portId}`,
        );
      }
    }

    const existing = await this.prisma.vesselManifest.findUnique({
      where: { visitId: dto.visitId },
    });
    if (existing) {
      throw new ConflictException(`Manifest already exists for visit #${dto.visitId}`);
    }

    // Perda Mimika 4/2023 Lampiran XI D.2: resolve Terminal Penumpang tariff from general_tariffs (Zero Hardcoding!)
    const tClass = dto.terminalClass ?? TerminalClass.KELAS_B;
    const now = new Date();
    const [departTariff, greeterTariff] = await Promise.all([
      this.prisma.generalTariff.findFirst({
        where: {
          domain: GeneralTariffDomain.TERMINAL_PASSENGER,
          itemKey: `${tClass}_DEPARTURE`,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.generalTariff.findFirst({
        where: {
          domain: GeneralTariffDomain.TERMINAL_PASSENGER,
          itemKey: `${tClass}_GREETER`,
          isActive: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    if (!departTariff || !greeterTariff) {
      throw new UnprocessableEntityException(
        `Active terminal passenger tariff not found in general_tariffs for ${tClass}`,
      );
    }

    const departingPassengers = dto.adultCount + (dto.childCount ?? 0);
    const greeters = dto.greeterCount ?? 0;
    const terminalFeeIdr = DecimalUtil.roundIdr(
      departingPassengers * DecimalUtil.toNumber(departTariff.amountIdr) +
        greeters * DecimalUtil.toNumber(greeterTariff.amountIdr),
    );

    const manifestNumber = DocNumberUtil.generate('MNF', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const manifest = await tx.vesselManifest.create({
        data: {
          manifestNumber,
          portId: dto.portId,
          visitId: dto.visitId,
          ferryRouteId: dto.ferryRouteId ?? null,
          terminalClass: tClass,
          adultCount: dto.adultCount,
          childCount: dto.childCount ?? 0,
          infantCount: dto.infantCount ?? 0,
          greeterCount: greeters,
          vehicleCount: dto.vehicleCount ?? 0,
          cargoTons: dto.cargoTons ?? 0,
          terminalFeeIdr,
          notes: dto.notes,
          recordedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'VESSEL_MANIFEST_CREATED',
        entityName: 'vessel_manifests',
        entityId: manifest.id,
        afterData: manifest,
        tx,
      });

      return manifest;
    });
  }
}

