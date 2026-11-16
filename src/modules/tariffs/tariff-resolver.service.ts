import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  ActivityMode,
  BerthType,
  PortTariff,
  ServiceCode,
  ShipType,
  ShippingCategory,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ResolveTariffCriteria {
  serviceCode: ServiceCode;
  shippingCategory: ShippingCategory;
  shipType?: ShipType | null;
  activityMode?: ActivityMode | null;
  berthType?: BerthType | null;
  referenceDate?: Date;
}

@Injectable()
export class TariffResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrThrow(criteria: ResolveTariffCriteria): Promise<PortTariff> {
    const refDate = criteria.referenceDate ?? new Date();

    const tariff = await this.prisma.portTariff.findFirst({
      where: {
        isActive: true,
        serviceCode: criteria.serviceCode,
        shippingCategory: criteria.shippingCategory,
        effectiveFrom: { lte: refDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: refDate } }],
        ...(criteria.shipType !== undefined ? { shipType: criteria.shipType } : {}),
        ...(criteria.activityMode !== undefined ? { activityMode: criteria.activityMode } : {}),
        ...(criteria.berthType !== undefined ? { berthType: criteria.berthType } : {}),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!tariff) {
      throw new UnprocessableEntityException(
        `No active Perda tariff found for service=${criteria.serviceCode}, category=${criteria.shippingCategory}, shipType=${criteria.shipType ?? 'ANY'}, activity=${criteria.activityMode ?? 'ANY'}, berth=${criteria.berthType ?? 'ANY'}`,
      );
    }

    return tariff;
  }
}

