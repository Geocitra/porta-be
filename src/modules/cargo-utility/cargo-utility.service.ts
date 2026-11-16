import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChargePaymentStatus } from '@prisma/client';
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

@Injectable()
export class CargoUtilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createCargoRecord(dto: CreateCargoRecordDto, actor: AuthenticatedUser) {
    await this.assertVisitBelongsToPort(dto.portId, dto.visitId);

    const ratePerUnitIdr = await this.resolveRateOrUseProvided(
      dto.tariffCode,
      dto.ratePerUnitIdr,
    );

    const days = dto.durationDays ?? 1;
    const totalAmountIdr = DecimalUtil.roundIdr(dto.quantity * days * ratePerUnitIdr);
    const recordNumber = DocNumberUtil.generate('CRG', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.cargoHandlingRecord.create({
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
        action: 'CARGO_RECORD_CREATED',
        entityName: 'cargo_handling_records',
        entityId: record.id,
        afterData: record,
        tx,
      });

      return record;
    });
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
        action: 'CARGO_RECORD_PAID',
        entityName: 'cargo_handling_records',
        entityId: id,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async createEquipmentRental(dto: CreateEquipmentRentalDto, actor: AuthenticatedUser) {
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
        action: 'EQUIPMENT_RENTAL_PAID',
        entityName: 'equipment_rental_records',
        entityId: id,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async createUtilityReading(dto: CreateUtilityReadingDto, actor: AuthenticatedUser) {
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

  private async assertVisitBelongsToPort(portId: number, visitId?: number): Promise<void> {
    if (!visitId) return;
    const visit = await this.prisma.shipVisit.findUnique({ where: { id: visitId } });
    if (!visit || visit.portId !== portId) {
      throw new BadRequestException(`Visit #${visitId} does not belong to port #${portId}`);
    }
  }
}

