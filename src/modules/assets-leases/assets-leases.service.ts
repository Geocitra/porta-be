import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BillingEligibility,
  LeaseStatus,
  NotificationPriority,
  PortAssetStatus,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
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

export const ASSET_LEASE_REQUESTED_EVENT = 'asset_lease.requested';

export interface AssetLeaseRequestedEvent {
  leaseId: number;
  contractNumber: string;
  portId: number;
  assetId: number;
  assetName: string;
  tenantName: string;
  actorId: number;
}

@Injectable()
export class AssetsLeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
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

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
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

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: 'TENANT_DOCUMENT_UPLOADED',
        entityName: 'documents',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });

    this.eventEmitter.emit('document.uploaded', {
      documentId: doc.id,
      category: doc.category,
      tenantId: actor.tenantId,
      uploadedById: actor.id,
      portId: actor.portId,
    });

    return doc;
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
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
      },
      include: {
        asset: true,
        payments: true,
        tenant: true,
        operator: true,
        verifiedByRoomOfficer: { select: { id: true, fullName: true, role: true } },
        verifiedByHeadOfPort: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestLease(
    dto: RequestAssetLeaseDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    let tenantId: number | null = null;
    let operatorId: number | null = null;
    let applicantName = '';
    let applicantNpwp: string | null = null;
    let applicantPhone: string | null = null;

    if (actor.role === UserRole.OPERATOR_KAPAL || scope.operatorId) {
      const opId = scope.operatorId ?? actor.operatorId;
      if (!opId) {
        throw new ForbiddenException('Akun operator kapal tidak terhubung dengan profil operator');
      }
      const operator = await this.prisma.shipOperator.findUnique({ where: { id: opId } });
      if (!operator || !operator.isActive) {
        throw new NotFoundException('Profil operator kapal tidak ditemukan atau tidak aktif');
      }
      if (operator.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          'Akun operator kapal harus berstatus VERIFIED oleh Admin Pelabuhan sebelum mengajukan sewa ruangan',
        );
      }
      operatorId = operator.id;
      applicantName = operator.name;
      applicantNpwp = operator.npwp ?? null;
      applicantPhone = operator.phone ?? null;
    } else if (scope.tenantId || actor.tenantId) {
      const tId = scope.tenantId ?? actor.tenantId;
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tId! } });
      if (!tenant || !tenant.isActive) {
        throw new NotFoundException('Tenant profile not found or inactive');
      }
      if (tenant.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          'Akun tenant harus berstatus VERIFIED oleh Admin Pelabuhan sebelum mengajukan sewa aset',
        );
      }
      tenantId = tenant.id;
      applicantName = tenant.name;
      applicantNpwp = tenant.npwp ?? null;
      applicantPhone = tenant.phone ?? null;
    } else {
      throw new ForbiddenException(
        'Hanya akun Tenant atau Operator Kapal yang dapat mengajukan sewa ruangan/aset',
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

    const activeLeaseSameApplicant = await this.prisma.assetLease.findFirst({
      where: {
        assetId: asset.id,
        ...(tenantId ? { tenantId } : { operatorId: operatorId! }),
        status: LeaseStatus.ACTIVE,
      },
    });
    const isValidRenewal =
      asset.status === PortAssetStatus.LEASED &&
      Boolean(activeLeaseSameApplicant) &&
      startDate >= new Date(activeLeaseSameApplicant!.endDate);

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
        ...(tenantId ? { tenantId } : { operatorId: operatorId! }),
        status: { in: [LeaseStatus.REQUESTED, LeaseStatus.PENDING_ROOM_OFFICER, LeaseStatus.PENDING_HEAD_OF_PORT] },
      },
    });
    if (existingPending) {
      throw new ConflictException(
        `Anda sudah memiliki pengajuan sewa yang sedang diproses untuk aset ${asset.assetCode}`,
      );
    }

    const totalAnnualAmountIdr = DecimalUtil.roundIdr(
      DecimalUtil.toNumber(asset.areaSqm) * DecimalUtil.toNumber(asset.annualRatePerSqmIdr),
    );
    // Request tracking code
    const contractNumber = DocNumberUtil.generate('REQ-SWA', asset.portId);

    const createdLease = await this.prisma.$transaction(async (tx) => {
      const lease = await tx.assetLease.create({
        data: {
          contractNumber,
          portId: asset.portId,
          assetId: asset.id,
          tenantId,
          operatorId,
          tenantName: applicantName,
          tenantNpwp: applicantNpwp,
          tenantPhone: applicantPhone,
          startDate,
          endDate,
          totalAnnualAmountIdr,
          status: LeaseStatus.REQUESTED,
          createdById: actor.id,
        },
        include: {
          asset: true,
          tenant: true,
          operator: true,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: asset.portId,
        action: 'ASSET_LEASE_REQUESTED',
        entityName: 'asset_leases',
        entityId: lease.id,
        afterData: lease,
        tx,
      });

      return lease;
    });

    this.eventEmitter.emit(ASSET_LEASE_REQUESTED_EVENT, {
      leaseId: createdLease.id,
      contractNumber: createdLease.contractNumber,
      portId: createdLease.portId,
      assetId: createdLease.assetId,
      assetName: asset.name,
      tenantName: createdLease.tenantName,
      actorId: actor.id,
    } satisfies AssetLeaseRequestedEvent);

    return createdLease;
  }

  async verifyRoomOfficer(
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
    if (
      lease.status !== LeaseStatus.REQUESTED &&
      lease.status !== LeaseStatus.PENDING_ROOM_OFFICER
    ) {
      throw new BadRequestException(
        `Hanya pengajuan berstatus REQUESTED yang dapat diverifikasi oleh Petugas Ruangan (status: ${lease.status})`,
      );
    }

    // Saat diverifikasi oleh Petugas Ruangan, nomor PKS-SWA resmi di-generate
    const contractNumber = DocNumberUtil.generate('PKS-SWA', lease.portId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetLease.update({
        where: { id: leaseId },
        data: {
          contractNumber,
          status: LeaseStatus.PENDING_HEAD_OF_PORT,
          verifiedByRoomOfficerId: actor.id,
          verifiedByRoomOfficerAt: new Date(),
        },
        include: {
          asset: true,
          tenant: true,
          operator: true,
          verifiedByRoomOfficer: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: lease.portId,
        action: 'ASSET_LEASE_VERIFIED_ROOM_OFFICER',
        entityName: 'asset_leases',
        entityId: leaseId,
        beforeData: { status: lease.status },
        afterData: updated,
        tx,
      });

      if (lease.createdById) {
        await tx.notification.create({
          data: {
            userId: lease.createdById,
            portId: lease.portId,
            title: 'Verifikasi Fisik Ruang Usaha Disetujui',
            message: `Permohonan sewa tempat ${updated.asset?.name || ''} telah diverifikasi oleh Petugas Ruangan dan diteruskan ke Kepala Pelabuhan.`,
            type: 'LEASE_VERIFIED',
            category: 'LEASE',
            priority: NotificationPriority.INFORMATIONAL,
            linkUrl: lease.operatorId ? '/kapal/kontrak-sewa' : '/tenant/kontrak',
          },
        });
      }

      return updated;
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
    if (
      lease.status !== LeaseStatus.PENDING_HEAD_OF_PORT &&
      lease.status !== LeaseStatus.REQUESTED
    ) {
      throw new BadRequestException(
        `Pengajuan sewa harus menunggu verifikasi Kepala Pelabuhan (status saat ini: ${lease.status})`,
      );
    }

    const contractNumber =
      lease.contractNumber && lease.contractNumber.startsWith('PKS-SWA')
        ? lease.contractNumber
        : DocNumberUtil.generate('PKS-SWA', lease.portId);

    return this.prisma.$transaction(async (tx) => {
      const hasSameApplicantActive = lease.tenantId
        ? await tx.assetLease.findFirst({
            where: {
              assetId: lease.assetId,
              tenantId: lease.tenantId,
              status: LeaseStatus.ACTIVE,
            },
          })
        : lease.operatorId
        ? await tx.assetLease.findFirst({
            where: {
              assetId: lease.assetId,
              operatorId: lease.operatorId,
              status: LeaseStatus.ACTIVE,
            },
          })
        : null;

      if (!hasSameApplicantActive) {
        const claimedAsset = await tx.portAsset.updateMany({
          where: { id: lease.assetId, status: PortAssetStatus.AVAILABLE },
          data: { status: PortAssetStatus.LEASED },
        });
        if (claimedAsset.count === 0) {
          throw new ConflictException(`Asset ${lease.asset.assetCode} is no longer AVAILABLE`);
        }
      }

      const updated = await tx.assetLease.update({
        where: { id: leaseId },
        data: {
          status: LeaseStatus.ACTIVE,
          contractNumber,
          verifiedByHeadOfPortId: actor.id,
          verifiedByHeadOfPortAt: new Date(),
        },
        include: {
          asset: true,
          tenant: true,
          operator: true,
          verifiedByRoomOfficer: { select: { id: true, fullName: true, role: true } },
          verifiedByHeadOfPort: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: lease.portId,
        action: 'ASSET_LEASE_APPROVED_HEAD_OF_PORT',
        entityName: 'asset_leases',
        entityId: leaseId,
        beforeData: { status: lease.status },
        afterData: updated,
        tx,
      });

      if (lease.createdById) {
        await tx.notification.create({
          data: {
            userId: lease.createdById,
            portId: lease.portId,
            title: 'Kontrak PKS Sewa Tempat Disetujui & Terbit',
            message: `Selamat! Pengajuan sewa aset ${updated.asset?.name || ''} telah disahkan Kepala Pelabuhan (No. ${contractNumber}). Silakan lakukan pembayaran retribusi.`,
            type: 'LEASE_APPROVED',
            category: 'LEASE',
            priority: NotificationPriority.URGENT,
            linkUrl: lease.operatorId ? '/kapal/penagihan' : '/tenant/tagihan',
          },
        });
      }

      return updated;
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

    const rejectableStatuses: LeaseStatus[] = [
      LeaseStatus.REQUESTED,
      LeaseStatus.PENDING_ROOM_OFFICER,
      LeaseStatus.PENDING_HEAD_OF_PORT,
    ];
    if (!rejectableStatuses.includes(lease.status)) {
      throw new BadRequestException(
        `Hanya pengajuan berstatus pending/verifikasi yang dapat ditolak (status: ${lease.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetLease.update({
        where: { id: leaseId },
        data: {
          status: LeaseStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
        },
        include: {
          asset: true,
          tenant: true,
          operator: true,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: lease.portId,
        action: 'ASSET_LEASE_REJECTED',
        entityName: 'asset_leases',
        entityId: leaseId,
        beforeData: { status: lease.status },
        afterData: { status: LeaseStatus.REJECTED, rejectionReason: dto.rejectionReason },
        reason: dto.rejectionReason,
        tx,
      });

      if (lease.createdById) {
        await tx.notification.create({
          data: {
            userId: lease.createdById,
            portId: lease.portId,
            title: 'Pengajuan Sewa Tempat Ditolak',
            message: `Permohonan sewa tempat ${updated.asset?.name || ''} belum disetujui. Alasan: ${dto.rejectionReason}`,
            type: 'LEASE_REJECTED',
            category: 'LEASE',
            priority: NotificationPriority.WARNING,
            linkUrl: lease.operatorId ? '/kapal/sewa-ruangan' : '/tenant/sewa',
          },
        });
      }

      return updated;
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

      if (lease.createdById) {
        await tx.notification.create({
          data: {
            userId: lease.createdById,
            portId: lease.portId,
            title: 'Pembayaran Sewa PKS Berhasil Diverifikasi',
            message: `Pembayaran sewa ${lease.contractNumber} Tahun ${payment.periodYear} sebesar Rp ${Number(payment.amountIdr).toLocaleString('id-ID')} telah disetorkan ke Kasda. Kuitansi e-SSRD resmi telah terbit.`,
            type: 'PAYMENT_VERIFIED',
            category: 'BILLING',
            priority: NotificationPriority.INFORMATIONAL,
            linkUrl: '/tenant/tagihan',
          },
        });
      }

      return payment;
    });
  }

  async getLeasePaymentReceipt(paymentId: number, scope: ScopeFilter) {
    const payment = await this.prisma.assetLeasePayment.findUnique({
      where: { id: paymentId },
      include: {
        lease: {
          include: {
            port: true,
            asset: true,
            tenant: true,
            operator: true,
          },
        },
        verifiedBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Lease payment #${paymentId} not found`);
    }

    if (scope.portId && payment.lease.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    if (scope.tenantId && payment.lease.tenantId !== scope.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    if (scope.operatorId && payment.lease.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cross-operator access denied');
    }

    const ssrdNumber = `SSRD-PKS-${payment.periodYear}-${String(payment.id).padStart(6, '0')}`;

    return {
      documentTitle: 'SURAT SETORAN RETRIBUSI DAERAH (e-SSRD)',
      subTitle: 'BUKTI PEMBAYARAN RETRIBUSI KEKAYAAN DAERAH (SEWA TANAH/BANGUNAN) SAH',
      ssrdNumber,
      contractNumber: payment.lease.contractNumber,
      paymentDate: payment.paidAt,
      taxPeriod: `Tahun Anggaran ${payment.periodYear}`,
      portName: payment.lease.port.name,
      portLocation: payment.lease.port.location,
      taxPayer: {
        tenantName: payment.lease.tenantName,
        tenantNpwp:
          payment.lease.tenantNpwp ||
          payment.lease.tenant?.npwp ||
          payment.lease.operator?.npwp ||
          '-',
        tenantPhone:
          payment.lease.tenantPhone ||
          payment.lease.tenant?.phone ||
          payment.lease.operator?.phone ||
          '-',
        businessName:
          payment.lease.tenant?.name ||
          payment.lease.operator?.name ||
          payment.lease.tenantName,
        address:
          payment.lease.tenant?.address ||
          payment.lease.operator?.address ||
          '-',
      },
      retributionObject: {
        assetCode: payment.lease.asset.assetCode,
        assetName: payment.lease.asset.name,
        assetType: payment.lease.asset.assetType,
        areaSqm: Number(payment.lease.asset.areaSqm),
        annualRatePerSqmIdr: Number(payment.lease.asset.annualRatePerSqmIdr),
        legalBasis: payment.lease.asset.legalBasis || 'Perda Kab. Mimika No. 4/2023 & Perbup No. 25/2024',
        revenueAccountCode: '4.1.02.02.01 (Retribusi Pemanfaatan Kekayaan Daerah)',
      },
      paymentDetails: {
        totalAnnualContractIdr: Number(payment.lease.totalAnnualAmountIdr),
        periodYear: payment.periodYear,
        amountPaidIdr: Number(payment.amountIdr),
        idempotencyKey: payment.idempotencyKey,
        paymentStatus: 'PAID',
        verifiedByName: payment.verifiedBy?.fullName || 'Bendahara Penerimaan UPTD Pelabuhan',
        verifiedAt: payment.paidAt,
      },
      qrValidationCode: `PORTA-SSRD-VERIFIED:${payment.lease.port.code}:${ssrdNumber}:${payment.idempotencyKey}`,
    };
  }
}

