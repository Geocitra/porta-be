import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingEligibility, LeaseStatus, PortAssetStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import {
  CreateAssetLeaseDto,
  CreatePortAssetDto,
  RecordLeasePaymentDto,
} from './dto/assets-leases.dto';

@Injectable()
export class AssetsLeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listAssets(scope: ScopeFilter) {
    return this.prisma.portAsset.findMany({
      where: {
        isActive: true,
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      orderBy: { assetCode: 'asc' },
    });
  }

  async createAsset(dto: CreatePortAssetDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.portAsset.create({ data: dto });
      await this.auditLog.record({
        actorId: actor.id,
        action: 'PORT_ASSET_CREATED',
        entityName: 'port_assets',
        entityId: asset.id,
        afterData: asset,
        tx,
      });
      return asset;
    });
  }

  listLeases(scope: ScopeFilter) {
    return this.prisma.assetLease.findMany({
      where: { ...(scope.portId ? { portId: scope.portId } : {}) },
      include: { asset: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAndActivateLease(
    dto: CreateAssetLeaseDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    const asset = await this.prisma.portAsset.findUnique({ where: { id: dto.assetId } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException(`PortAsset #${dto.assetId} not found or inactive`);
    }
    if (scope.portId && asset.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (asset.billingEligibility !== BillingEligibility.BILLABLE) {
      throw new BadRequestException(
        `Asset ${asset.assetCode} is ${asset.billingEligibility} and cannot be leased under Pemda billing`,
      );
    }

    const totalAnnualAmountIdr = DecimalUtil.roundIdr(
      DecimalUtil.toNumber(asset.areaSqm) * DecimalUtil.toNumber(asset.annualRatePerSqmIdr),
    );
    const contractNumber = DocNumberUtil.generate('PKS', asset.portId);

    return this.prisma.$transaction(async (tx) => {
      // Optimistic Locking: prevent two tenants from leasing the same asset concurrently
      const claimed = await tx.portAsset.updateMany({
        where: { id: asset.id, status: PortAssetStatus.AVAILABLE },
        data: { status: PortAssetStatus.LEASED },
      });
      if (claimed.count === 0) {
        throw new ConflictException(`Asset ${asset.assetCode} is not AVAILABLE (currently ${asset.status})`);
      }

      const lease = await tx.assetLease.create({
        data: {
          contractNumber,
          portId: asset.portId,
          assetId: asset.id,
          tenantName: dto.tenantName,
          tenantNpwp: dto.tenantNpwp,
          tenantPhone: dto.tenantPhone,
          startDate,
          endDate,
          totalAnnualAmountIdr,
          status: LeaseStatus.ACTIVE,
          createdById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'ASSET_LEASE_ACTIVATED',
        entityName: 'asset_leases',
        entityId: lease.id,
        afterData: lease,
        tx,
      });

      return lease;
    });
  }

  async recordLeasePayment(
    leaseId: number,
    dto: RecordLeasePaymentDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const duplicate = await this.prisma.assetLeasePayment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) return duplicate;

    const lease = await this.prisma.assetLease.findUnique({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException(`AssetLease #${leaseId} not found`);
    if (scope.portId && lease.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(`Cannot record payment for ${lease.status} lease`);
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.assetLeasePayment.create({
        data: {
          leaseId,
          idempotencyKey: dto.idempotencyKey,
          periodYear: dto.periodYear,
          amountIdr: dto.amountIdr,
          paidAt: new Date(dto.paidAt),
          verifiedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'ASSET_LEASE_PAYMENT_RECORDED',
        entityName: 'asset_lease_payments',
        entityId: payment.id,
        afterData: payment,
        tx,
      });

      return payment;
    });
  }
}

