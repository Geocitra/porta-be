import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ActivityMode,
  BerthApprovalStatus,
  BerthCategory,
  BerthServiceCategory,
  BerthValidationResult,
  BillingEligibility,
  BillingStage,
  ContractStatus,
  InvoiceStatus,
  ServiceCode,
  UserRole,
  VerificationStatus,
  VesselCategory,
  VisitActivityMode,
  VisitOrigin,
  VisitStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import { BILLING_CONSTANTS } from '../../config/billing.constants';
import { TariffResolverService } from '../tariffs/tariff-resolver.service';
import {
  ApproveBerthingOverrideDto,
  CreateVisitDto,
  EndBerthingDto,
  RecordArrivalDto,
  RecordDepartureDto,
  StartBerthingDto,
} from './dto/visits.dto';
import { evaluateBerthCompatibility } from './berth-compatibility.evaluator';
import { assertValidVisitTransition } from './visit-state-machine';

export const VISIT_CREATED_EVENT = 'visit.created';
export const VISIT_APPROVED_EVENT = 'visit.approved';
export const VISIT_ANCHORED_EVENT = 'visit.anchored';
export const BERTHING_STARTED_EVENT = 'berthing.started';
export const VISIT_DEPARTED_EVENT = 'visit.departed';
export const BERTHING_OVERRIDE_REQUESTED_EVENT = 'berthing.override_requested';

export interface VisitLifecycleEvent {
  visitId: number;
  visitNumber: string;
  portId: number;
  vesselId: number;
  vesselName: string;
  vesselCategory: VesselCategory;
  eta: Date;
  etd: Date;
  berthId?: number | null;
  terminalId?: number | null;
  actorId: number;
}

export interface VisitDepartedEvent {
  visitId: number;
  actorId: number;
}

export interface BerthingOverrideRequestedEvent {
  berthingRecordId: number;
  visitId: number;
  visitNumber: string;
  portId: number;
  vesselName: string;
  berthName: string;
  overrideReason: string;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tariffResolver: TariffResolverService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storage: StorageService,
  ) {}

  findAll(scope: ScopeFilter, vesselCategory?: VesselCategory) {
    return this.prisma.shipVisit.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
        ...(vesselCategory ? { vessel: { vesselCategory } } : {}),
      },
      include: {
        port: { select: { id: true, code: true, name: true, portCategory: true } },
        vessel: true,
        operator: { select: { id: true, name: true } },
        berthingRecords: { include: { berth: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: number, scope: ScopeFilter) {
    const visit = await this.prisma.shipVisit.findUnique({
      where: { id },
      include: {
        port: true,
        vessel: true,
        operator: true,
        berthingRecords: { include: { berth: true } },
        invoices: { include: { items: true, payments: true } },
      },
    });

    if (!visit) throw new NotFoundException(`Visit #${id} not found`);
    if (scope.portId && visit.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (scope.operatorId && visit.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cross-operator access denied');
    }
    return visit;
  }

  findPendingBerthingOverrides(scope: ScopeFilter) {
    return this.prisma.berthingRecord.findMany({
      where: {
        approvalStatus: BerthApprovalStatus.PENDING,
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: {
        berth: {
          select: { id: true, code: true, name: true, berthServiceCategory: true },
        },
        visit: {
          select: {
            id: true,
            visitNumber: true,
            vessel: {
              select: { id: true, name: true, registrationNumber: true, vesselCategory: true },
            },
            operator: { select: { id: true, name: true } },
          },
        },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async checkBerthCompatibility(visitId: number, berthId: number, scope: ScopeFilter) {
    const visit = await this.findById(visitId, scope);
    const berth = await this.prisma.berth.findUnique({ where: { id: berthId } });
    if (!berth || !berth.isActive) {
      throw new NotFoundException(`Berth #${berthId} not found or inactive`);
    }
    if (berth.portId !== visit.portId) {
      throw new BadRequestException('Berth does not belong to the same port as the visit');
    }

    const evaluation = evaluateBerthCompatibility({
      portCategory: visit.port.portCategory,
      berthOperationalStatus: berth.operationalStatus,
      berthServiceCategory: berth.berthServiceCategory,
      berthMaxLengthMeters:
        berth.maxLengthMeters != null ? DecimalUtil.toNumber(berth.maxLengthMeters) : null,
      berthMaxDraftMeters:
        berth.maxDraftMeters != null ? DecimalUtil.toNumber(berth.maxDraftMeters) : null,
      berthMaxGrossTonnage:
        berth.maxGrossTonnage != null ? DecimalUtil.toNumber(berth.maxGrossTonnage) : null,
      allowedVesselCategories: berth.allowedVesselCategories,
      allowedShipTypes: berth.allowedShipTypes,
      vesselCategory: visit.vessel.vesselCategory,
      vesselShipType: visit.vessel.shipType,
      vesselLengthMeters:
        visit.vessel.lengthMeters != null ? DecimalUtil.toNumber(visit.vessel.lengthMeters) : null,
      vesselDraftMeters:
        visit.vessel.draftMeters != null ? DecimalUtil.toNumber(visit.vessel.draftMeters) : null,
      vesselGrossTonnage: DecimalUtil.toNumber(visit.vessel.grossTonnage),
    });

    return {
      visitId: visit.id,
      berthId: berth.id,
      portCategory: visit.port.portCategory,
      vesselCategory: visit.vessel.vesselCategory,
      berthServiceCategory: berth.berthServiceCategory,
      ...evaluation,
    };
  }

  async createVisit(dto: CreateVisitDto, user: AuthenticatedUser, scope: ScopeFilter) {
    const eta = new Date(dto.eta);
    const etd = new Date(dto.etd);
    if (etd <= eta) {
      throw new BadRequestException('ETD must be strictly after ETA');
    }

    const vessel = await this.prisma.vessel.findUnique({
      where: { id: dto.vesselId },
      include: {
        operator: true,
        operatorLinks: {
          where: { isActive: true },
          include: { operator: true },
        },
      },
    });
    if (!vessel || !vessel.isActive) {
      throw new NotFoundException(`Vessel #${dto.vesselId} not found or inactive`);
    }

    // Resolve effectiveOperatorId for Many-to-Many Vessel <-> ShipOperator
    const effectiveOperatorId =
      scope.operatorId ??
      dto.operatorId ??
      vessel.operatorId ??
      vessel.operatorLinks?.[0]?.operatorId ??
      null;

    if (!effectiveOperatorId) {
      throw new BadRequestException(
        `Kapal "${vessel.name}" belum ditautkan ke perusahaan pelayaran mana pun. Tentukan operatorId terlebih dahulu.`,
      );
    }

    const matchingLink = vessel.operatorLinks?.find(
      (link) => link.operatorId === effectiveOperatorId && link.isActive,
    );
    const hasLegacyOwnership = vessel.operatorId === effectiveOperatorId;

    if (scope.operatorId && !matchingLink && !hasLegacyOwnership) {
      throw new ForbiddenException(
        `Kapal "${vessel.name}" belum terdaftar pada daftar armada perusahaan Anda. Silakan klaim/tambahkan kapal ini dari Katalog Kapal terlebih dahulu.`,
      );
    }

    const effectiveOperator =
      matchingLink?.operator ??
      (vessel.operator && vessel.operator.id === effectiveOperatorId ? vessel.operator : null) ??
      (await this.prisma.shipOperator.findUnique({ where: { id: effectiveOperatorId } }));

    if (!effectiveOperator || !effectiveOperator.isActive) {
      throw new NotFoundException(
        `Perusahaan Pelayaran #${effectiveOperatorId} tidak ditemukan atau tidak aktif`,
      );
    }

    let activeContractId: number | null = null;

    if (dto.visitOrigin === VisitOrigin.OPERATOR_REQUEST) {
      if (effectiveOperator.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          `Operator "${effectiveOperator.name}" belum diverifikasi oleh Petugas Registrasi / Admin Pelabuhan`,
        );
      }
      if (vessel.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          `Kapal "${vessel.name}" belum diverifikasi (Surat Ukur/GT) oleh Petugas Registrasi / Admin Pelabuhan`,
        );
      }
      if (matchingLink && matchingLink.verificationStatus !== VerificationStatus.VERIFIED) {
        throw new ForbiddenException(
          `Klaim armada kapal "${vessel.name}" oleh "${effectiveOperator.name}" masih berstatus ${matchingLink.verificationStatus}. Tunggu verifikasi Petugas Registrasi terlebih dahulu.`,
        );
      }

      // Gatekeeper: PKS Sandar Kapal (Kontrak Payung) harus aktif dan disetujui Kepala Pelabuhan
      const now = new Date();
      const activeContract = await this.prisma.operatorBerthingContract.findFirst({
        where: {
          operatorId: effectiveOperatorId,
          portId: dto.portId,
          status: ContractStatus.ACTIVE,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeContract) {
        throw new ForbiddenException(
          `Operator "${effectiveOperator.name}" belum memiliki Perjanjian Kerja Sama (PKS Sandar Kapal) yang AKTIF dan disahkan Kepala Pelabuhan untuk pelabuhan ini. Pengajuan warta sandar ditolak sampai PKS Sandar disetujui.`,
        );
      }

      if (
        activeContract.monthlyQuota > 0 &&
        activeContract.usedQuota >= activeContract.monthlyQuota
      ) {
        throw new ForbiddenException(
          `Kuota sandar bulanan pada Kontrak PKS "${activeContract.contractNumber}" telah habis (${activeContract.usedQuota}/${activeContract.monthlyQuota} kunjungan). Silakan ajukan pembaruan kuota kontrak atau kunjungan insidental melalui petugas.`,
        );
      }

      activeContractId = activeContract.id;
    }

    // Early tariff resolution check: skip for transit-only vessels
    if (!dto.isTransitOnly) {
      const labuhServiceCode =
        dto.activityMode === VisitActivityMode.TUKS_TERSUS
          ? ServiceCode.KEGIATAN_TUKS_TERSUS
          : ServiceCode.JASA_LABUH;

      await this.tariffResolver.resolveOrThrow({
        serviceCode: labuhServiceCode,
        shippingCategory: vessel.shippingCategory,
        ...(dto.activityMode === VisitActivityMode.TUKS_TERSUS
          ? {}
          : {
              shipType: vessel.shipType,
              activityMode:
                dto.activityMode === VisitActivityMode.FIXED_ACTIVITY
                  ? ActivityMode.FIXED_ACTIVITY
                  : ActivityMode.NORMAL,
            }),
      });
    }

    const initialStatus =
      dto.visitOrigin === VisitOrigin.OFFICER_INCIDENTAL
        ? VisitStatus.APPROVED
        : VisitStatus.REQUESTED;

    const visitNumber = DocNumberUtil.generate('VST', dto.portId);

    const created = await this.prisma.$transaction(async (tx) => {
      if (activeContractId !== null) {
        await tx.operatorBerthingContract.update({
          where: { id: activeContractId },
          data: { usedQuota: { increment: 1 } },
        });
      }

      const visit = await tx.shipVisit.create({
        data: {
          visitNumber,
          portId: dto.portId,
          vesselId: vessel.id,
          operatorId: effectiveOperatorId,
          berthingContractId: activeContractId,
          visitOrigin: dto.visitOrigin,
          activityMode: dto.activityMode,
          isTransitOnly: dto.isTransitOnly ?? false,
          originPort: dto.originPort,
          destinationPort: dto.destinationPort,
          eta,
          etd,
          status: initialStatus,
          notes: dto.notes,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        portId: visit.portId,
        action: 'VISIT_CREATED',
        entityName: 'ship_visits',
        entityId: visit.id,
        afterData: visit,
        tx,
      });

      return visit;
    });

    this.eventEmitter.emit(VISIT_CREATED_EVENT, {
      visitId: created.id,
      visitNumber: created.visitNumber,
      portId: created.portId,
      vesselId: vessel.id,
      vesselName: vessel.name,
      vesselCategory: vessel.vesselCategory,
      eta: created.eta,
      etd: created.etd,
      actorId: user.id,
    } satisfies VisitLifecycleEvent);

    return created;
  }

  async approveVisit(visitId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    const visit = await this.findById(visitId, scope);
    assertValidVisitTransition(visit.status, VisitStatus.APPROVED);

    const approved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: VisitStatus.REQUESTED },
        data: { status: VisitStatus.APPROVED },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        portId: visit.portId,
        action: 'VISIT_APPROVED',
        entityName: 'ship_visits',
        entityId: visitId,
        beforeData: { status: visit.status },
        afterData: { status: VisitStatus.APPROVED },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });

    this.eventEmitter.emit(VISIT_APPROVED_EVENT, {
      visitId: visit.id,
      visitNumber: visit.visitNumber,
      portId: visit.portId,
      vesselId: visit.vesselId,
      vesselName: visit.vessel.name,
      vesselCategory: visit.vessel.vesselCategory,
      eta: visit.eta,
      etd: visit.etd,
      actorId: user.id,
    } satisfies VisitLifecycleEvent);

    return approved;
  }

  async recordArrival(
    visitId: number,
    dto: RecordArrivalDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);
    assertValidVisitTransition(visit.status, VisitStatus.ANCHORED);

    const ata = new Date(dto.ataAnchorage);

    const anchored = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: VisitStatus.APPROVED },
        data: { status: VisitStatus.ANCHORED, ataAnchorage: ata },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        portId: visit.portId,
        action: 'VISIT_ANCHORED',
        entityName: 'ship_visits',
        entityId: visitId,
        afterData: { ataAnchorage: ata },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });

    this.eventEmitter.emit(VISIT_ANCHORED_EVENT, {
      visitId: visit.id,
      visitNumber: visit.visitNumber,
      portId: visit.portId,
      vesselId: visit.vesselId,
      vesselName: visit.vessel.name,
      vesselCategory: visit.vessel.vesselCategory,
      eta: visit.eta,
      etd: visit.etd,
      actorId: user.id,
    } satisfies VisitLifecycleEvent);

    return anchored;
  }

  async startBerthing(
    visitId: number,
    dto: StartBerthingDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
    evidenceFile?: UploadedFilePayload,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);

    if (
      visit.status !== VisitStatus.APPROVED &&
      visit.status !== VisitStatus.ANCHORED &&
      visit.status !== VisitStatus.BERTHED
    ) {
      throw new BadRequestException(`Cannot start berthing while visit is in status ${visit.status}`);
    }

    const berth = await this.prisma.berth.findUnique({ where: { id: dto.berthId } });
    if (!berth || !berth.isActive) {
      throw new NotFoundException(`Berth #${dto.berthId} not found or inactive`);
    }
    if (berth.portId !== visit.portId) {
      throw new BadRequestException('Berth does not belong to the same port as the visit');
    }

    // Enforce specialized berth officer jurisdiction by BerthServiceCategory
    if (
      user.role === UserRole.PETUGAS_DERMAGA_BARANG &&
      berth.berthServiceCategory === BerthServiceCategory.DERMAGA_PENUMPANG
    ) {
      throw new ForbiddenException(
        `Petugas Dermaga Barang tidak berwenang mengoperasikan Dermaga Khusus Penumpang (${berth.name})`,
      );
    }
    if (
      user.role === UserRole.PETUGAS_DERMAGA_PENUMPANG &&
      berth.berthServiceCategory === BerthServiceCategory.DERMAGA_BARANG
    ) {
      throw new ForbiddenException(
        `Petugas Dermaga Penumpang tidak berwenang mengoperasikan Dermaga Khusus Barang (${berth.name})`,
      );
    }

    // Ensure no open or pending-approval berthing record already exists for this visit
    const openBerthing = await this.prisma.berthingRecord.findFirst({
      where: {
        visitId,
        actualEndAt: null,
        approvalStatus: {
          in: [
            BerthApprovalStatus.AUTO_APPROVED,
            BerthApprovalStatus.APPROVED,
            BerthApprovalStatus.PENDING,
          ],
        },
      },
    });
    if (openBerthing) {
      throw new ConflictException(
        `Visit #${visitId} still has an active or pending berthing record (#${openBerthing.id}). End or resolve it before moving berth.`,
      );
    }

    // 3-Level Hybrid Validation (ALLOW / WARNING + Approval / Hard BLOCK)
    const evaluation = evaluateBerthCompatibility({
      portCategory: visit.port.portCategory,
      berthOperationalStatus: berth.operationalStatus,
      berthServiceCategory: berth.berthServiceCategory,
      berthMaxLengthMeters: berth.maxLengthMeters != null ? DecimalUtil.toNumber(berth.maxLengthMeters) : null,
      berthMaxDraftMeters: berth.maxDraftMeters != null ? DecimalUtil.toNumber(berth.maxDraftMeters) : null,
      berthMaxGrossTonnage: berth.maxGrossTonnage != null ? DecimalUtil.toNumber(berth.maxGrossTonnage) : null,
      allowedVesselCategories: berth.allowedVesselCategories,
      allowedShipTypes: berth.allowedShipTypes,
      vesselCategory: visit.vessel.vesselCategory,
      vesselShipType: visit.vessel.shipType,
      vesselLengthMeters: visit.vessel.lengthMeters != null ? DecimalUtil.toNumber(visit.vessel.lengthMeters) : null,
      vesselDraftMeters: visit.vessel.draftMeters != null ? DecimalUtil.toNumber(visit.vessel.draftMeters) : null,
      vesselGrossTonnage: DecimalUtil.toNumber(visit.vessel.grossTonnage),
    });

    if (evaluation.validationResult === BerthValidationResult.BLOCK) {
      throw new BadRequestException(
        `Penempatan dermaga ditolak (Hard Block): ${evaluation.reasons.join('; ')}`,
      );
    }

    const requiresApproval = evaluation.validationResult === BerthValidationResult.WARNING;
    if (requiresApproval) {
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException(
          `Kategori kapal/dermaga tidak sesuai (${evaluation.reasons.join('; ')}). Wajib mengisi overrideReason untuk pengajuan persetujuan.`,
        );
      }
      if (dto.safetyChecklistVerified !== true) {
        throw new BadRequestException(
          'Pemeriksaan persyaratan keselamatan (safetyChecklistVerified=true) wajib dicentang untuk penempatan dermaga berbeda kategori.',
        );
      }
    }

    // Early tariff check for berth only if verified BILLABLE by Pemda
    if (berth.billingEligibility === BillingEligibility.BILLABLE) {
      const tambatCode =
        dto.berthCategory === BerthCategory.KHUSUS_TUKS
          ? ServiceCode.JASA_TAMBAT_KHUSUS
          : ServiceCode.JASA_TAMBAT_UMUM;

      await this.tariffResolver.resolveOrThrow({
        serviceCode: tambatCode,
        shippingCategory: visit.vessel.shippingCategory,
        berthType: berth.berthType,
      });
    }

    const requestedStartAt = new Date(dto.actualStartAt);
    const evidencePhoto = evidenceFile
      ? await this.storage.saveFile(`berthings/${visitId}`, evidenceFile)
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      if (!requiresApproval && visit.status !== VisitStatus.BERTHED) {
        await tx.shipVisit.update({
          where: { id: visitId },
          data: {
            status: VisitStatus.BERTHED,
            ataAnchorage: visit.ataAnchorage ?? requestedStartAt,
          },
        });
      }

      const record = await tx.berthingRecord.create({
        data: {
          portId: visit.portId,
          visitId: visit.id,
          berthId: berth.id,
          berthCategory: dto.berthCategory,
          plannedStartAt: requiresApproval ? requestedStartAt : null,
          actualStartAt: requiresApproval ? null : requestedStartAt,
          evidencePhoto,
          compatibilityStatus: evaluation.compatibilityStatus,
          validationResult: evaluation.validationResult,
          approvalStatus: requiresApproval
            ? BerthApprovalStatus.PENDING
            : BerthApprovalStatus.AUTO_APPROVED,
          overrideReason: requiresApproval ? dto.overrideReason!.trim() : null,
          safetyChecklistVerified: requiresApproval ? true : true,
          recordedById: user.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: requiresApproval ? 'BERTHING_OVERRIDE_REQUESTED' : 'BERTHING_STARTED',
        entityName: 'berthing_records',
        entityId: record.id,
        afterData: { ...record, compatibilityReasons: evaluation.reasons },
        reason: requiresApproval ? dto.overrideReason!.trim() : undefined,
        tx,
      });

      return record;
    });

    if (requiresApproval) {
      this.eventEmitter.emit(BERTHING_OVERRIDE_REQUESTED_EVENT, {
        berthingRecordId: result.id,
        visitId: visit.id,
        visitNumber: visit.visitNumber,
        portId: visit.portId,
        vesselName: visit.vessel.name,
        berthName: berth.name,
        overrideReason: dto.overrideReason!.trim(),
      } satisfies BerthingOverrideRequestedEvent);
    }

    this.eventEmitter.emit(BERTHING_STARTED_EVENT, {
      visitId: visit.id,
      visitNumber: visit.visitNumber,
      portId: visit.portId,
      vesselId: visit.vesselId,
      vesselName: visit.vessel.name,
      vesselCategory: visit.vessel.vesselCategory,
      eta: visit.eta,
      etd: visit.etd,
      berthId: berth.id,
      terminalId: berth.terminalId,
      actorId: user.id,
    } satisfies VisitLifecycleEvent);

    return result;
  }

  async approveBerthingOverride(
    visitId: number,
    berthingId: number,
    dto: ApproveBerthingOverrideDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);

    const record = await this.prisma.berthingRecord.findUnique({ where: { id: berthingId } });
    if (!record || record.visitId !== visitId) {
      throw new NotFoundException(`BerthingRecord #${berthingId} not found for visit #${visitId}`);
    }
    if (record.approvalStatus !== BerthApprovalStatus.PENDING) {
      throw new ConflictException(
        `BerthingRecord #${berthingId} is already in approvalStatus ${record.approvalStatus}`,
      );
    }

    const now = new Date();
    const isApproved = dto.decision === 'APPROVED';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.berthingRecord.updateMany({
        where: { id: berthingId, approvalStatus: BerthApprovalStatus.PENDING },
        data: {
          approvalStatus: isApproved
            ? BerthApprovalStatus.APPROVED
            : BerthApprovalStatus.REJECTED,
          approvedById: user.id,
          approvedAt: now,
          approvalNotes: dto.approvalNotes,
          ...(isApproved
            ? { actualStartAt: record.plannedStartAt ?? now }
            : { actualEndAt: now }),
        },
      });

      if (updated.count === 0) {
        throw new ConflictException('Berthing override approval status changed concurrently');
      }

      if (isApproved && visit.status !== VisitStatus.BERTHED) {
        const effectiveStart = record.plannedStartAt ?? now;
        await tx.shipVisit.update({
          where: { id: visitId },
          data: {
            status: VisitStatus.BERTHED,
            ataAnchorage: visit.ataAnchorage ?? effectiveStart,
          },
        });
      }

      const refreshed = await tx.berthingRecord.findUnique({ where: { id: berthingId } });

      await this.auditLog.record({
        actorId: user.id,
        action: isApproved ? 'BERTHING_OVERRIDE_APPROVED' : 'BERTHING_OVERRIDE_REJECTED',
        entityName: 'berthing_records',
        entityId: berthingId,
        beforeData: record,
        afterData: refreshed,
        reason: dto.approvalNotes,
        tx,
      });

      return refreshed;
    });
  }

  async endBerthing(
    visitId: number,
    berthingId: number,
    dto: EndBerthingDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);

    const record = await this.prisma.berthingRecord.findUnique({ where: { id: berthingId } });
    if (!record || record.visitId !== visitId) {
      throw new NotFoundException(`BerthingRecord #${berthingId} not found for visit #${visitId}`);
    }
    if (
      record.approvalStatus === BerthApprovalStatus.PENDING ||
      record.approvalStatus === BerthApprovalStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot end berthing while approvalStatus is ${record.approvalStatus}`,
      );
    }
    if (!record.actualStartAt) {
      throw new BadRequestException('Berthing start time has not been recorded');
    }
    if (record.actualEndAt) {
      throw new ConflictException('Berthing record has already been closed');
    }

    const actualEndAt = new Date(dto.actualEndAt);
    if (actualEndAt <= record.actualStartAt) {
      throw new BadRequestException('actualEndAt must be strictly after actualStartAt');
    }

    const diffHours = DecimalUtil.round2(
      (actualEndAt.getTime() - record.actualStartAt.getTime()) / BILLING_CONSTANTS.MS_PER_HOUR,
    );
    const etmal = Math.max(1, Math.ceil(diffHours / BILLING_CONSTANTS.HOURS_PER_ETMAL));

    const isOverstay = actualEndAt > visit.etd;
    const overstayHours = isOverstay
      ? DecimalUtil.round2(
          (actualEndAt.getTime() - visit.etd.getTime()) / BILLING_CONSTANTS.MS_PER_HOUR,
        )
      : 0;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.berthingRecord.update({
        where: { id: berthingId },
        data: {
          actualEndAt,
          calculatedHours: diffHours,
          billableEtmal: etmal,
          isOverstay,
          overstayHours,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'BERTHING_ENDED',
        entityName: 'berthing_records',
        entityId: berthingId,
        beforeData: record,
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async recordDeparture(
    visitId: number,
    dto: RecordDepartureDto,
    user: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const visit = await this.findById(visitId, scope);
    await this.assertNotLockedByFinalSkrd(visitId);
    assertValidVisitTransition(visit.status, VisitStatus.DEPARTED);

    const openBerthing = await this.prisma.berthingRecord.findFirst({
      where: {
        visitId,
        actualEndAt: null,
        approvalStatus: {
          in: [
            BerthApprovalStatus.AUTO_APPROVED,
            BerthApprovalStatus.APPROVED,
            BerthApprovalStatus.PENDING,
          ],
        },
      },
    });
    if (openBerthing) {
      throw new BadRequestException(
        `Cannot depart while berthing record #${openBerthing.id} is still open`,
      );
    }

    const atd = new Date(dto.atdPort);
    if (visit.ataAnchorage && atd <= visit.ataAnchorage) {
      throw new BadRequestException('atdPort must be strictly after ataAnchorage');
    }

    const departedVisit = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipVisit.updateMany({
        where: { id: visitId, status: visit.status },
        data: { status: VisitStatus.DEPARTED, atdPort: atd },
      });
      if (updated.count === 0) {
        throw new ConflictException('Visit status changed concurrently');
      }

      await this.auditLog.record({
        actorId: user.id,
        action: 'VISIT_DEPARTED',
        entityName: 'ship_visits',
        entityId: visitId,
        beforeData: { status: visit.status },
        afterData: { status: VisitStatus.DEPARTED, atdPort: atd },
        tx,
      });

      return tx.shipVisit.findUnique({ where: { id: visitId } });
    });

    // Decoupled Domain Event: billing module listens to auto-draft FINAL_SKRD
    this.eventEmitter.emit(VISIT_DEPARTED_EVENT, {
      visitId,
      actorId: user.id,
    } satisfies VisitDepartedEvent);

    return departedVisit;
  }

  private async assertNotLockedByFinalSkrd(visitId: number): Promise<void> {
    const activeFinalSkrd = await this.prisma.invoice.findFirst({
      where: {
        visitId,
        billingStage: BillingStage.FINAL_SKRD,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.PAID] },
      },
    });

    if (activeFinalSkrd) {
      throw new ConflictException(
        `Visit #${visitId} is locked by issued FINAL_SKRD (${activeFinalSkrd.invoiceNumber}). Void the SKRD first to make corrections.`,
      );
    }
  }
}

