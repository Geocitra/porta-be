import { Injectable, NotFoundException } from '@nestjs/common';
import { PortTariff } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { CreateTariffDto } from './dto/tariffs.dto';

@Injectable()
export class TariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAllActive(): Promise<PortTariff[]> {
    return this.prisma.portTariff.findMany({
      where: { isActive: true },
      orderBy: [{ serviceCode: 'asc' }, { tariffCode: 'asc' }],
    });
  }

  async create(dto: CreateTariffDto, actor: AuthenticatedUser): Promise<PortTariff> {
    return this.prisma.$transaction(async (tx) => {
      const tariff = await tx.portTariff.create({
        data: {
          tariffCode: dto.tariffCode,
          serviceCode: dto.serviceCode,
          shippingCategory: dto.shippingCategory,
          shipType: dto.shipType,
          activityMode: dto.activityMode,
          berthType: dto.berthType,
          unitType: dto.unitType,
          currency: dto.currency,
          amount: dto.amount,
          legalBasis: dto.legalBasis,
          effectiveFrom: new Date(dto.effectiveFrom),
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'TARIFF_CREATED',
        entityName: 'port_tariffs',
        entityId: tariff.id,
        afterData: tariff,
        tx,
      });

      return tariff;
    });
  }

  async deactivate(id: number, actor: AuthenticatedUser): Promise<PortTariff> {
    const existing = await this.prisma.portTariff.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Tariff #${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.portTariff.update({
        where: { id },
        data: { isActive: false, effectiveTo: new Date() },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'TARIFF_DEACTIVATED',
        entityName: 'port_tariffs',
        entityId: id,
        beforeData: { isActive: existing.isActive },
        afterData: { isActive: false },
        tx,
      });

      return updated;
    });
  }
}
