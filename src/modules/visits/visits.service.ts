import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityMode,
  BerthCategory,
  BillingEligibility,
  BillingStage,
  InvoiceStatus,
  ServiceCode,
  VerificationStatus,
  VisitActivityMode,
  VisitOrigin,
  VisitStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import { BILLING_CONSTANTS } from '../../config/billing.constants';
import { TariffResolverService } from '../tariffs/tariff-resolver.service';
import {
  CreateVisitDto,
  EndBerthingDto,
  RecordArrivalDto,
  RecordDepartureDto,
  StartBerthingDto,
} from './dto/visits.dto';
import { assertValidVisitTransition } from './visit-state-machine';

export const VISIT_DEPARTED_EVENT = 'visit.departed';

export interface VisitDepartedEvent {
  visitId: number;
  actorId: number;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tariffResolver: TariffResolverService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storage: StorageService,
  ) {}

  findAll(scope: ScopeFilter) {
    return this.prisma.shipVisit.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
      },
      include: {
        vessel: true,
        operator: { select: { id: true, name: true } },
        berthingRecords: { include: { berth: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number, scope: ScopeFilter) {
    const visit = await this.prisma.shipVisit.findUnique({
      where: { id },
      include: {
        port: true,
        vessel: true,
        operator: true,
        berthingRecords: { include: { berth: true } },
        invoices: { include: { items: true, payments: true } },
      },
    });

    if (!visit) throw new NotFoundException(`Visit #${id} not found`);
    if (scope.portId && visit.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (scope.operatorId && visit.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cross-operator access denied');
    }
    return visit;
  }

  async createVisit(dto: CreateVisitDto, user: AuthenticatedUser, scope: ScopeFilter) {
    const eta = new Date(dto.eta);
    const etd = new Date(dto.etd);
    if (etd <= eta) {
      throw new BadRequestException('ETD must be strictly after ETA');
    }

    const vessel = await this.prisma.vessel.findUnique({
      where: { id: dto.vesselId },
      include: { operator: true },
    });
    if (!vessel || !vessel.isActive) {
      throw new NotFoundException(`Vessel #${dto.vesselId} not found or inactive`);
    }

    if (scope.operatorId && vessel.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot create visit for another operator vessel');
    }

    if (dto.visitOrigin === VisitOrigin.OPERATOR_REQUEST) {
      if (vessel.operator.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          `Operator "${vessel.operator.name}" belum diverifikasi oleh Admin Pelabuhan`,
        );
      }
      if (vessel.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          `Kapal "${vessel.name}" belum diverifikasi (Surat Ukur/GT) oleh Admin Pelabuhan`,
        );
      }
    }

    // Early tariff resolution check: skip for transit-only vessels
    if (!dto.isTransitOnly) {
      const labuhServiceCode =
        dto.activityMode === VisitActivityMode.TUKS_TERSUS
          ? ServiceCode.KEGIATAN_TUKS_TERSUS
          : ServiceCode.JASA_LABUH;

      await this.tariffResolver.resolveOrThrow({
        serviceCode: labuhServiceCode,
        shippingCategory: vessel.shippingCategory,
        ...(dto.activityMode === VisitActivityMode.TUKS_TERSUS
          ? {}
          : {
              shipType: vessel.shipType,
              activityMode:
                dto.activityMode === VisitActivityMode.FIXED_ACTIVITY
                  ? ActivityMode.FIXED_ACTIVITY
                  : ActivityMode.NORMAL,
            }),
      });
    }

    const initialStatus =
      dto.visitOrigin === VisitOrigin.OFFICER_INCIDENTAL
        ? VisitStatus.APPROVED
        : VisitStatus.REQUESTED;

    const visitNumber = `VST-${dto.portId}-${Date.now()}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const visit = await tx.shipVisit.create({
        data: {
          visitNumber,
          portId: dto.portId,
          vesselId: vessel.id,
          operatorId: vessel.operatorId,
          visitOrigin: dto.visitOrigin,
          activityMode: dto.activityMode,
          isTransitOnly: dto.isTransitOnly ?? false,
          originPort: dto.originPort,
          destinationPort: dto.destinationPort,
          eta,
          etd,
          status: initialStatus,
          notes: dto.notes,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'VISIT_CREATED',
        entityName: 'ship_visits',
        entityId: visit.id,
        afterData: visit,
        tx,
      });

      return visit;
    });

    return created;
  }

  async approveVisit(visitId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    const visit = await this.findById(visitId, scope);
    assertValidVisitTransition(visit.status, VisitStatus.APPROVED);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: VisitStatus.REQUESTED },
        data: { status: VisitStatus.APPROVED },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'VISIT_APPROVED',
        entityName: 'ship_visits',
        entityId: visitId,
        beforeData: { status: visit.status },
        afterData: { status: VisitStatus.APPROVED },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });
  }

  async recordArrival(
    visitId: number,
    dto: RecordArrivalDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);
    assertValidVisitTransition(visit.status, VisitStatus.ANCHORED);

    const ata = new Date(dto.ataAnchorage);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: VisitStatus.APPROVED },
        data: { status: VisitStatus.ANCHORED, ataAnchorage: ata },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'VISIT_ANCHORED',
        entityName: 'ship_visits',
        entityId: visitId,
        afterData: { ataAnchorage: ata },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });
  }

  async startBerthing(
    visitId: number,
    dto: StartBerthingDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
    evidenceFile?: UploadedFilePayload,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);

    if (
      visit.status !== VisitStatus.APPROVED &&
      visit.status !== VisitStatus.ANCHORED &&
      visit.status !== VisitStatus.BERTHED
    ) {
      throw new BadRequestException(`Cannot start berthing while visit is in status ${visit.status}`);
    }

    const berth = await this.prisma.berth.findUnique({ where: { id: dto.berthId } });
    if (!berth || !berth.isActive) {
      throw new NotFoundException(`Berth #${dto.berthId} not found or inactive`);
    }
    if (berth.portId !== visit.portId) {
      throw new BadRequestException('Berth does not belong to the same port as the visit');
    }

    // Ensure no open berthing record already exists for this visit
    const openBerthing = await this.prisma.berthingRecord.findFirst({
      where: { visitId, actualEndAt: null },
    });
    if (openBerthing) {
      throw new ConflictException(
        `Visit #${visitId} still has an active berthing record (#${openBerthing.id}). End it before moving berth.`,
      );
    }

    // Early tariff check for berth only if verified BILLABLE by Pemda
    if (berth.billingEligibility === BillingEligibility.BILLABLE) {
      const tambatCode =
        dto.berthCategory === BerthCategory.KHUSUS_TUKS
          ? ServiceCode.JASA_TAMBAT_KHUSUS
          : ServiceCode.JASA_TAMBAT_UMUM;

      await this.tariffResolver.resolveOrThrow({
        serviceCode: tambatCode,
        shippingCategory: visit.vessel.shippingCategory,
        berthType: berth.berthType,
      });
    }

    const actualStartAt = new Date(dto.actualStartAt);
    const evidencePhoto = evidenceFile
      ? await this.storage.saveFile(`berthings/${visitId}`, evidenceFile)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (visit.status !== VisitStatus.BERTHED) {
        await tx.shipVisit.update({
          where: { id: visitId },
          data: {
            status: VisitStatus.BERTHED,
            ataAnchorage: visit.ataAnchorage ?? actualStartAt,
          },
        });
      }

      const record = await tx.berthingRecord.create({
        data: {
          portId: visit.portId,
          visitId: visit.id,
          berthId: berth.id,
          berthCategory: dto.berthCategory,
          actualStartAt,
          evidencePhoto,
          recordedById: user.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'BERTHING_STARTED',
        entityName: 'berthing_records',
        entityId: record.id,
        afterData: record,
        tx,
      });

      return record;
    });
  }

  async endBerthing(
    visitId: number,
    berthingId: number,
    dto: EndBerthingDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);

    const record = await this.prisma.berthingRecord.findUnique({ where: { id: berthingId } });
    if (!record || record.visitId !== visitId) {
      throw new NotFoundException(`BerthingRecord #${berthingId} not found for visit #${visitId}`);
    }
    if (!record.actualStartAt) {
      throw new BadRequestException('Berthing start time has not been recorded');
    }
    if (record.actualEndAt) {
      throw new ConflictException('Berthing record has already been closed');
    }

    const actualEndAt = new Date(dto.actualEndAt);
    if (actualEndAt <= record.actualStartAt) {
      throw new BadRequestException('actualEndAt must be strictly after actualStartAt');
    }

    const diffHours = DecimalUtil.round2(
      (actualEndAt.getTime() - record.actualStartAt.getTime()) / BILLING_CONSTANTS.MS_PER_HOUR,
    );
    const etmal = Math.max(1, Math.ceil(diffHours / BILLING_CONSTANTS.HOURS_PER_ETMAL));

    const isOverstay = actualEndAt > visit.etd;
    const overstayHours = isOverstay
      ? DecimalUtil.round2(
          (actualEndAt.getTime() - visit.etd.getTime()) / BILLING_CONSTANTS.MS_PER_HOUR,
        )
      : 0;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.berthingRecord.update({
        where: { id: berthingId },
        data: {
          actualEndAt,
          calculatedHours: diffHours,
          billableEtmal: etmal,
          isOverstay,
          overstayHours,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'BERTHING_ENDED',
        entityName: 'berthing_records',
        entityId: berthingId,
        beforeData: record,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async recordDeparture(
    visitId: number,
    dto: RecordDepartureDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);
    assertValidVisitTransition(visit.status, VisitStatus.DEPARTED);

    const openBerthing = await this.prisma.berthingRecord.findFirst({
      where: { visitId, actualEndAt: null },
    });
    if (openBerthing) {
      throw new BadRequestException(
        `Cannot depart while berthing record #${openBerthing.id} is still open`,
      );
    }

    const atd = new Date(dto.atdPort);
    if (visit.ataAnchorage && atd <= visit.ataAnchorage) {
      throw new BadRequestException('atdPort must be strictly after ataAnchorage');
    }

    const departedVisit = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: visit.status },
        data: { status: VisitStatus.DEPARTED, atdPort: atd },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'VISIT_DEPARTED',
        entityName: 'ship_visits',
        entityId: visitId,
        beforeData: { status: visit.status },
        afterData: { status: VisitStatus.DEPARTED, atdPort: atd },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });

    // Decoupled Domain Event: billing module listens to auto-draft FINAL_SKRD
    this.eventEmitter.emit(VISIT_DEPARTED_EVENT, {
      visitId,
      actorId: user.id,
    } satisfies VisitDepartedEvent);

    return departedVisit;
  }

  private async assertNotLockedByFinalSkrd(visitId: number): Promise<void> {
    const activeFinalSkrd = await this.prisma.invoice.findFirst({
      where: {
        visitId,
        billingStage: BillingStage.FINAL_SKRD,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
      },
    });

    if (activeFinalSkrd) {
      throw new ConflictException(
        `Visit #${visitId} is locked by issued FINAL_SKRD (${activeFinalSkrd.invoiceNumber}). Void the SKRD first to make corrections.`,
      );
    }
  }
}

