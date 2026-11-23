import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChargePaymentStatus, LeaseStatus, VesselCategory } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import {
  CreateCargoRecordDto,
  CreateEquipmentRentalDto,
  CreateUtilityReadingDto,
  PayChargeDto,
} from './dto/cargo-utility.dto';

export const CARGO_RECORD_CREATED_EVENT = 'cargo.record_created';

export interface CargoRecordCreatedEvent {
  recordId: number;
  recordNumber: string;
  portId: number;
  visitId?: number | null;
  description: string;
  actorId: number;
}

@Injectable()
export class CargoUtilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listCargo(scope: ScopeFilter) {
    return this.prisma.cargoHandlingRecord.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: {
        visit: { include: { vessel: true } },
        recordedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listCargoRecords(scope: ScopeFilter) {
    return this.listCargo(scope);
  }

  async listEquipment(scope: ScopeFilter) {
    return this.prisma.equipmentRentalRecord.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: {
        visit: { include: { vessel: true } },
        recordedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listEquipmentRentals(scope: ScopeFilter) {
    return this.listEquipment(scope);
  }

  async listUtilities(scope: ScopeFilter) {
    if (scope.tenantId) {
      const tenantLeases = await this.prisma.assetLease.findMany({
        where: {
          tenantId: scope.tenantId,
          status: { in: [LeaseStatus.ACTIVE, LeaseStatus.EXPIRED] },
        },
        select: { assetId: true, startDate: true, endDate: true },
      });
      if (tenantLeases.length === 0) return [];

      return this.prisma.utilityMeterReading.findMany({
        where: {
          OR: tenantLeases.map((lease) => {
            const endOfDay = new Date(lease.endDate);
            endOfDay.setUTCHours(23, 59, 59, 999);
            return {
              assetId: lease.assetId,
              createdAt: {
                gte: lease.startDate,
                lte: endOfDay,
              },
            };
          }),
        },
        include: { asset: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.utilityMeterReading.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: { asset: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCargoRecord(
    dto: CreateCargoRecordDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const visit = await this.assertVisitBelongsToPort(dto.portId, dto.visitId);
    if (visit && visit.vessel.vesselCategory === VesselCategory.PENUMPANG) {
      throw new BadRequestException(
        'Kapal kategori PENUMPANG tidak dapat mencatat bongkar muat barang komersial. Gunakan kategori BARANG atau CAMPURAN.',
      );
    }

    const ratePerUnitIdr = await this.resolveRateOrUseProvided(
      dto.tariffCode,
      dto.ratePerUnitIdr,
    );

    const days = dto.durationDays ?? 1;
    const totalAmountIdr = DecimalUtil.roundIdr(dto.quantity * days * ratePerUnitIdr);
    const recordNumber = DocNumberUtil.generate('CRG', dto.portId);

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cargoHandlingRecord.create({
        data: {
          recordNumber,
          portId: dto.portId,
          visitId: dto.visitId ?? null,
          cargoCategory: dto.cargoCategory,
          description: dto.description,
          quantity: dto.quantity,
          unitLabel: dto.unitLabel,
          storageLocation: dto.storageLocation ?? null,
          durationDays: days,
          ratePerUnitIdr,
          totalAmountIdr,
          recordedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'CARGO_RECORD_CREATED',
        entityName: 'cargo_handling_records',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });

    this.eventEmitter.emit(CARGO_RECORD_CREATED_EVENT, {
      recordId: record.id,
      recordNumber: record.recordNumber,
      portId: record.portId,
      visitId: record.visitId,
      description: record.description,
      actorId: actor.id,
    } satisfies CargoRecordCreatedEvent);

    return record;
  }

  async payCargoRecord(
    id: number,
    dto: PayChargeDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const duplicate = await this.prisma.cargoHandlingRecord.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const existing = await this.prisma.cargoHandlingRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`CargoHandlingRecord #${id} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (existing.paymentStatus !== ChargePaymentStatus.UNPAID) {
      throw new ConflictException(`Cargo record is already ${existing.paymentStatus}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.cargoHandlingRecord.update({
        where: { id },
        data: {
          paymentStatus: ChargePaymentStatus.PAID,
          idempotencyKey: dto.idempotencyKey,
          paidAt: new Date(),
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'CARGO_RECORD_PAID',
        entityName: 'cargo_handling_records',
        entityId: id,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async createEquipmentRental(
    dto: CreateEquipmentRentalDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    await this.assertVisitBelongsToPort(dto.portId, dto.visitId);

    const ratePerHourIdr = await this.resolveRateOrUseProvided(
      dto.tariffCode,
      dto.ratePerHourIdr,
    );

    const units = dto.unitCount ?? 1;
    const totalAmountIdr = DecimalUtil.roundIdr(units * dto.durationHours * ratePerHourIdr);
    const rentalNumber = DocNumberUtil.generate('EQP', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const rental = await tx.equipmentRentalRecord.create({
        data: {
          rentalNumber,
          portId: dto.portId,
          visitId: dto.visitId ?? null,
          equipmentType: dto.equipmentType,
          capacityLabel: dto.capacityLabel,
          unitCount: units,
          durationHours: dto.durationHours,
          ratePerHourIdr,
          totalAmountIdr,
          recordedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'EQUIPMENT_RENTAL_CREATED',
        entityName: 'equipment_rental_records',
        entityId: rental.id,
        afterData: rental,
        tx,
      });

      return rental;
    });
  }

  async payEquipmentRental(
    id: number,
    dto: PayChargeDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const duplicate = await this.prisma.equipmentRentalRecord.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const existing = await this.prisma.equipmentRentalRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`EquipmentRentalRecord #${id} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (existing.paymentStatus !== ChargePaymentStatus.UNPAID) {
      throw new ConflictException(`Equipment rental is already ${existing.paymentStatus}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentRentalRecord.update({
        where: { id },
        data: {
          paymentStatus: ChargePaymentStatus.PAID,
          idempotencyKey: dto.idempotencyKey,
          paidAt: new Date(),
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'EQUIPMENT_RENTAL_PAID',
        entityName: 'equipment_rental_records',
        entityId: id,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async createUtilityReading(
    dto: CreateUtilityReadingDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (!dto.visitId && !dto.assetId) {
      throw new BadRequestException('Either visitId or assetId must be specified');
    }
    if (dto.meterEnd <= dto.meterStart) {
      throw new BadRequestException('meterEnd must be strictly greater than meterStart');
    }

    await this.assertVisitBelongsToPort(dto.portId, dto.visitId);
    if (dto.assetId) {
      const asset = await this.prisma.portAsset.findUnique({ where: { id: dto.assetId } });
      if (!asset || asset.portId !== dto.portId) {
        throw new BadRequestException(`Asset #${dto.assetId} does not belong to port #${dto.portId}`);
      }
    }

    const ratePerUnitIdr = await this.resolveRateOrUseProvided(
      dto.tariffCode,
      dto.ratePerUnitIdr,
    );

    const volumeConsumed = DecimalUtil.round2(dto.meterEnd - dto.meterStart);
    const totalAmountIdr = DecimalUtil.roundIdr(volumeConsumed * ratePerUnitIdr);
    const readingNumber = DocNumberUtil.generate('UTL', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const reading = await tx.utilityMeterReading.create({
        data: {
          readingNumber,
          portId: dto.portId,
          visitId: dto.visitId ?? null,
          assetId: dto.assetId ?? null,
          utilityType: dto.utilityType,
          meterStart: dto.meterStart,
          meterEnd: dto.meterEnd,
          volumeConsumed,
          unitLabel: dto.unitLabel,
          ratePerUnitIdr,
          totalAmountIdr,
          recordedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'UTILITY_READING_CREATED',
        entityName: 'utility_meter_readings',
        entityId: reading.id,
        afterData: reading,
        tx,
      });

      return reading;
    });
  }

  async payUtilityReading(
    id: number,
    dto: PayChargeDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const duplicate = await this.prisma.utilityMeterReading.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const existing = await this.prisma.utilityMeterReading.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`UtilityMeterReading #${id} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (existing.paymentStatus !== ChargePaymentStatus.UNPAID) {
      throw new ConflictException(`Utility reading is already ${existing.paymentStatus}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.utilityMeterReading.update({
        where: { id },
        data: {
          paymentStatus: ChargePaymentStatus.PAID,
          idempotencyKey: dto.idempotencyKey,
          paidAt: new Date(),
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'UTILITY_READING_PAID',
        entityName: 'utility_meter_readings',
        entityId: id,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  private async resolveRateOrUseProvided(
    tariffCode?: string,
    explicitRate?: number,
  ): Promise<number> {
    if (tariffCode) {
      const tariff = await this.prisma.generalTariff.findUnique({ where: { tariffCode } });
      if (!tariff || !tariff.isActive) {
        throw new NotFoundException(`Active GeneralTariff ${tariffCode} not found`);
      }
      return DecimalUtil.toNumber(tariff.amountIdr);
    }
    if (explicitRate === undefined) {
      throw new BadRequestException('Either tariffCode or explicit rate must be provided');
    }
    return explicitRate;
  }

  private async assertVisitBelongsToPort(portId: number, visitId?: number) {
    if (!visitId) return null;
    const visit = await this.prisma.shipVisit.findUnique({
      where: { id: visitId },
      include: { vessel: { select: { vesselCategory: true } } },
    });
    if (!visit || visit.portId !== portId) {
      throw new BadRequestException(`Visit #${visitId} does not belong to port #${portId}`);
    }
    return visit;
  }

  async getUtilityReceipt(id: number, scope: ScopeFilter) {
    const utility = await this.prisma.utilityMeterReading.findUnique({
      where: { id },
      include: {
        port: true,
        asset: {
          include: {
            leases: {
              where: { status: { in: [LeaseStatus.ACTIVE, LeaseStatus.EXPIRED] } },
              include: { tenant: true },
            },
          },
        },
        recordedBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!utility) {
      throw new NotFoundException(`UtilityMeterReading #${id} not found`);
    }

    if (scope.portId && utility.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    if (scope.tenantId) {
      const isTenantAsset = utility.asset?.leases?.some((l) => l.tenantId === scope.tenantId);
      if (!isTenantAsset) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
    }

    const ssrdNumber = `SSRD-UTL-${utility.readingNumber}`;
    const matchedLease = utility.asset?.leases?.[0];

    return {
      documentTitle: 'SURAT SETORAN RETRIBUSI DAERAH (e-SSRD)',
      subTitle: 'BUKTI PEMBAYARAN RETRIBUSI JASA USAHA DAERAH (UTILITAS PELABUHAN) SAH',
      ssrdNumber,
      readingNumber: utility.readingNumber,
      paymentDate: utility.paidAt || utility.createdAt,
      portName: utility.port.name,
      portLocation: utility.port.location,
      taxPayer: {
        tenantName: matchedLease?.tenantName || 'Wajib Retribusi Tenant Pelabuhan',
        tenantNpwp: matchedLease?.tenantNpwp || matchedLease?.tenant?.npwp || '-',
        businessName: matchedLease?.tenant?.name || matchedLease?.tenantName || '-',
      },
      retributionObject: {
        utilityType: utility.utilityType,
        assetCode: utility.asset?.assetCode || '-',
        assetName: utility.asset?.name || 'Fasilitas Pelabuhan',
        meterStart: Number(utility.meterStart),
        meterEnd: Number(utility.meterEnd),
        volumeConsumed: Number(utility.volumeConsumed),
        unitLabel: utility.unitLabel,
        ratePerUnitIdr: Number(utility.ratePerUnitIdr),
        legalBasis: 'Perda Kab. Mimika No. 4/2023 & Perbup No. 25/2024',
        revenueAccountCode: '4.1.02.02.04 (Retribusi Penyediaan Air Bersih & Energi Listrik Pelabuhan)',
      },
      paymentDetails: {
        totalAmountIdr: Number(utility.totalAmountIdr),
        paymentStatus: utility.paymentStatus,
        paidAt: utility.paidAt,
        idempotencyKey: utility.idempotencyKey || `UTL-${utility.id}`,
        recordedByName: utility.recordedBy?.fullName || 'Petugas Pencatat Meteran',
      },
      qrValidationCode: `PORTA-SSRD-UTL:${utility.port.code}:${ssrdNumber}:${utility.paymentStatus}`,
    };
  }
}
