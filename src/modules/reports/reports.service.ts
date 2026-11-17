import { Injectable } from '@nestjs/common';
import {
  BillingEligibility,
  BillingStage,
  ChargePaymentStatus,
  HandoverStatus,
  InvoiceStatus,
  VesselCategory,
  VisitStatus,
} from '@prisma/client';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { SimulateRevenueDto } from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRevenueSummary(scope: ScopeFilter) {
    const portFilter = scope.portId ? { portId: scope.portId } : {};

    const [
      verifiedPayments,
      gateTicketingSettled,
      assetLeasePayments,
      cargoPaid,
      equipmentPaid,
      utilityPaid,
      manifestAgg,
      outstandingInvoices,
      unbilledVisitsCount,
      visitsForCategoryBreakdown,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          isVerified: true,
          invoice: {
            ...portFilter,
            status: { not: InvoiceStatus.VOID },
          },
        },
        _sum: { amountIdr: true },
        _count: { id: true },
      }),
      this.prisma.gateWardenHandover.aggregate({
        where: {
          ...portFilter,
          status: HandoverStatus.SETTLED,
        },
        _sum: { actualCashSettledIdr: true },
      }),
      this.prisma.assetLeasePayment.aggregate({
        where: {
          lease: portFilter,
        },
        _sum: { amountIdr: true },
      }),
      this.prisma.cargoHandlingRecord.aggregate({
        where: { ...portFilter, paymentStatus: ChargePaymentStatus.PAID },
        _sum: { totalAmountIdr: true },
      }),
      this.prisma.equipmentRentalRecord.aggregate({
        where: { ...portFilter, paymentStatus: ChargePaymentStatus.PAID },
        _sum: { totalAmountIdr: true },
      }),
      this.prisma.utilityMeterReading.aggregate({
        where: { ...portFilter, paymentStatus: ChargePaymentStatus.PAID },
        _sum: { totalAmountIdr: true },
      }),
      this.prisma.vesselManifest.aggregate({
        where: portFilter,
        _sum: {
          adultCount: true,
          childCount: true,
          infantCount: true,
          vehicleCount: true,
          terminalFeeIdr: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          ...portFilter,
          billingStage: { in: [BillingStage.FINAL_SKRD, BillingStage.ADVANCE_SKRD] },
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        },
        select: {
          id: true,
          visitId: true,
          totalAmountIdr: true,
          visit: {
            select: {
              invoices: {
                where: { status: { not: InvoiceStatus.VOID } },
                select: {
                  payments: {
                    where: { isVerified: true },
                    select: { amountIdr: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.shipVisit.count({
        where: {
          ...portFilter,
          status: VisitStatus.DEPARTED,
          OR: [
            { isTransitOnly: false },
            { berthingRecords: { some: { berth: { billingEligibility: BillingEligibility.BILLABLE } } } },
          ],
          invoices: {
            none: {
              billingStage: BillingStage.FINAL_SKRD,
              status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
            },
          },
        },
      }),
      this.prisma.shipVisit.findMany({
        where: portFilter,
        select: {
          vessel: { select: { vesselCategory: true } },
          invoices: {
            where: { status: { not: InvoiceStatus.VOID } },
            select: {
              payments: {
                where: { isVerified: true },
                select: { amountIdr: true },
              },
            },
          },
        },
      }),
    ]);

    const outstandingReceivablesIdr = outstandingInvoices.reduce((total, inv) => {
      const paidForVisit = inv.visit.invoices.reduce(
        (vSum, vInv) =>
          vSum + vInv.payments.reduce((pSum, p) => pSum + DecimalUtil.toNumber(p.amountIdr), 0),
        0,
      );
      const remaining = Math.max(0, DecimalUtil.toNumber(inv.totalAmountIdr) - paidForVisit);
      return total + remaining;
    }, 0);

    const vesselRevenueIdr = DecimalUtil.toNumber(verifiedPayments._sum.amountIdr);
    const gateTicketingRevenueIdr = DecimalUtil.toNumber(
      gateTicketingSettled._sum.actualCashSettledIdr,
    );
    const assetLeaseRevenueIdr = DecimalUtil.toNumber(assetLeasePayments._sum.amountIdr);
    const cargoEquipmentRevenueIdr =
      DecimalUtil.toNumber(cargoPaid._sum.totalAmountIdr) +
      DecimalUtil.toNumber(equipmentPaid._sum.totalAmountIdr);
    const utilityRevenueIdr = DecimalUtil.toNumber(utilityPaid._sum.totalAmountIdr);

    const vesselCategoryBreakdown: Record<
      VesselCategory,
      { visitCount: number; verifiedRevenueIdr: number }
    > = {
      [VesselCategory.BARANG]: { visitCount: 0, verifiedRevenueIdr: 0 },
      [VesselCategory.PENUMPANG]: { visitCount: 0, verifiedRevenueIdr: 0 },
      [VesselCategory.CAMPURAN]: { visitCount: 0, verifiedRevenueIdr: 0 },
    };

    for (const v of visitsForCategoryBreakdown) {
      const cat = v.vessel.vesselCategory;
      const paidIdr = v.invoices.reduce(
        (sum, inv) =>
          sum + inv.payments.reduce((pSum, p) => pSum + DecimalUtil.toNumber(p.amountIdr), 0),
        0,
      );
      vesselCategoryBreakdown[cat].visitCount += 1;
      vesselCategoryBreakdown[cat].verifiedRevenueIdr += paidIdr;
    }

    return {
      vesselRevenueIdr,
      gateTicketingRevenueIdr,
      assetLeaseRevenueIdr,
      cargoEquipmentRevenueIdr,
      utilityRevenueIdr,
      totalVerifiedRevenueIdr:
        vesselRevenueIdr +
        gateTicketingRevenueIdr +
        assetLeaseRevenueIdr +
        cargoEquipmentRevenueIdr +
        utilityRevenueIdr,
      verifiedPaymentCount: verifiedPayments._count.id,
      outstandingReceivablesIdr,
      outstandingInvoiceCount: outstandingInvoices.length,
      unbilledDepartedVisitsCount: unbilledVisitsCount,
      passengerTraffic: {
        totalPassengers:
          (manifestAgg._sum.adultCount ?? 0) +
          (manifestAgg._sum.childCount ?? 0) +
          (manifestAgg._sum.infantCount ?? 0),
        totalVehicles: manifestAgg._sum.vehicleCount ?? 0,
        terminalPassengerFeeIdr: DecimalUtil.toNumber(manifestAgg._sum.terminalFeeIdr),
      },
      vesselCategoryBreakdown,
    };
  }

  async getUnbilledDepartedVisits(scope: ScopeFilter) {
    return this.prisma.shipVisit.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        status: VisitStatus.DEPARTED,
        OR: [
          { isTransitOnly: false },
          { berthingRecords: { some: { berth: { billingEligibility: BillingEligibility.BILLABLE } } } },
        ],
        invoices: {
          none: {
            billingStage: BillingStage.FINAL_SKRD,
            status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
          },
        },
      },
      include: {
        vessel: true,
        operator: { select: { id: true, name: true } },
        berthingRecords: { include: { berth: true } },
      },
      orderBy: { atdPort: 'asc' },
    });
  }

  async simulateRevenue(dto: SimulateRevenueDto, scope: ScopeFilter) {
    const portId = scope.portId ?? dto.portId;
    const multiplier = 1 + (dto.tariffAdjustmentPercent ?? 0) / 100;

    const monthlyLabuhIdr = DecimalUtil.roundIdr(
      dto.estimatedMonthlyVisits * dto.averageGt * dto.labuhTariffPerGtIdr * multiplier,
    );
    const monthlyTambatIdr = DecimalUtil.roundIdr(
      dto.estimatedMonthlyVisits *
        dto.averageGt *
        dto.averageEtmal *
        dto.tariffPerGtEtmalIdr *
        multiplier,
    );

    const activeAssets = await this.prisma.portAsset.findMany({
      where: { isActive: true, ...(portId ? { portId } : {}) },
      select: { areaSqm: true, annualRatePerSqmIdr: true, status: true },
    });

    const potentialAnnualAssetLeaseIdr = activeAssets.reduce(
      (sum, a) =>
        sum +
        DecimalUtil.roundIdr(
          DecimalUtil.toNumber(a.areaSqm) * DecimalUtil.toNumber(a.annualRatePerSqmIdr) * multiplier,
        ),
      0,
    );

    const projectedAnnualVesselRevenueIdr = (monthlyLabuhIdr + monthlyTambatIdr) * 12;

    return {
      portId: portId ?? 'ALL',
      tariffAdjustmentPercent: dto.tariffAdjustmentPercent ?? 0,
      monthlyLabuhIdr,
      monthlyTambatIdr,
      projectedAnnualVesselRevenueIdr,
      potentialAnnualAssetLeaseIdr,
      projectedTotalAnnualPadIdr: projectedAnnualVesselRevenueIdr + potentialAnnualAssetLeaseIdr,
    };
  }

  async getGisOpportunities(scope: ScopeFilter) {
    const portFilter = scope.portId ? { portId: scope.portId } : {};

    const [berths, assets] = await Promise.all([
      this.prisma.berth.findMany({
        where: { isActive: true, ...portFilter },
        select: {
          id: true,
          portId: true,
          code: true,
          name: true,
          berthType: true,
          authorityType: true,
          billingEligibility: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.portAsset.findMany({
        where: { isActive: true, ...portFilter },
        select: {
          id: true,
          portId: true,
          assetCode: true,
          name: true,
          assetType: true,
          areaSqm: true,
          annualRatePerSqmIdr: true,
          billingEligibility: true,
          status: true,
          gisCoordinates: true,
        },
        orderBy: { assetCode: 'asc' },
      }),
    ]);

    return {
      berths,
      assets,
      availableAssetsCount: assets.filter((a) => a.status === 'AVAILABLE').length,
      leasedAssetsCount: assets.filter((a) => a.status === 'LEASED').length,
    };
  }
}

