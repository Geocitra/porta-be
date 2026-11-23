import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  ActivityMode,
  AdjustmentApprovalStatus,
  BerthCategory,
  BillingEligibility,
  BillingStage,
  CollectionInstrument,
  InvoiceStatus,
  Prisma,
  ServiceCode,
  VisitActivityMode,
  VisitStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import { EtmalRoundingMode } from '../../config/billing.constants';
import { ExchangeRateService } from '../tariffs/exchange-rate.service';
import { TariffCalculator } from '../tariffs/tariff.calculator';
import { TariffResolverService } from '../tariffs/tariff-resolver.service';
import { VISIT_DEPARTED_EVENT, VisitDepartedEvent } from '../visits/visits.service';
import {
  BankPaymentWebhookDto,
  DecideBillingAdjustmentDto,
  GenerateBillingDto,
  RecordPaymentDto,
  RequestBillingAdjustmentDto,
  VoidInvoiceDto,
} from './dto/billing.dto';

export const INVOICE_ISSUED_EVENT = 'invoice.issued';

export interface InvoiceIssuedEvent {
  invoiceId: number;
  invoiceNumber: string;
  portId: number;
  visitId: number;
  operatorId: number;
  totalAmountIdr: number;
  dueDate: Date;
  actorId: number;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tariffResolver: TariffResolverService,
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(VISIT_DEPARTED_EVENT)
  async handleVisitDeparted(event: VisitDepartedEvent): Promise<void> {
    const existing = await this.prisma.invoice.findFirst({
      where: {
        visitId: event.visitId,
        billingStage: BillingStage.FINAL_SKRD,
        status: { not: InvoiceStatus.VOID },
      },
    });
    if (existing) return;

    await this.generateForVisit(
      event.visitId,
      BillingStage.FINAL_SKRD,
      {},
      { id: event.actorId } as AuthenticatedUser,
      {},
    );
  }

  findInvoices(scope: ScopeFilter) {
    if (scope.tenantId && !scope.operatorId) {
      return [];
    }
    return this.prisma.invoice.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
      },
      include: {
        visit: { include: { vessel: true } },
        items: true,
        payments: true,
        adjustments: true,
        warnings: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAdjustments(scope: ScopeFilter) {
    return this.prisma.billingAdjustment.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope.operatorId
          ? { invoice: { operatorId: scope.operatorId } }
          : {}),
      },
      include: {
        invoice: {
          include: {
            visit: { include: { vessel: true } },
          },
        },
        requestedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateForVisit(
    visitId: number,
    stage: BillingStage,
    dto: GenerateBillingDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.prisma.shipVisit.findUnique({
      where: { id: visitId },
      include: {
        vessel: true,
        berthingRecords: { include: { berth: true } },
      },
    });

    if (!visit) throw new NotFoundException(`Visit #${visitId} not found`);
    if (scope.portId && visit.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (scope.operatorId && visit.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cross-operator access denied');
    }

    // Perbup Mimika 25/2024: Karcis/SKRD can be issued BEFORE service (APPROVED/ANCHORED/BERTHED)
    // as well as AFTER service (DEPARTED) for finalization/adjustment.
    if (
      visit.status === VisitStatus.REQUESTED ||
      visit.status === VisitStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot generate billing while visit is in status ${visit.status}`,
      );
    }

    const existingActive = await this.prisma.invoice.findFirst({
      where: { visitId, billingStage: stage, status: { not: InvoiceStatus.VOID } },
    });
    if (existingActive) {
      throw new ConflictException(
        `Active ${stage} already exists for visit #${visitId} (${existingActive.invoiceNumber})`,
      );
    }

    const exchangeRateUsd = await this.exchangeRateService.getLiveUsdToIdrRate(
      dto.exchangeRateUsd,
    );
    const roundingMode =
      (this.configService.get<string>('ETMAL_ROUNDING_MODE') as EtmalRoundingMode) ||
      'ROUND_UP';

    const gt = DecimalUtil.toNumber(visit.vessel.grossTonnage);
    const labuhStart = visit.ataAnchorage ?? visit.eta;
    const labuhEnd = visit.atdPort ?? visit.etd;

    const itemsToCreate: Prisma.InvoiceItemCreateWithoutInvoiceInput[] = [];

    // 1. Jasa Labuh / TUKS-Tersus (skip if visit is transit-only)
    if (!visit.isTransitOnly) {
      const labuhServiceCode =
        visit.activityMode === VisitActivityMode.TUKS_TERSUS
          ? ServiceCode.KEGIATAN_TUKS_TERSUS
          : ServiceCode.JASA_LABUH;

      const labuhTariff = await this.tariffResolver.resolveOrThrow({
        serviceCode: labuhServiceCode,
        shippingCategory: visit.vessel.shippingCategory,
        ...(visit.activityMode === VisitActivityMode.TUKS_TERSUS
          ? {}
          : {
              shipType: visit.vessel.shipType,
              activityMode:
                visit.activityMode === VisitActivityMode.FIXED_ACTIVITY
                  ? ActivityMode.FIXED_ACTIVITY
                  : ActivityMode.NORMAL,
            }),
      });

      const labuhCalc = TariffCalculator.calculate({
        grossTonnage: gt,
        startAt: labuhStart,
        endAt: labuhEnd,
        unitType: labuhTariff.unitType,
        tariffAmount: DecimalUtil.toNumber(labuhTariff.amount),
        currency: labuhTariff.currency,
        exchangeRateUsd,
        roundingMode,
      });

      itemsToCreate.push({
        tariff: { connect: { id: labuhTariff.id } },
        serviceCode: labuhTariff.serviceCode,
        description: `Jasa Labuh - ${visit.vessel.name}`,
        gtSnapshot: gt,
        unitsCharged: labuhCalc.unitsCharged,
        unitType: labuhTariff.unitType,
        tariffAmountSnapshot: labuhTariff.amount,
        currency: labuhTariff.currency,
        subtotalOriginal: labuhCalc.subtotalOriginal,
        subtotalIdr: labuhCalc.subtotalIdr,
        formulaNote: labuhCalc.formulaNote,
      });
    }

    // 2. Jasa Tambat only for berths verified as BILLABLE by Pemda (Pasal 79 guard)
    for (const berthing of visit.berthingRecords) {
      if (berthing.berth.billingEligibility !== BillingEligibility.BILLABLE) {
        continue;
      }
      const startAt = berthing.actualStartAt ?? berthing.plannedStartAt;
      const endAt = berthing.actualEndAt ?? berthing.plannedEndAt;
      if (!startAt || !endAt) continue;

      const tambatCode =
        berthing.berthCategory === BerthCategory.KHUSUS_TUKS
          ? ServiceCode.JASA_TAMBAT_KHUSUS
          : ServiceCode.JASA_TAMBAT_UMUM;

      const tambatTariff = await this.tariffResolver.resolveOrThrow({
        serviceCode: tambatCode,
        shippingCategory: visit.vessel.shippingCategory,
        berthType: berthing.berth.berthType,
      });

      const tambatCalc = TariffCalculator.calculate({
        grossTonnage: gt,
        startAt,
        endAt,
        unitType: tambatTariff.unitType,
        tariffAmount: DecimalUtil.toNumber(tambatTariff.amount),
        currency: tambatTariff.currency,
        exchangeRateUsd,
        roundingMode,
      });

      itemsToCreate.push({
        tariff: { connect: { id: tambatTariff.id } },
        serviceCode: tambatTariff.serviceCode,
        description: `Jasa Tambat (${berthing.berth.name})`,
        gtSnapshot: gt,
        unitsCharged: tambatCalc.unitsCharged,
        unitType: tambatTariff.unitType,
        tariffAmountSnapshot: tambatTariff.amount,
        currency: tambatTariff.currency,
        subtotalOriginal: tambatCalc.subtotalOriginal,
        subtotalIdr: tambatCalc.subtotalIdr,
        formulaNote: tambatCalc.formulaNote,
      });
    }

    if (itemsToCreate.length === 0) {
      throw new BadRequestException(
        'No billable Pemda services found for this visit (transit-only or non-billable berths)',
      );
    }

    const totalAmountIdr = itemsToCreate.reduce(
      (sum, item) => sum + DecimalUtil.toNumber(item.subtotalIdr as number),
      0,
    );

    const advanceInvoice =
      stage === BillingStage.FINAL_SKRD
        ? await this.prisma.invoice.findFirst({
            where: {
              visitId,
              billingStage: BillingStage.ADVANCE_SKRD,
              status: { not: InvoiceStatus.VOID },
            },
          })
        : null;

    const instrument = dto.collectionInstrument ?? CollectionInstrument.KARCIS;
    const prefix =
      stage === BillingStage.ESTIMATE
        ? 'EST'
        : instrument === CollectionInstrument.KARCIS
          ? 'KRC'
          : 'SKRD';
    const invoiceNumber = DocNumberUtil.generate(prefix, visit.portId);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          collectionInstrument: instrument,
          portId: visit.portId,
          visitId: visit.id,
          operatorId: visit.operatorId,
          parentInvoiceId: advanceInvoice?.id ?? null,
          billingStage: stage,
          exchangeRateUsd,
          totalAmountIdr,
          status: InvoiceStatus.DRAFT,
          items: { create: itemsToCreate },
        },
        include: { items: true },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: `INVOICE_GENERATED_${stage}`,
        entityName: 'invoices',
        entityId: invoice.id,
        afterData: invoice,
        tx,
      });

      return invoice;
    });
  }

  async issueInvoice(invoiceId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    const invoice = await this.findInvoiceScoped(invoiceId, scope);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException(`Only DRAFT invoice can be issued (current: ${invoice.status})`);
    }
    if (invoice.billingStage === BillingStage.ESTIMATE) {
      throw new BadRequestException('ESTIMATE cannot be issued as an official SKRD');
    }

    const now = new Date();
    const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const issuedResult = await this.prisma.$transaction(async (tx) => {
      // Check if verified advance payments on this visit already cover or partially cover this invoice
      const visitPayments = await tx.payment.aggregate({
        where: {
          isVerified: true,
          invoice: { visitId: invoice.visitId, status: { not: InvoiceStatus.VOID } },
        },
        _sum: { amountIdr: true },
      });

      const totalPaid = DecimalUtil.toNumber(visitPayments._sum.amountIdr);
      const totalBilled = DecimalUtil.toNumber(invoice.totalAmountIdr);

      let issuedStatus: InvoiceStatus = InvoiceStatus.ISSUED;
      if (invoice.billingStage === BillingStage.FINAL_SKRD && totalPaid > 0) {
        if (totalPaid > totalBilled) issuedStatus = InvoiceStatus.OVERPAID;
        else if (totalPaid === totalBilled) issuedStatus = InvoiceStatus.PAID;
        else issuedStatus = InvoiceStatus.PARTIAL;
      }

      const isSettled =
        issuedStatus === InvoiceStatus.PAID || issuedStatus === InvoiceStatus.OVERPAID;
      const ssrdNumber =
        isSettled && !invoice.ssrdNumber
          ? DocNumberUtil.generate('SSRD', invoice.portId)
          : invoice.ssrdNumber;

      const updated = await tx.invoice.updateMany({
        where: { id: invoiceId, status: InvoiceStatus.DRAFT },
        data: { status: issuedStatus, issuedAt: now, dueDate, ssrdNumber },
      });
      if (updated.count === 0) {
        throw new ConflictException('Invoice status changed concurrently');
      }

      if (invoice.billingStage === BillingStage.FINAL_SKRD) {
        const nextVisitStatus =
          issuedStatus === InvoiceStatus.PAID || issuedStatus === InvoiceStatus.OVERPAID
            ? VisitStatus.SETTLED
            : VisitStatus.BILLED;
        await tx.shipVisit.update({
          where: { id: invoice.visitId },
          data: { status: nextVisitStatus },
        });
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'INVOICE_ISSUED',
        entityName: 'invoices',
        entityId: invoiceId,
        beforeData: { status: invoice.status },
        afterData: { status: issuedStatus, issuedAt: now, prePaidFromAdvanceIdr: totalPaid },
        tx,
      });

      return tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
    });

    this.eventEmitter.emit(INVOICE_ISSUED_EVENT, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      portId: invoice.portId,
      visitId: invoice.visitId,
      operatorId: invoice.operatorId,
      totalAmountIdr: DecimalUtil.toNumber(invoice.totalAmountIdr),
      dueDate,
      actorId: user.id,
    } satisfies InvoiceIssuedEvent);

    return issuedResult;
  }

  async voidInvoice(
    invoiceId: number,
    dto: VoidInvoiceDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const invoice = await this.findInvoiceScoped(invoiceId, scope);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new ConflictException('Invoice is already VOID');
    }

    const verifiedPaymentsCount = await this.prisma.payment.count({
      where: { invoiceId, isVerified: true },
    });
    if (verifiedPaymentsCount > 0) {
      throw new ConflictException('Cannot void an invoice that already has verified payments');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.VOID, voidReason: dto.reason },
      });

      if (invoice.billingStage === BillingStage.FINAL_SKRD) {
        await tx.shipVisit.updateMany({
          where: { id: invoice.visitId, status: VisitStatus.BILLED },
          data: { status: VisitStatus.DEPARTED },
        });
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'INVOICE_VOIDED',
        entityName: 'invoices',
        entityId: invoiceId,
        beforeData: { status: invoice.status },
        afterData: { status: InvoiceStatus.VOID },
        reason: dto.reason,
        tx,
      });

      return tx.invoice.findUnique({ where: { id: invoiceId } });
    });
  }

  async recordPayment(
    invoiceId: number,
    dto: RecordPaymentDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    // Idempotency guard MUST run first so retries on already-PAID invoices succeed safely
    const duplicate = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) {
      return duplicate;
    }

    const invoice = await this.findInvoiceScoped(invoiceId, scope);
    if (
      invoice.status !== InvoiceStatus.ISSUED &&
      invoice.status !== InvoiceStatus.PARTIAL
    ) {
      throw new BadRequestException(
        `Payments can only be recorded for ISSUED or PARTIAL invoices (current: ${invoice.status})`,
      );
    }

    if (invoice.billingStage === BillingStage.ADVANCE_SKRD) {
      const finalSkrd = await this.prisma.invoice.findFirst({
        where: {
          visitId: invoice.visitId,
          billingStage: BillingStage.FINAL_SKRD,
          status: { not: InvoiceStatus.VOID },
        },
      });
      if (finalSkrd) {
        throw new ConflictException(
          `FINAL_SKRD (${finalSkrd.invoiceNumber}) already exists for this visit. Record payment on FINAL_SKRD instead.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          idempotencyKey: dto.idempotencyKey,
          amountIdr: dto.amountIdr,
          method: dto.method,
          referenceNo: dto.referenceNo,
          paidAt: new Date(dto.paidAt),
          isVerified: true,
          verifiedById: user.id,
          verifiedAt: new Date(),
        },
      });

      // Sum all verified payments across the visit to prevent double counting with ADVANCE_SKRD
      const visitPayments = await tx.payment.aggregate({
        where: {
          isVerified: true,
          invoice: { visitId: invoice.visitId, status: { not: InvoiceStatus.VOID } },
        },
        _sum: { amountIdr: true },
      });

      const totalPaid = DecimalUtil.toNumber(visitPayments._sum.amountIdr);
      const totalBilled = DecimalUtil.toNumber(invoice.totalAmountIdr);

      let nextStatus: InvoiceStatus;
      if (totalPaid > totalBilled) {
        nextStatus = InvoiceStatus.OVERPAID;
      } else if (totalPaid === totalBilled) {
        nextStatus = InvoiceStatus.PAID;
      } else {
        nextStatus = InvoiceStatus.PARTIAL;
      }

      const isSettled =
        nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.OVERPAID;
      const ssrdNumber =
        isSettled && !invoice.ssrdNumber
          ? DocNumberUtil.generate('SSRD', invoice.portId)
          : invoice.ssrdNumber;

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: nextStatus, ssrdNumber },
      });

      if (
        invoice.billingStage === BillingStage.FINAL_SKRD &&
        (nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.OVERPAID)
      ) {
        await tx.shipVisit.updateMany({
          where: { id: invoice.visitId, status: VisitStatus.BILLED },
          data: { status: VisitStatus.SETTLED },
        });
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'PAYMENT_RECORDED',
        entityName: 'payments',
        entityId: payment.id,
        afterData: { payment, nextInvoiceStatus: nextStatus, totalPaidForVisit: totalPaid },
        tx,
      });

      return payment;
    });
  }

  async submitPaymentProof(
    invoiceId: number,
    dto: RecordPaymentDto,
    file: UploadedFilePayload,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!file) throw new BadRequestException('Payment proof file is required');

    const duplicate = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const invoice = await this.findInvoiceScoped(invoiceId, scope);
    if (
      invoice.status !== InvoiceStatus.ISSUED &&
      invoice.status !== InvoiceStatus.PARTIAL
    ) {
      throw new BadRequestException(
        `Payment proof can only be submitted for ISSUED or PARTIAL invoices (current: ${invoice.status})`,
      );
    }

    if (invoice.billingStage === BillingStage.ADVANCE_SKRD) {
      const finalSkrd = await this.prisma.invoice.findFirst({
        where: {
          visitId: invoice.visitId,
          billingStage: BillingStage.FINAL_SKRD,
          status: { not: InvoiceStatus.VOID },
        },
      });
      if (finalSkrd) {
        throw new ConflictException(
          `FINAL_SKRD (${finalSkrd.invoiceNumber}) already exists for this visit. Submit payment proof on FINAL_SKRD instead.`,
        );
      }
    }

    const proofFilePath = await this.storage.saveFile(`payments/${invoiceId}`, file);

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          idempotencyKey: dto.idempotencyKey,
          amountIdr: dto.amountIdr,
          method: dto.method,
          referenceNo: dto.referenceNo,
          proofFilePath,
          paidAt: new Date(dto.paidAt),
          isVerified: false,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'PAYMENT_PROOF_SUBMITTED',
        entityName: 'payments',
        entityId: payment.id,
        afterData: payment,
        tx,
      });

      return payment;
    });
  }

  async verifyPayment(paymentId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException(`Payment #${paymentId} not found`);
    if (scope.portId && payment.invoice.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (payment.isVerified) {
      throw new ConflictException('Payment is already verified');
    }

    return this.prisma.$transaction(async (tx) => {
      const verifiedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          isVerified: true,
          verifiedById: user.id,
          verifiedAt: new Date(),
        },
      });

      const visitPayments = await tx.payment.aggregate({
        where: {
          isVerified: true,
          invoice: { visitId: payment.invoice.visitId, status: { not: InvoiceStatus.VOID } },
        },
        _sum: { amountIdr: true },
      });

      const totalPaid = DecimalUtil.toNumber(visitPayments._sum.amountIdr);
      const totalBilled = DecimalUtil.toNumber(payment.invoice.totalAmountIdr);

      let nextStatus: InvoiceStatus;
      if (totalPaid > totalBilled) nextStatus = InvoiceStatus.OVERPAID;
      else if (totalPaid === totalBilled) nextStatus = InvoiceStatus.PAID;
      else nextStatus = InvoiceStatus.PARTIAL;

      const isSettled =
        nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.OVERPAID;
      const ssrdNumber =
        isSettled && !payment.invoice.ssrdNumber
          ? DocNumberUtil.generate('SSRD', payment.invoice.portId)
          : payment.invoice.ssrdNumber;

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: nextStatus, ssrdNumber },
      });

      if (
        payment.invoice.billingStage === BillingStage.FINAL_SKRD &&
        (nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.OVERPAID)
      ) {
        await tx.shipVisit.updateMany({
          where: { id: payment.invoice.visitId, status: VisitStatus.BILLED },
          data: { status: VisitStatus.SETTLED },
        });
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'PAYMENT_VERIFIED',
        entityName: 'payments',
        entityId: paymentId,
        afterData: { verifiedPayment, nextInvoiceStatus: nextStatus, totalPaidForVisit: totalPaid },
        tx,
      });

      return verifiedPayment;
    });
  }

  async getPrintPayload(invoiceId: number, scope: ScopeFilter) {
    await this.findInvoiceScoped(invoiceId, scope);

    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        operator: { select: { id: true, name: true, npwp: true, address: true, phone: true } },
        visit: {
          include: {
            port: { select: { id: true, code: true, name: true, location: true } },
            vessel: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
                imoNumber: true,
                grossTonnage: true,
                shipType: true,
                shippingCategory: true,
              },
            },
          },
        },
        items: { include: { tariff: { select: { tariffCode: true, legalBasis: true } } } },
        payments: { where: { isVerified: true }, orderBy: { paidAt: 'asc' } },
      },
    });

    const totalVerifiedPaidIdr = invoice.payments.reduce(
      (sum, p) => sum + DecimalUtil.toNumber(p.amountIdr),
      0,
    );

    return {
      issuerAuthority: 'Pemerintah Kabupaten Mimika — Dinas Perhubungan',
      documentType: invoice.ssrdNumber
        ? 'SSRD (Surat Setoran Retribusi Daerah)'
        : invoice.collectionInstrument === CollectionInstrument.KARCIS
          ? 'KARCIS RETRIBUSI KEPELABUHANAN'
          : 'e-SKRD (Surat Ketetapan Retribusi Daerah)',
      invoiceNumber: invoice.invoiceNumber,
      ssrdNumber: invoice.ssrdNumber,
      collectionInstrument: invoice.collectionInstrument,
      billingStage: invoice.billingStage,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      port: invoice.visit.port,
      operator: invoice.operator,
      vessel: invoice.visit.vessel,
      visitNumber: invoice.visit.visitNumber,
      items: invoice.items,
      totalAmountIdr: DecimalUtil.toNumber(invoice.totalAmountIdr),
      totalVerifiedPaidIdr,
      remainingDueIdr: Math.max(
        0,
        DecimalUtil.toNumber(invoice.totalAmountIdr) - totalVerifiedPaidIdr,
      ),
      payments: invoice.payments,
    };
  }

  async handleBankWebhook(dto: BankPaymentWebhookDto, signatureHeader?: string) {
    const secret =
      this.configService.get<string>('BANK_WEBHOOK_SECRET') ||
      'porta-bank-webhook-secret-2026';
    const payloadString = `${dto.idempotencyKey}:${dto.invoiceNumber}:${dto.amountIdr}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    if (
      !signatureHeader ||
      signatureHeader.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig))
    ) {
      throw new UnauthorizedException('Invalid bank webhook HMAC signature');
    }

    const duplicate = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNumber: dto.invoiceNumber },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${dto.invoiceNumber} not found`);
    }
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PARTIAL) {
      throw new BadRequestException(`Invoice ${dto.invoiceNumber} is ${invoice.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          idempotencyKey: dto.idempotencyKey,
          amountIdr: dto.amountIdr,
          method: dto.method,
          referenceNo: dto.referenceNo,
          paidAt: new Date(dto.paidAt),
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      const visitPayments = await tx.payment.aggregate({
        where: {
          isVerified: true,
          invoice: { visitId: invoice.visitId, status: { not: InvoiceStatus.VOID } },
        },
        _sum: { amountIdr: true },
      });

      const totalPaid = DecimalUtil.toNumber(visitPayments._sum.amountIdr);
      const totalBilled = DecimalUtil.toNumber(invoice.totalAmountIdr);

      let nextStatus: InvoiceStatus;
      if (totalPaid > totalBilled) nextStatus = InvoiceStatus.OVERPAID;
      else if (totalPaid === totalBilled) nextStatus = InvoiceStatus.PAID;
      else nextStatus = InvoiceStatus.PARTIAL;

      const isSettled =
        nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.OVERPAID;
      const ssrdNumber =
        isSettled && !invoice.ssrdNumber
          ? DocNumberUtil.generate('SSRD', invoice.portId)
          : invoice.ssrdNumber;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus, ssrdNumber },
      });

      if (invoice.billingStage === BillingStage.FINAL_SKRD && isSettled) {
        await tx.shipVisit.updateMany({
          where: { id: invoice.visitId, status: VisitStatus.BILLED },
          data: { status: VisitStatus.SETTLED },
        });
      }

      await this.auditLog.record({
        actorId: null,
        action: 'BANK_WEBHOOK_PAYMENT_VERIFIED',
        entityName: 'payments',
        entityId: payment.id,
        afterData: { payment, nextInvoiceStatus: nextStatus, ssrdNumber },
        tx,
      });

      return { payment, invoiceStatus: nextStatus, ssrdNumber };
    });
  }

  async requestAdjustment(
    invoiceId: number,
    dto: RequestBillingAdjustmentDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const invoice = await this.findInvoiceScoped(invoiceId, scope);
    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot request adjustment on ${invoice.status} invoice`);
    }

    const requestNumber = DocNumberUtil.generate('ADJ', invoice.portId);

    return this.prisma.$transaction(async (tx) => {
      const adj = await tx.billingAdjustment.create({
        data: {
          requestNumber,
          portId: invoice.portId,
          invoiceId: invoice.id,
          adjustmentType: dto.adjustmentType,
          requestedAmountIdr: dto.requestedAmountIdr,
          installmentCount: dto.installmentCount ?? null,
          deferredUntil: dto.deferredUntil ? new Date(dto.deferredUntil) : null,
          reason: dto.reason,
          status: AdjustmentApprovalStatus.REQUESTED,
          requestedById: user.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'BILLING_ADJUSTMENT_REQUESTED',
        entityName: 'billing_adjustments',
        entityId: adj.id,
        afterData: adj,
        tx,
      });

      return adj;
    });
  }

  async decideAdjustment(
    adjustmentId: number,
    dto: DecideBillingAdjustmentDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (dto.status === AdjustmentApprovalStatus.REQUESTED) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }

    const adj = await this.prisma.billingAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adj) throw new NotFoundException(`BillingAdjustment #${adjustmentId} not found`);
    if (scope.portId && adj.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (adj.status !== AdjustmentApprovalStatus.REQUESTED) {
      throw new ConflictException(`Adjustment is already ${adj.status}`);
    }

    // Strict Separation of Duties (Perbup 25/2024 governance): requester cannot approve own request
    if (adj.requestedById === actor.id) {
      throw new ForbiddenException('Separation of Duties: requester cannot approve own adjustment');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingAdjustment.update({
        where: { id: adjustmentId },
        data: {
          status: dto.status,
          approvedById: actor.id,
          approvedAt: new Date(),
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: `BILLING_ADJUSTMENT_${dto.status}`,
        entityName: 'billing_adjustments',
        entityId: adjustmentId,
        beforeData: { status: adj.status },
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  private async findInvoiceScoped(invoiceId: number, scope: ScopeFilter) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice #${invoiceId} not found`);
    if (scope.portId && invoice.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (scope.operatorId && invoice.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cross-operator access denied');
    }
    return invoice;
  }
}

