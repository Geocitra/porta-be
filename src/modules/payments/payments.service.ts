import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChargePaymentStatus,
  InvoiceStatus,
  LeaseStatus,
  PaymentMethod,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import {
  CheckoutPaymentDto,
  MidtransWebhookDto,
  PaymentProviderType,
  UpdatePaymentConfigDto,
} from './dto/payments.dto';
import { MidtransProvider } from './providers/midtrans.provider';

const CONFIG_KEY_ENABLED = 'PAYMENT_GATEWAY_ENABLED';
const CONFIG_KEY_PROVIDER = 'PAYMENT_GATEWAY_PROVIDER';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly midtransProvider: MidtransProvider,
  ) {}

  async getPaymentConfig() {
    const rows = await this.prisma.systemConfig.findMany({
      where: { key: { in: [CONFIG_KEY_ENABLED, CONFIG_KEY_PROVIDER] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const envEnabled =
      this.configService.get<string>(CONFIG_KEY_ENABLED) !== 'false';
    const enabledVal = map.get(CONFIG_KEY_ENABLED);
    const gatewayEnabled =
      enabledVal !== undefined ? enabledVal === 'true' : envEnabled;

    const provider = ((map.get(CONFIG_KEY_PROVIDER) ||
      this.configService.get<string>(CONFIG_KEY_PROVIDER) ||
      'MIDTRANS') as PaymentProviderType);

    const isProduction =
      this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    const clientKey =
      gatewayEnabled && provider === 'MIDTRANS'
        ? this.configService.get<string>('MIDTRANS_CLIENT_KEY') || null
        : null;

    return {
      gatewayEnabled,
      provider,
      isProduction,
      midtransClientKey: clientKey,
    };
  }

  async updatePaymentConfig(
    dto: UpdatePaymentConfigDto,
    actor: AuthenticatedUser,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.systemConfig.upsert({
        where: { key: CONFIG_KEY_ENABLED },
        update: { value: String(dto.gatewayEnabled), updatedById: actor.id },
        create: {
          key: CONFIG_KEY_ENABLED,
          value: String(dto.gatewayEnabled),
          updatedById: actor.id,
        },
      });
      await tx.systemConfig.upsert({
        where: { key: CONFIG_KEY_PROVIDER },
        update: { value: dto.provider, updatedById: actor.id },
        create: {
          key: CONFIG_KEY_PROVIDER,
          value: dto.provider,
          updatedById: actor.id,
        },
      });
      await this.auditLog.record({
        actorId: actor.id,
        action: 'PAYMENT_CONFIG_UPDATED',
        entityName: 'system_configs',
        entityId: CONFIG_KEY_ENABLED,
        afterData: dto,
        tx,
      });
    });

    return this.getPaymentConfig();
  }

  async checkout(
    dto: CheckoutPaymentDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const config = await this.getPaymentConfig();
    if (!config.gatewayEnabled || config.provider !== 'MIDTRANS') {
      throw new BadRequestException(
        'Online payment gateway is currently disabled. Please use official Bank Papua transfer or Bendahara desk.',
      );
    }

    const { portId, amountIdr, itemName } = await this.resolvePayableTarget(
      dto,
      scope,
    );

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orderId = `PORTA-${dto.targetType}-${dto.targetId}-${suffix}`;
    const idempotencyKey = `GW-${orderId}`;

    const snap = await this.midtransProvider.createSnapSession({
      orderId,
      amountIdr,
      customerName: actor.fullName,
      customerEmail: actor.email,
      itemName,
    });

    const txRecord = await this.prisma.paymentGatewayTransaction.create({
      data: {
        orderId,
        provider: config.provider,
        targetType: dto.targetType,
        targetId: dto.targetId,
        portId,
        amountIdr,
        snapToken: snap.snapToken,
        redirectUrl: snap.redirectUrl,
        status: 'PENDING',
        idempotencyKey,
        createdById: actor.id,
      },
    });

    return {
      orderId: txRecord.orderId,
      provider: txRecord.provider,
      amountIdr: DecimalUtil.toNumber(txRecord.amountIdr),
      snapToken: txRecord.snapToken,
      redirectUrl: txRecord.redirectUrl,
    };
  }

  private async resolvePayableTarget(
    dto: CheckoutPaymentDto,
    scope: ScopeFilter,
  ): Promise<{ portId: number; amountIdr: number; itemName: string }> {
    if (dto.targetType === 'INVOICE') {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.targetId },
        include: { payments: { where: { isVerified: true } } },
      });
      if (!invoice) throw new NotFoundException(`Invoice #${dto.targetId} not found`);
      if (scope.operatorId && invoice.operatorId !== scope.operatorId) {
        throw new ForbiddenException('Cross-operator access denied');
      }
      if (scope.tenantId) {
        throw new ForbiddenException('Tenants cannot pay ship invoices');
      }
      if (
        invoice.status !== InvoiceStatus.ISSUED &&
        invoice.status !== InvoiceStatus.PARTIAL
      ) {
        throw new BadRequestException(`Invoice #${dto.targetId} is ${invoice.status}`);
      }
      const paid = invoice.payments.reduce(
        (sum, p) => sum + DecimalUtil.toNumber(p.amountIdr),
        0,
      );
      const remaining = DecimalUtil.roundIdr(
        Math.max(0, DecimalUtil.toNumber(invoice.totalAmountIdr) - paid),
      );
      if (remaining <= 0) {
        throw new BadRequestException('Invoice is already fully paid');
      }
      return {
        portId: invoice.portId,
        amountIdr: remaining,
        itemName: `Retribusi ${invoice.invoiceNumber}`,
      };
    }

    if (dto.targetType === 'ASSET_LEASE') {
      const lease = await this.prisma.assetLease.findUnique({
        where: { id: dto.targetId },
        include: { payments: true, asset: true },
      });
      if (!lease) throw new NotFoundException(`AssetLease #${dto.targetId} not found`);
      if (scope.tenantId && lease.tenantId !== scope.tenantId) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
      if (lease.status !== LeaseStatus.ACTIVE) {
        throw new BadRequestException(`Lease #${dto.targetId} is ${lease.status}`);
      }
      const paid = lease.payments.reduce(
        (sum, p) => sum + DecimalUtil.toNumber(p.amountIdr),
        0,
      );
      const remaining = DecimalUtil.roundIdr(
        Math.max(0, DecimalUtil.toNumber(lease.totalAnnualAmountIdr) - paid),
      );
      if (remaining <= 0) {
        throw new BadRequestException('Lease is already paid for current term');
      }
      return {
        portId: lease.portId,
        amountIdr: remaining,
        itemName: `Sewa ${lease.contractNumber}`,
      };
    }

    const util = await this.prisma.utilityMeterReading.findUnique({
      where: { id: dto.targetId },
    });
    if (!util) throw new NotFoundException(`Utility #${dto.targetId} not found`);
    if (scope.tenantId) {
      const hasLease = util.assetId
        ? await this.prisma.assetLease.findFirst({
            where: { tenantId: scope.tenantId, assetId: util.assetId },
          })
        : null;
      if (!hasLease) throw new ForbiddenException('Cross-tenant access denied');
    }
    if (util.paymentStatus === ChargePaymentStatus.PAID) {
      throw new BadRequestException('Utility charge is already PAID');
    }
    return {
      portId: util.portId,
      amountIdr: DecimalUtil.roundIdr(DecimalUtil.toNumber(util.totalAmountIdr)),
      itemName: `Utilitas ${util.readingNumber}`,
    };
  }

  async handleMidtransWebhook(dto: MidtransWebhookDto) {
    const valid = this.midtransProvider.verifyWebhookSignature(
      dto.order_id,
      dto.status_code,
      dto.gross_amount,
      dto.signature_key,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid Midtrans webhook signature');
    }

    const txRecord = await this.prisma.paymentGatewayTransaction.findUnique({
      where: { orderId: dto.order_id },
    });
    if (!txRecord) {
      throw new NotFoundException(`Gateway transaction ${dto.order_id} not found`);
    }

    if (Number(dto.gross_amount) !== DecimalUtil.toNumber(txRecord.amountIdr)) {
      throw new BadRequestException('Webhook gross_amount mismatch');
    }

    if (txRecord.status === 'SETTLEMENT') {
      return { status: 'already_settled', orderId: txRecord.orderId };
    }

    const isSuccess =
      dto.transaction_status === 'settlement' ||
      (dto.transaction_status === 'capture' && dto.fraud_status !== 'challenge');

    if (!isSuccess) {
      const nextStatus =
        dto.transaction_status === 'expire'
          ? 'EXPIRE'
          : dto.transaction_status === 'cancel'
          ? 'CANCEL'
          : dto.transaction_status === 'deny'
          ? 'FAILED'
          : 'PENDING';

      await this.prisma.paymentGatewayTransaction.update({
        where: { id: txRecord.id },
        data: { status: nextStatus },
      });
      return { status: nextStatus, orderId: txRecord.orderId };
    }

    return this.prisma.$transaction(async (tx) => {
      const paidAt = new Date();
      await tx.paymentGatewayTransaction.update({
        where: { id: txRecord.id },
        data: { status: 'SETTLEMENT', paidAt },
      });

      if (txRecord.targetType === 'INVOICE') {
        const method =
          dto.payment_type === 'qris' ? PaymentMethod.QRIS : PaymentMethod.VA;
        await tx.payment.create({
          data: {
            invoiceId: txRecord.targetId,
            idempotencyKey: txRecord.idempotencyKey,
            amountIdr: txRecord.amountIdr,
            method,
            referenceNo: txRecord.orderId,
            paidAt,
            isVerified: true,
            verifiedAt: paidAt,
          },
        });
        await tx.invoice.update({
          where: { id: txRecord.targetId },
          data: { status: InvoiceStatus.PAID },
        });
      } else if (txRecord.targetType === 'ASSET_LEASE') {
        await tx.assetLeasePayment.create({
          data: {
            leaseId: txRecord.targetId,
            idempotencyKey: txRecord.idempotencyKey,
            periodYear: paidAt.getUTCFullYear(),
            amountIdr: txRecord.amountIdr,
            paidAt,
          },
        });
      } else if (txRecord.targetType === 'UTILITY_READING') {
        await tx.utilityMeterReading.update({
          where: { id: txRecord.targetId },
          data: {
            paymentStatus: ChargePaymentStatus.PAID,
            idempotencyKey: txRecord.idempotencyKey,
            paidAt,
          },
        });
      }

      await this.auditLog.record({
        actorId: txRecord.createdById,
        action: 'GATEWAY_PAYMENT_SETTLED',
        entityName: 'payment_gateway_transactions',
        entityId: txRecord.id,
        afterData: {
          orderId: txRecord.orderId,
          targetType: txRecord.targetType,
          targetId: txRecord.targetId,
          amountIdr: txRecord.amountIdr,
        },
        tx,
      });

      return { status: 'SETTLEMENT', orderId: txRecord.orderId };
    });
  }
}
