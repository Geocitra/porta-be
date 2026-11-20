import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingEligibility, LeaseStatus, PortAssetStatus, VerificationStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import {
  CreateAssetLeaseDto,
  CreateMasterTenantDto,
  CreatePortAssetDto,
  RecordLeasePaymentDto,
  RejectAssetLeaseDto,
  RequestAssetLeaseDto,
  UpdateMasterTenantDto,
  UpdatePortAssetDto,
  UploadTenantDocumentDto,
  VerifyTenantDto,
} from './dto/assets-leases.dto';

@Injectable()
export class AssetsLeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
  ) {}

  listTenants() {
    return this.prisma.tenant.findMany({
      where: { isActive: true },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  createMasterTenant(dto: CreateMasterTenantDto) {
    return this.prisma.tenant.create({
      data: {
        ...dto,
        verificationStatus: VerificationStatus.VERIFIED,
      },
      include: { documents: true },
    });
  }

  async updateMasterTenant(tenantId: number, dto: UpdateMasterTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) throw new NotFoundException(`Tenant #${tenantId} not found`);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: dto,
      include: { documents: true },
    });
  }

  async getMyTenantProfile(actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new ForbiddenException('Account is not linked to any tenant profile');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      include: { documents: true },
    });
    if (!tenant) throw new NotFoundException('Tenant profile not found');
    return tenant;
  }

  async uploadTenantDocument(
    dto: UploadTenantDocumentDto,
    file: UploadedFilePayload,
    actor: AuthenticatedUser,
  ) {
    if (!actor.tenantId) {
      throw new ForbiddenException('Account is not linked to any tenant profile');
    }
    if (!file) throw new BadRequestException('Document file is required');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant #${actor.tenantId} not found`);

    const filePath = await this.storage.saveFile(`tenants/${actor.tenantId}`, file);

    return this.prisma.document.create({
      data: {
        tenantId: actor.tenantId,
        category: dto.category,
        documentNumber: dto.documentNumber,
        filePath,
        fileName: file.originalname,
        mimeType: file.mimetype,
        uploadedById: actor.id,
        notes: dto.notes,
      },
    });
  }

  async verifyTenant(tenantId: number, dto: VerifyTenantDto, actor: AuthenticatedUser) {
    if (
      dto.verificationStatus !== VerificationStatus.VERIFIED &&
      dto.verificationStatus !== VerificationStatus.REJECTED
    ) {
      throw new BadRequestException('verificationStatus must be VERIFIED or REJECTED');
    }

    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) throw new NotFoundException(`Tenant #${tenantId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          verificationStatus: dto.verificationStatus,
          rejectionReason:
            dto.verificationStatus === VerificationStatus.REJECTED
              ? dto.rejectionReason ?? 'Dokumen legalitas ditolak'
              : null,
          verifiedAt: new Date(),
          verifiedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: `TENANT_${dto.verificationStatus}`,
        entityName: 'tenants',
        entityId: tenantId,
        beforeData: { verificationStatus: existing.verificationStatus },
        afterData: { verificationStatus: updated.verificationStatus },
        tx,
      });

      return updated;
    });
  }

  listAssets(scope: ScopeFilter) {
    return this.prisma.portAsset.findMany({
      where: {
        isActive: true,
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      orderBy: { assetCode: 'asc' },
    });
  }

  async createAsset(
    dto: CreatePortAssetDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.portAsset.create({ data: dto });
      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: asset.portId,
        action: 'PORT_ASSET_CREATED',
        entityName: 'port_assets',
        entityId: asset.id,
        afterData: asset,
        tx,
      });
      return asset;
    });
  }

  async updateAsset(
    assetId: number,
    dto: UpdatePortAssetDto,
    actor: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    const existing = await this.prisma.portAsset.findUnique({ where: { id: assetId } });
    if (!existing) throw new NotFoundException(`Asset #${assetId} not found`);
    if (scope?.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.portAsset.update({
        where: { id: assetId },
        data: dto,
      });
      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: 'PORT_ASSET_UPDATED',
        entityName: 'port_assets',
        entityId: assetId,
        beforeData: existing,
        afterData: updated,
        tx,
      });
      return updated;
    });
  }

  listLeases(scope: ScopeFilter) {
    return this.prisma.assetLease.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      },
      include: { asset: true, payments: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestLease(
    dto: RequestAssetLeaseDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!scope.tenantId) {
      throw new ForbiddenException('Only tenant accounts can submit lease requests');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: scope.tenantId } });
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Tenant profile not found or inactive');
    }
    if (tenant.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Akun tenant harus berstatus VERIFIED oleh Admin Pelabuhan sebelum mengajukan sewa aset',
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    const asset = await this.prisma.portAsset.findUnique({ where: { id: dto.assetId } });
    if (!asset || !asset.isActive) {
      throw new NotFoundException(`PortAsset #${dto.assetId} not found or inactive`);
    }
    const activeLeaseSameTenant = await this.prisma.assetLease.findFirst({
      where: {
        assetId: asset.id,
        tenantId: tenant.id,
        status: LeaseStatus.ACTIVE,
      },
    });
    const isValidRenewal =
      asset.status === PortAssetStatus.LEASED &&
      Boolean(activeLeaseSameTenant) &&
      startDate >= new Date(activeLeaseSameTenant!.endDate);

    if (asset.status !== PortAssetStatus.AVAILABLE && !isValidRenewal) {
      throw new ConflictException(`Asset ${asset.assetCode} is not AVAILABLE`);
    }
    if (asset.billingEligibility !== BillingEligibility.BILLABLE) {
      throw new BadRequestException(
        `Asset ${asset.assetCode} is ${asset.billingEligibility} and cannot be leased under Pemda billing`,
      );
    }

    const existingPending = await this.prisma.assetLease.findFirst({
      where: {
        assetId: asset.id,
        tenantId: tenant.id,
        status: LeaseStatus.REQUESTED,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        `Anda sudah memiliki pengajuan sewa yang menunggu persetujuan untuk aset ${asset.assetCode}`,
      );
    }

    const totalAnnualAmountIdr = DecimalUtil.roundIdr(
      DecimalUtil.toNumber(asset.areaSqm) * DecimalUtil.toNumber(asset.annualRatePerSqmIdr),
    );
    const contractNumber = DocNumberUtil.generate('PKS-REQ', asset.portId);

    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.assetLease.create({
        data: {
          contractNumber,
          portId: asset.portId,
          assetId: asset.id,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantNpwp: tenant.npwp,
          tenantPhone: tenant.phone,
          startDate,
          endDate,
          totalAnnualAmountIdr,
          status: LeaseStatus.REQUESTED,
          createdById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'ASSET_LEASE_REQUESTED',
        entityName: 'asset_leases',
        entityId: lease.id,
        afterData: lease,
        tx,
      });

      return lease;
    });
  }

  async approveLeaseRequest(
    leaseId: number,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const lease = await this.prisma.assetLease.findUnique({
      where: { id: leaseId },
      include: { asset: true },
    });
    if (!lease) throw new NotFoundException(`AssetLease #${leaseId} not found`);
    if (scope.portId && lease.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (lease.status !== LeaseStatus.REQUESTED) {
      throw new BadRequestException(`Only REQUESTED leases can be approved (current: ${lease.status})`);
    }

    const contractNumber = DocNumberUtil.generate('PKS', lease.portId);

    return this.prisma.$transaction(async (tx) => {
      const hasSameTenantActive = lease.tenantId
        ? await tx.assetLease.findFirst({
            where: {
              assetId: lease.assetId,
              tenantId: lease.tenantId,
              status: LeaseStatus.ACTIVE,
            },
          })
        : null;

      if (!hasSameTenantActive) {
        const claimedAsset = await tx.portAsset.updateMany({
          where: { id: lease.assetId, status: PortAssetStatus.AVAILABLE },
          data: { status: PortAssetStatus.LEASED },
        });
        if (claimedAsset.count === 0) {
          throw new ConflictException(`Asset ${lease.asset.assetCode} is no longer AVAILABLE`);
        }
      }

      const updatedLease = await tx.assetLease.updateMany({
        where: { id: leaseId, status: LeaseStatus.REQUESTED },
        data: {
          status: LeaseStatus.ACTIVE,
          contractNumber,
        },
      });
      if (updatedLease.count === 0) {
        throw new ConflictException(`Lease #${leaseId} status changed concurrently`);
      }

      const result = await tx.assetLease.findUnique({ where: { id: leaseId } });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'ASSET_LEASE_APPROVED',
        entityName: 'asset_leases',
        entityId: leaseId,
        beforeData: { status: LeaseStatus.REQUESTED },
        afterData: result,
        tx,
      });

      return result;
    });
  }

  async rejectLeaseRequest(
    leaseId: number,
    dto: RejectAssetLeaseDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const lease = await this.prisma.assetLease.findUnique({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException(`AssetLease #${leaseId} not found`);
    if (scope.portId && lease.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetLease.updateMany({
        where: { id: leaseId, status: LeaseStatus.REQUESTED },
        data: {
          status: LeaseStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException(`Only REQUESTED leases can be rejected (current: ${lease.status})`);
      }

      const result = await tx.assetLease.findUnique({ where: { id: leaseId } });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'ASSET_LEASE_REJECTED',
        entityName: 'asset_leases',
        entityId: leaseId,
        beforeData: { status: LeaseStatus.REQUESTED },
        afterData: { status: LeaseStatus.REJECTED, rejectionReason: dto.rejectionReason },
        tx,
      });

      return result;
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
          tenantId: dto.tenantId ?? null,
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

