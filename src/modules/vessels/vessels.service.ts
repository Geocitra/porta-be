import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ContractStatus,
  UserRole,
  VerificationStatus,
  VesselCategory,
  VesselRelationshipType,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import { VesselNormalizationUtil } from '../../common/utils/vessel-normalization.util';
import {
  ClaimVesselDto,
  CreateBerthingContractDto,
  CreateOperatorDto,
  CreateVesselDto,
  ReviewBerthingContractDto,
  UpdateOperatorDto,
  UpdateVesselDto,
  UploadDocumentDto,
  VerifyBerthingContractDto,
  VerifyEntityDto,
  VerifyVesselClaimDto,
} from './dto/vessels.dto';

export const DOCUMENT_UPLOADED_EVENT = 'document.uploaded';
export const VESSEL_REVERIFICATION_REQUIRED_EVENT = 'vessel.reverification_required';
export const BERTHING_CONTRACT_SUBMITTED_EVENT = 'berthing_contract.submitted';
export const BERTHING_CONTRACT_REVIEWED_EVENT = 'berthing_contract.reviewed';
export const BERTHING_CONTRACT_VERIFIED_EVENT = 'berthing_contract.verified';

export interface DocumentUploadedEvent {
  documentId: number;
  category: string;
  operatorId?: number | null;
  vesselId?: number | null;
  tenantId?: number | null;
  uploadedById: number;
  portId?: number | null;
}

export interface VesselReverificationRequiredEvent {
  vesselId: number;
  vesselName: string;
  operatorId: number | null;
  changedFields: string[];
  actorId: number;
}

export interface BerthingContractEvent {
  contractId: number;
  contractNumber: string;
  title: string;
  operatorId: number;
  portId: number;
  status: ContractStatus;
  actorId: number;
  notes?: string | null;
}

@Injectable()
export class VesselsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findOperators(scope: ScopeFilter) {
    const operators = await this.prisma.shipOperator.findMany({
      where: {
        isActive: true,
        ...(scope.operatorId ? { id: scope.operatorId } : {}),
      },
      include: {
        documents: true,
        vessels: {
          where: { isActive: true },
          include: { documents: true },
          orderBy: { name: 'asc' },
        },
        vesselLinks: {
          where: { isActive: true, vessel: { isActive: true } },
          include: {
            vessel: { include: { documents: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return operators.map((op) => {
      const fleetMap = new Map<number, any>();
      for (const v of op.vessels ?? []) {
        fleetMap.set(v.id, v);
      }
      for (const link of op.vesselLinks ?? []) {
        if (link.vessel) {
          fleetMap.set(link.vessel.id, {
            ...link.vessel,
            relationshipType: link.relationshipType,
            claimVerificationStatus: link.verificationStatus,
          });
        }
      }
      const mergedVessels = Array.from(fleetMap.values());
      return {
        ...op,
        vessels: mergedVessels,
        fleetSummary: {
          totalVessels: mergedVessels.length,
          verifiedVesselsCount: mergedVessels.filter(
            (v) => v.verificationStatus === VerificationStatus.VERIFIED,
          ).length,
          pendingVesselsCount: mergedVessels.filter(
            (v) => v.verificationStatus === VerificationStatus.PENDING,
          ).length,
        },
      };
    });
  }

  async findOperatorById(operatorId: number, scope: ScopeFilter) {
    if (scope.operatorId && scope.operatorId !== operatorId) {
      throw new ForbiddenException('Cannot access another company profile');
    }
    const operator = await this.prisma.shipOperator.findUnique({
      where: { id: operatorId },
      include: {
        documents: true,
        vessels: {
          where: { isActive: true },
          include: { documents: true },
          orderBy: { name: 'asc' },
        },
        vesselLinks: {
          where: { isActive: true, vessel: { isActive: true } },
          include: {
            vessel: { include: { documents: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Perusahaan Pelayaran #${operatorId} tidak ditemukan`);
    }
    const fleetMap = new Map<number, any>();
    for (const v of operator.vessels ?? []) {
      fleetMap.set(v.id, v);
    }
    for (const link of operator.vesselLinks ?? []) {
      if (link.vessel) {
        fleetMap.set(link.vessel.id, {
          ...link.vessel,
          relationshipType: link.relationshipType,
          claimVerificationStatus: link.verificationStatus,
        });
      }
    }
    const mergedVessels = Array.from(fleetMap.values());
    return {
      ...operator,
      vessels: mergedVessels,
      fleetSummary: {
        totalVessels: mergedVessels.length,
        verifiedVesselsCount: mergedVessels.filter(
          (v) => v.verificationStatus === VerificationStatus.VERIFIED,
        ).length,
        pendingVesselsCount: mergedVessels.filter(
          (v) => v.verificationStatus === VerificationStatus.PENDING,
        ).length,
      },
    };
  }

  async findVesselsByOperator(
    operatorId: number,
    scope: ScopeFilter,
    vesselCategory?: VesselCategory,
  ) {
    if (scope.operatorId && scope.operatorId !== operatorId) {
      throw new ForbiddenException('Cannot access vessels of another company');
    }
    const operator = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Perusahaan Pelayaran #${operatorId} tidak ditemukan`);
    }

    return this.prisma.vessel.findMany({
      where: {
        isActive: true,
        ...(vesselCategory ? { vesselCategory } : {}),
        OR: [
          { operatorId },
          { operatorLinks: { some: { operatorId, isActive: true } } },
        ],
      },
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
        },
        operatorLinks: {
          where: { isActive: true },
          include: {
            operator: {
              select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
            },
          },
        },
        documents: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createOperator(dto: CreateOperatorDto, actor?: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.shipOperator.create({
        data: {
          ...dto,
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedById: actor?.id ?? null,
          verifiedAt: new Date(),
        },
        include: { vessels: true, documents: true },
      });

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: actor?.portId,
        action: 'OPERATOR_CREATED',
        entityName: 'ship_operators',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });
  }

  async updateOperator(
    operatorId: number,
    dto: UpdateOperatorDto,
    actor?: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    if (scope?.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException(
        'Operator kapal hanya dapat memperbarui profil perusahaannya sendiri',
      );
    }

    const existing = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!existing) throw new NotFoundException(`Operator #${operatorId} not found`);

    const updateData: Record<string, unknown> = { ...dto };
    let operatorResetVerification = false;
    if (scope?.operatorId) {
      delete updateData.isActive;
      const legalChanged =
        (dto.name !== undefined && dto.name.trim() !== existing.name) ||
        (dto.npwp !== undefined && dto.npwp !== existing.npwp) ||
        (dto.operatorProfile !== undefined && dto.operatorProfile !== existing.operatorProfile);

      if (legalChanged && existing.verificationStatus === VerificationStatus.VERIFIED) {
        updateData.verificationStatus = VerificationStatus.PENDING;
        updateData.verifiedAt = null;
        updateData.verifiedById = null;
        operatorResetVerification = true;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.shipOperator.update({
        where: { id: operatorId },
        data: updateData,
        include: { vessels: { where: { isActive: true } }, documents: true },
      });

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: actor?.portId,
        action: operatorResetVerification
          ? 'OPERATOR_UPDATED_REVERIFICATION_REQUIRED'
          : 'OPERATOR_UPDATED',
        entityName: 'ship_operators',
        entityId: operatorId,
        beforeData: existing,
        afterData: res,
        tx,
      });

      return res;
    });

    if (operatorResetVerification && actor) {
      this.eventEmitter.emit('company.onboarded', {
        entityType: 'OPERATOR',
        entityId: updated.id,
        companyName: updated.name,
        actorId: actor.id,
      });
    }

    return updated;
  }

  async verifyOperator(operatorId: number, dto: VerifyEntityDto, actor: AuthenticatedUser) {
    if (dto.status === VerificationStatus.PENDING) {
      throw new BadRequestException('Verification status must be VERIFIED or REJECTED');
    }
    if (dto.status === VerificationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting an operator');
    }

    const existing = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!existing) throw new NotFoundException(`Operator #${operatorId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipOperator.update({
        where: { id: operatorId },
        data: {
          verificationStatus: dto.status,
          rejectionReason: dto.status === VerificationStatus.REJECTED ? dto.rejectionReason : null,
          verifiedAt: new Date(),
          verifiedById: actor.id,
        },
        include: { vessels: { where: { isActive: true } }, documents: true },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: `OPERATOR_${dto.status}`,
        entityName: 'ship_operators',
        entityId: operatorId,
        beforeData: { verificationStatus: existing.verificationStatus },
        afterData: { verificationStatus: dto.status },
        reason: dto.rejectionReason,
        tx,
      });

      return updated;
    });
  }

  /**
   * Global Independent Vessel Catalog Search (with fuzzy typo-tolerant ranking)
   * Used by both SUPERADMIN and OPERATOR_KAPAL before claiming or registering a vessel.
   */
  async searchVesselCatalog(query?: string, vesselCategory?: VesselCategory) {
    const vessels = await this.prisma.vessel.findMany({
      where: {
        isActive: true,
        ...(vesselCategory ? { vesselCategory } : {}),
      },
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
        },
        operatorLinks: {
          where: { isActive: true },
          include: {
            operator: {
              select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (!query || !query.trim()) {
      return vessels;
    }

    const rawQ = query.trim().toLowerCase();
    const normRegQ = VesselNormalizationUtil.normalizeRegistrationNumber(query);
    const normNameQ = VesselNormalizationUtil.normalizeVesselName(query);

    return vessels
      .map((v) => {
        const directMatch =
          v.name.toLowerCase().includes(rawQ) ||
          v.registrationNumber.toLowerCase().includes(rawQ) ||
          (v.imoNumber?.toLowerCase().includes(rawQ) ?? false) ||
          (normRegQ.length >= 3 && v.normalizedRegNumber.includes(normRegQ)) ||
          (normNameQ.length >= 2 && v.normalizedName.includes(normNameQ));

        const similarityScore = normNameQ
          ? VesselNormalizationUtil.computeNameSimilarity(normNameQ, v.normalizedName)
          : 0;

        return {
          ...v,
          similarityScore,
          _matched: directMatch || similarityScore >= 0.65,
        };
      })
      .filter((v) => v._matched)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .map(({ _matched, ...rest }) => rest);
  }

  findVessels(scope: ScopeFilter, vesselCategory?: VesselCategory) {
    return this.prisma.vessel.findMany({
      where: {
        isActive: true,
        ...(scope.operatorId
          ? {
              OR: [
                { operatorId: scope.operatorId },
                { operatorLinks: { some: { operatorId: scope.operatorId, isActive: true } } },
              ],
            }
          : {}),
        ...(vesselCategory ? { vesselCategory } : {}),
      },
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
        },
        operatorLinks: {
          where: { isActive: true },
          include: {
            operator: {
              select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
            },
          },
        },
        documents: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createVessel(
    dto: CreateVesselDto,
    scope: ScopeFilter,
    actor?: AuthenticatedUser,
  ) {
    const effectiveOperatorId = scope.operatorId ?? dto.operatorId ?? null;

    if (scope.operatorId && dto.operatorId && dto.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot register vessel for another operator');
    }

    let linkedOperator: { id: number; name: string } | null = null;
    if (effectiveOperatorId !== null) {
      const operator = await this.prisma.shipOperator.findUnique({
        where: { id: effectiveOperatorId },
      });
      if (!operator || !operator.isActive) {
        throw new NotFoundException(`Operator #${effectiveOperatorId} not found or inactive`);
      }
      linkedOperator = { id: operator.id, name: operator.name };
    }

    // Layer 1: Canonical Normalization (Hard Block exact/format duplicates)
    const normalizedRegNumber = VesselNormalizationUtil.normalizeRegistrationNumber(
      dto.registrationNumber,
    );
    const normalizedImoNumber = VesselNormalizationUtil.normalizeImoNumber(dto.imoNumber);
    const normalizedName = VesselNormalizationUtil.normalizeVesselName(dto.name);

    if (!normalizedRegNumber || !normalizedName) {
      throw new BadRequestException('Nama kapal dan nomor registrasi kapal tidak valid.');
    }

    if (this.prisma.vessel?.findFirst) {
      const exactDuplicate = await this.prisma.vessel.findFirst({
        where: {
          OR: [
            { normalizedRegNumber },
            ...(normalizedImoNumber ? [{ normalizedImoNumber }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          registrationNumber: true,
          imoNumber: true,
          grossTonnage: true,
          vesselCategory: true,
          verificationStatus: true,
        },
      });

      if (exactDuplicate) {
        throw new ConflictException({
          statusCode: 409,
          code: 'DUPLICATE_VESSEL_IDENTITY',
          message: `Kapal dengan Nomor Registrasi / IMO tersebut sudah terdaftar di Katalog Induk (${exactDuplicate.name} - ${exactDuplicate.registrationNumber}). Silakan klaim/pilih kapal tersebut dari katalog alih-alih membuat data duplikat.`,
          existingVessel: exactDuplicate,
        });
      }
    }

    // Layer 2: Fuzzy Levenshtein Similarity Typo Detection
    if (!dto.confirmNotDuplicate && this.prisma.vessel?.findMany) {
      const activeVessels = await this.prisma.vessel.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          normalizedName: true,
          registrationNumber: true,
          imoNumber: true,
          grossTonnage: true,
          vesselCategory: true,
        },
      });

      const similarVessels = activeVessels
        .map((v) => ({
          ...v,
          similarityScore: VesselNormalizationUtil.computeNameSimilarity(
            normalizedName,
            v.normalizedName || v.name,
          ),
        }))
        .filter((v) =>
          VesselNormalizationUtil.isPotentialTypoDuplicate(
            normalizedName,
            v.normalizedName || v.name,
          ),
        )
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);

      if (similarVessels.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'POSSIBLE_DUPLICATE_VESSEL',
          message:
            'Ditemukan kapal dengan nama sangat mirip di Katalog Induk. Pilih/klaim kapal yang sudah ada jika itu kapal yang sama, atau kirim confirmNotDuplicate=true jika benar-benar kapal fisik berbeda.',
          similarVessels,
        });
      }
    }

    const isExternalOperator = Boolean(scope.operatorId);
    const initialVerificationStatus = isExternalOperator
      ? VerificationStatus.PENDING
      : VerificationStatus.VERIFIED;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.vessel.create({
        data: {
          operatorId: effectiveOperatorId,
          registrationNumber: dto.registrationNumber.trim(),
          normalizedRegNumber,
          imoNumber: dto.imoNumber?.trim() || null,
          normalizedImoNumber,
          name: dto.name.trim(),
          normalizedName,
          flag: dto.flag ?? 'Indonesia',
          grossTonnage: dto.grossTonnage,
          lengthMeters: dto.lengthMeters,
          draftMeters: dto.draftMeters,
          shipType: dto.shipType,
          vesselCategory: dto.vesselCategory,
          shippingCategory: dto.shippingCategory,
          verificationStatus: initialVerificationStatus,
          verifiedById: isExternalOperator ? null : (actor?.id ?? null),
          verifiedAt: isExternalOperator ? null : new Date(),
        },
        include: {
          operator: {
            select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
          },
          documents: true,
        },
      });

      if (effectiveOperatorId !== null && tx.operatorVessel?.upsert) {
        await tx.operatorVessel.upsert({
          where: {
            operatorId_vesselId: {
              operatorId: effectiveOperatorId,
              vesselId: created.id,
            },
          },
          update: {
            isActive: true,
            relationshipType: dto.relationshipType ?? VesselRelationshipType.OWNER,
            verificationStatus: initialVerificationStatus,
            verifiedById: isExternalOperator ? null : (actor?.id ?? null),
            verifiedAt: isExternalOperator ? null : new Date(),
          },
          create: {
            operatorId: effectiveOperatorId,
            vesselId: created.id,
            relationshipType: dto.relationshipType ?? VesselRelationshipType.OWNER,
            verificationStatus: initialVerificationStatus,
            verifiedById: isExternalOperator ? null : (actor?.id ?? null),
            verifiedAt: isExternalOperator ? null : new Date(),
          },
        });
      }

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: actor?.portId,
        action: linkedOperator ? 'VESSEL_CREATED_UNDER_OPERATOR' : 'GLOBAL_VESSEL_MASTER_CREATED',
        entityName: 'vessels',
        entityId: created.id,
        afterData: {
          vesselId: created.id,
          name: created.name,
          normalizedName: created.normalizedName,
          operatorId: linkedOperator?.id ?? null,
          operatorName: linkedOperator?.name ?? null,
        },
        tx,
      });

      return created;
    });
  }

  /**
   * Allows a Shipping Company (Operator) to pick/claim an existing vessel from the Global Registry
   * into their fleet (Many-to-Many via OperatorVessel).
   */
  async claimVesselForOperator(
    operatorId: number,
    vesselId: number,
    dto: ClaimVesselDto,
    file: UploadedFilePayload | undefined,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (scope.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException('Tidak dapat mengklaim kapal untuk perusahaan pelayaran lain.');
    }

    const [operator, vessel] = await Promise.all([
      this.prisma.shipOperator.findUnique({ where: { id: operatorId } }),
      this.prisma.vessel.findUnique({ where: { id: vesselId } }),
    ]);

    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Perusahaan Pelayaran #${operatorId} tidak ditemukan atau nonaktif.`);
    }
    if (!vessel || !vessel.isActive) {
      throw new NotFoundException(`Kapal #${vesselId} tidak ditemukan atau nonaktif.`);
    }

    let authorizationDocPath: string | null = null;
    if (file) {
      authorizationDocPath = await this.storage.saveFile(
        `operators/${operatorId}/vessel-claims/${vesselId}`,
        file,
      );
    }

    const isExternalOperator = actor.role === UserRole.OPERATOR_KAPAL;
    const verificationStatus = isExternalOperator
      ? VerificationStatus.PENDING
      : VerificationStatus.VERIFIED;

    const claim = await this.prisma.$transaction(async (tx) => {
      const link = await tx.operatorVessel.upsert({
        where: { operatorId_vesselId: { operatorId, vesselId } },
        update: {
          relationshipType: dto.relationshipType ?? VesselRelationshipType.AGENT,
          notes: dto.notes ?? null,
          ...(authorizationDocPath ? { authorizationDocPath } : {}),
          verificationStatus,
          rejectionReason: null,
          verifiedById: isExternalOperator ? null : actor.id,
          verifiedAt: isExternalOperator ? null : new Date(),
          isActive: true,
        },
        create: {
          operatorId,
          vesselId,
          relationshipType: dto.relationshipType ?? VesselRelationshipType.AGENT,
          notes: dto.notes ?? null,
          authorizationDocPath,
          verificationStatus,
          verifiedById: isExternalOperator ? null : actor.id,
          verifiedAt: isExternalOperator ? null : new Date(),
          isActive: true,
        },
        include: {
          operator: { select: { id: true, name: true } },
          vessel: true,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: 'OPERATOR_VESSEL_CLAIMED',
        entityName: 'operator_vessels',
        entityId: link.id,
        afterData: {
          operatorId,
          vesselId,
          relationshipType: link.relationshipType,
          verificationStatus: link.verificationStatus,
        },
        tx,
      });

      return link;
    });

    return claim;
  }

  async verifyOperatorVesselClaim(
    operatorId: number,
    vesselId: number,
    dto: VerifyVesselClaimDto,
    actor: AuthenticatedUser,
  ) {
    if (dto.status === VerificationStatus.PENDING) {
      throw new BadRequestException('Verification status must be VERIFIED or REJECTED');
    }
    if (dto.status === VerificationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting a vessel claim');
    }

    const existing = await this.prisma.operatorVessel.findUnique({
      where: { operatorId_vesselId: { operatorId, vesselId } },
    });
    if (!existing) {
      throw new NotFoundException(
        `Relasi armada Operator #${operatorId} dengan Kapal #${vesselId} tidak ditemukan.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.operatorVessel.update({
        where: { id: existing.id },
        data: {
          verificationStatus: dto.status,
          rejectionReason: dto.status === VerificationStatus.REJECTED ? dto.rejectionReason : null,
          verifiedById: actor.id,
          verifiedAt: new Date(),
        },
        include: {
          operator: { select: { id: true, name: true } },
          vessel: true,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: `OPERATOR_VESSEL_CLAIM_${dto.status}`,
        entityName: 'operator_vessels',
        entityId: existing.id,
        beforeData: { verificationStatus: existing.verificationStatus },
        afterData: { verificationStatus: dto.status },
        reason: dto.rejectionReason,
        tx,
      });

      return updated;
    });
  }

  async unlinkVesselFromOperator(
    operatorId: number,
    vesselId: number,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (scope.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException('Tidak dapat melepas kapal milik perusahaan lain.');
    }

    const existing = await this.prisma.operatorVessel.findUnique({
      where: { operatorId_vesselId: { operatorId, vesselId } },
    });
    if (!existing) {
      throw new NotFoundException(
        `Relasi armada Operator #${operatorId} dengan Kapal #${vesselId} tidak ditemukan.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.operatorVessel.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: 'OPERATOR_VESSEL_UNLINKED',
        entityName: 'operator_vessels',
        entityId: existing.id,
        beforeData: { isActive: existing.isActive },
        afterData: { isActive: false },
        tx,
      });

      return { message: 'Kapal berhasil dilepas dari daftar armada perusahaan.', link: updated };
    });
  }

  /**
   * SUPERADMIN Governance Tool:
   * Safely merges a duplicate vessel (sourceVesselId) into the canonical master vessel (targetVesselId),
   * migrating all OperatorVessel links, ShipVisits, and Documents atomically with zero data loss.
   */
  async mergeDuplicateVessel(
    sourceVesselId: number,
    targetVesselId: number,
    actor: AuthenticatedUser,
  ) {
    if (actor.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException('Hanya SUPERADMIN yang berwenang menggabungkan data duplikat kapal.');
    }
    if (sourceVesselId === targetVesselId) {
      throw new BadRequestException('sourceVesselId dan targetVesselId tidak boleh sama.');
    }

    const [source, target] = await Promise.all([
      this.prisma.vessel.findUnique({ where: { id: sourceVesselId } }),
      this.prisma.vessel.findUnique({ where: { id: targetVesselId } }),
    ]);

    if (!source) throw new NotFoundException(`Kapal sumber #${sourceVesselId} tidak ditemukan.`);
    if (!target || !target.isActive) {
      throw new NotFoundException(`Kapal target #${targetVesselId} tidak ditemukan atau tidak aktif.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const sourceLinks = await tx.operatorVessel.findMany({
        where: { vesselId: sourceVesselId },
      });

      for (const link of sourceLinks) {
        const existsOnTarget = await tx.operatorVessel.findUnique({
          where: {
            operatorId_vesselId: { operatorId: link.operatorId, vesselId: targetVesselId },
          },
        });
        if (!existsOnTarget) {
          await tx.operatorVessel.create({
            data: {
              operatorId: link.operatorId,
              vesselId: targetVesselId,
              relationshipType: link.relationshipType,
              verificationStatus: link.verificationStatus,
              authorizationDocPath: link.authorizationDocPath,
              notes: link.notes,
              verifiedById: link.verifiedById,
              verifiedAt: link.verifiedAt,
              isActive: link.isActive,
            },
          });
        }
        await tx.operatorVessel.update({
          where: { id: link.id },
          data: { isActive: false },
        });
      }

      await tx.shipVisit.updateMany({
        where: { vesselId: sourceVesselId },
        data: { vesselId: targetVesselId },
      });

      await tx.document.updateMany({
        where: { vesselId: sourceVesselId },
        data: { vesselId: targetVesselId },
      });

      const archivedSuffix = `MERGED-${sourceVesselId}-${Date.now()}`;
      await tx.vessel.update({
        where: { id: sourceVesselId },
        data: {
          isActive: false,
          registrationNumber: `${source.registrationNumber}-${archivedSuffix}`.slice(0, 60),
          normalizedRegNumber: `${source.normalizedRegNumber}${archivedSuffix}`.slice(0, 80),
          imoNumber: source.imoNumber ? `${source.imoNumber}-${archivedSuffix}`.slice(0, 30) : null,
          normalizedImoNumber: source.normalizedImoNumber
            ? `${source.normalizedImoNumber}${archivedSuffix}`.slice(0, 40)
            : null,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'VESSEL_DUPLICATE_MERGED',
        entityName: 'vessels',
        entityId: targetVesselId,
        beforeData: { sourceVesselId, sourceName: source.name, sourceReg: source.registrationNumber },
        afterData: { targetVesselId, targetName: target.name, targetReg: target.registrationNumber },
        tx,
      });

      return {
        message: `Kapal duplikat "${source.name}" (#${sourceVesselId}) berhasil digabungkan ke "${target.name}" (#${targetVesselId}).`,
        targetVesselId,
        migratedOperatorLinksCount: sourceLinks.length,
      };
    });
  }

  async updateVessel(
    vesselId: number,
    dto: UpdateVesselDto,
    actor?: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    const existing = await this.prisma.vessel.findUnique({ where: { id: vesselId } });
    if (!existing) throw new NotFoundException(`Vessel #${vesselId} not found`);

    if (scope?.operatorId) {
      const hasLegacyOwnership = existing.operatorId === scope.operatorId;
      const activeLinks = this.prisma.operatorVessel?.findMany
        ? await this.prisma.operatorVessel.findMany({
            where: { vesselId, isActive: true },
          })
        : [];
      const hasOperatorLink = activeLinks.some((l) => l.operatorId === scope.operatorId);

      if (!hasLegacyOwnership && !hasOperatorLink) {
        throw new ForbiddenException('Cannot update vessel of another operator');
      }

      // Protect shared VERIFIED vessels: if more than 1 company operates this vessel,
      // only SUPERADMIN or PETUGAS_REGISTRASI_KONTRAK may alter its global technical specs.
      const distinctOperatorIds = new Set<number>(activeLinks.map((l) => l.operatorId));
      if (existing.operatorId) distinctOperatorIds.add(existing.operatorId);

      if (
        existing.verificationStatus === VerificationStatus.VERIFIED &&
        distinctOperatorIds.size > 1
      ) {
        throw new ForbiddenException(
          'Kapal ini berstatus VERIFIED dan digunakan bersama oleh beberapa perusahaan pelayaran. Perubahan spesifikasi teknis kapal global hanya dapat dilakukan oleh SUPERADMIN atau Petugas Registrasi.',
        );
      }
    }

    const sanitizedData: Record<string, unknown> = { ...dto };
    if (dto.name !== undefined) {
      sanitizedData.name = dto.name.trim();
      sanitizedData.normalizedName = VesselNormalizationUtil.normalizeVesselName(dto.name);
    }
    if (dto.registrationNumber !== undefined) {
      sanitizedData.registrationNumber = dto.registrationNumber.trim();
      sanitizedData.normalizedRegNumber = VesselNormalizationUtil.normalizeRegistrationNumber(
        dto.registrationNumber,
      );
    }
    if (dto.imoNumber !== undefined) {
      sanitizedData.imoNumber = dto.imoNumber?.trim() || null;
      sanitizedData.normalizedImoNumber = VesselNormalizationUtil.normalizeImoNumber(dto.imoNumber);
    }

    const changedTechnicalFields: string[] = [];
    let requiresReverification = false;

    if (scope?.operatorId) {
      delete sanitizedData.operatorId;
      delete sanitizedData.isActive;

      if (
        dto.grossTonnage !== undefined &&
        Number(dto.grossTonnage) !== Number(existing.grossTonnage)
      ) {
        changedTechnicalFields.push('grossTonnage');
      }
      if (
        dto.lengthMeters !== undefined &&
        Number(dto.lengthMeters) !== Number(existing.lengthMeters ?? 0)
      ) {
        changedTechnicalFields.push('lengthMeters');
      }
      if (
        dto.draftMeters !== undefined &&
        Number(dto.draftMeters) !== Number(existing.draftMeters ?? 0)
      ) {
        changedTechnicalFields.push('draftMeters');
      }
      if (dto.shipType !== undefined && dto.shipType !== existing.shipType) {
        changedTechnicalFields.push('shipType');
      }
      if (dto.vesselCategory !== undefined && dto.vesselCategory !== existing.vesselCategory) {
        changedTechnicalFields.push('vesselCategory');
      }
      if (
        dto.shippingCategory !== undefined &&
        dto.shippingCategory !== existing.shippingCategory
      ) {
        changedTechnicalFields.push('shippingCategory');
      }
      if (
        dto.registrationNumber !== undefined &&
        dto.registrationNumber !== existing.registrationNumber
      ) {
        changedTechnicalFields.push('registrationNumber');
      }

      if (
        changedTechnicalFields.length > 0 &&
        existing.verificationStatus === VerificationStatus.VERIFIED
      ) {
        sanitizedData.verificationStatus = VerificationStatus.PENDING;
        sanitizedData.verifiedAt = null;
        sanitizedData.verifiedById = null;
        requiresReverification = true;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.vessel.update({
        where: { id: vesselId },
        data: sanitizedData,
        include: {
          operator: {
            select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
          },
          documents: true,
        },
      });

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: actor?.portId,
        action: requiresReverification
          ? 'VESSEL_TECHNICAL_UPDATED_REVERIFICATION_REQUIRED'
          : 'VESSEL_UPDATED',
        entityName: 'vessels',
        entityId: vesselId,
        beforeData: existing,
        afterData: res,
        tx,
      });

      return res;
    });

    if (requiresReverification && actor) {
      this.eventEmitter.emit(VESSEL_REVERIFICATION_REQUIRED_EVENT, {
        vesselId: updated.id,
        vesselName: updated.name,
        operatorId: updated.operatorId,
        changedFields: changedTechnicalFields,
        actorId: actor.id,
      } satisfies VesselReverificationRequiredEvent);
    }

    return updated;
  }

  async verifyVessel(vesselId: number, dto: VerifyEntityDto, actor: AuthenticatedUser) {
    if (dto.status === VerificationStatus.PENDING) {
      throw new BadRequestException('Verification status must be VERIFIED or REJECTED');
    }
    if (dto.status === VerificationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting a vessel');
    }

    const existing = await this.prisma.vessel.findUnique({ where: { id: vesselId } });
    if (!existing) throw new NotFoundException(`Vessel #${vesselId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vessel.update({
        where: { id: vesselId },
        data: {
          verificationStatus: dto.status,
          rejectionReason: dto.status === VerificationStatus.REJECTED ? dto.rejectionReason : null,
          verifiedAt: new Date(),
          verifiedById: actor.id,
        },
      });

      // Sinkronkan juga status klaim awal milik operator pendaftar (jika masih PENDING)
      if (existing.operatorId !== null && tx.operatorVessel?.updateMany) {
        await tx.operatorVessel.updateMany({
          where: {
            vesselId,
            operatorId: existing.operatorId,
            verificationStatus: VerificationStatus.PENDING,
          },
          data: {
            verificationStatus: dto.status,
            rejectionReason: dto.status === VerificationStatus.REJECTED ? dto.rejectionReason : null,
            verifiedAt: new Date(),
            verifiedById: actor.id,
          },
        });
      }

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: actor.portId,
        action: `VESSEL_${dto.status}`,
        entityName: 'vessels',
        entityId: vesselId,
        beforeData: { verificationStatus: existing.verificationStatus },
        afterData: { verificationStatus: dto.status },
        reason: dto.rejectionReason,
        tx,
      });

      return updated;
    });
  }

  async uploadOperatorDocument(
    operatorId: number,
    dto: UploadDocumentDto,
    file: UploadedFilePayload,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!file) throw new BadRequestException('Document file is required');
    if (scope.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot upload document for another operator');
    }

    const operator = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!operator) throw new NotFoundException(`Operator #${operatorId} not found`);

    const filePath = await this.storage.saveFile(`operators/${operatorId}`, file);

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          operatorId,
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
        action: 'OPERATOR_DOCUMENT_UPLOADED',
        entityName: 'documents',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });

    this.eventEmitter.emit(DOCUMENT_UPLOADED_EVENT, {
      documentId: doc.id,
      category: doc.category,
      operatorId,
      uploadedById: actor.id,
      portId: actor.portId,
    } satisfies DocumentUploadedEvent);

    return doc;
  }

  async uploadVesselDocument(
    vesselId: number,
    dto: UploadDocumentDto,
    file: UploadedFilePayload,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (!file) throw new BadRequestException('Document file is required');

    const vessel = await this.prisma.vessel.findUnique({
      where: { id: vesselId },
      include: {
        operatorLinks: {
          where: { isActive: true },
          select: { operatorId: true },
        },
      },
    });
    if (!vessel) throw new NotFoundException(`Vessel #${vesselId} not found`);

    const hasLinkAccess =
      !scope.operatorId ||
      vessel.operatorId === scope.operatorId ||
      (vessel.operatorLinks ?? []).some((link) => link.operatorId === scope.operatorId);
    if (!hasLinkAccess) {
      throw new ForbiddenException('Cannot upload document for another operator vessel');
    }

    const effectiveOperatorId = scope.operatorId ?? vessel.operatorId ?? null;
    const filePath = await this.storage.saveFile(`vessels/${vesselId}`, file);

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          operatorId: effectiveOperatorId,
          vesselId: vessel.id,
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
        action: 'VESSEL_DOCUMENT_UPLOADED',
        entityName: 'documents',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });

    this.eventEmitter.emit(DOCUMENT_UPLOADED_EVENT, {
      documentId: doc.id,
      category: doc.category,
      operatorId: effectiveOperatorId ?? undefined,
      vesselId: vessel.id,
      uploadedById: actor.id,
      portId: actor.portId,
    } satisfies DocumentUploadedEvent);

    return doc;
  }

  async getOperatorContracts(operatorId: number, scope: ScopeFilter) {
    if (scope.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot view contracts for another operator');
    }
    return this.prisma.operatorBerthingContract.findMany({
      where: {
        operatorId,
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: {
        port: { select: { id: true, code: true, name: true } },
        reviewedByOfficer: { select: { id: true, fullName: true, role: true } },
        verifiedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOperatorContract(
    operatorId: number,
    dto: CreateBerthingContractDto,
    file: UploadedFilePayload | undefined,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (scope.operatorId && operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot create contract for another operator');
    }
    const operator = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Operator #${operatorId} not found or inactive`);
    }

    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port || !port.isActive) {
      throw new NotFoundException(`Port #${dto.portId} not found or inactive`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be strictly after startDate');
    }

    let filePath: string | null = null;
    let fileName: string | null = null;
    if (file) {
      filePath = await this.storage.saveFile(`contracts/berthing/${operatorId}`, file);
      fileName = file.originalname;
    }

    const contractNumber = DocNumberUtil.generate('PKS-SDR', dto.portId);

    const created = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.operatorBerthingContract.create({
        data: {
          contractNumber,
          title: dto.title,
          operatorId,
          portId: dto.portId,
          startDate,
          endDate,
          monthlyQuota: dto.monthlyQuota,
          dockAllocation: dto.dockAllocation,
          filePath,
          fileName,
          status: ContractStatus.PENDING_VERIFICATION,
        },
        include: {
          port: { select: { id: true, code: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: dto.portId,
        action: 'OPERATOR_BERTHING_CONTRACT_REQUESTED',
        entityName: 'operator_berthing_contracts',
        entityId: contract.id,
        afterData: contract,
        tx,
      });

      return contract;
    });

    this.eventEmitter.emit(BERTHING_CONTRACT_SUBMITTED_EVENT, {
      contractId: created.id,
      contractNumber: created.contractNumber,
      title: created.title,
      operatorId: created.operatorId,
      portId: created.portId,
      status: created.status,
      actorId: actor.id,
    } satisfies BerthingContractEvent);

    return created;
  }

  listPendingContracts(scope: ScopeFilter) {
    return this.prisma.operatorBerthingContract.findMany({
      where: {
        status: {
          in: [ContractStatus.PENDING_VERIFICATION, ContractStatus.PENDING_HEAD_OF_PORT],
        },
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: {
        operator: true,
        port: { select: { id: true, code: true, name: true } },
        reviewedByOfficer: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewContractByOfficer(
    contractId: number,
    dto: ReviewBerthingContractDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.operatorBerthingContract.findUnique({
      where: { id: contractId },
    });
    if (!existing) {
      throw new NotFoundException(`Berthing contract #${contractId} not found`);
    }
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (existing.status !== ContractStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Contract #${contractId} is not awaiting officer prerequisite check (current: ${existing.status})`,
      );
    }

    const nextStatus =
      dto.decision === 'APPROVE'
        ? ContractStatus.PENDING_HEAD_OF_PORT
        : ContractStatus.REJECTED;

    if (nextStatus === ContractStatus.REJECTED && !dto.notes?.trim()) {
      throw new BadRequestException('Catatan penolakan (notes) wajib diisi jika kontrak ditolak');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.operatorBerthingContract.update({
        where: { id: contractId },
        data: {
          status: nextStatus,
          reviewedByOfficerId: actor.id,
          reviewedByOfficerAt: new Date(),
          officerReviewNotes: dto.notes ?? null,
          rejectionReason: nextStatus === ContractStatus.REJECTED ? dto.notes : null,
        },
        include: {
          operator: true,
          port: true,
          reviewedByOfficer: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: `OPERATOR_BERTHING_CONTRACT_OFFICER_${dto.decision}`,
        entityName: 'operator_berthing_contracts',
        entityId: contractId,
        beforeData: { status: existing.status },
        afterData: { status: nextStatus, officerReviewNotes: dto.notes },
        reason: dto.notes,
        tx,
      });

      return res;
    });

    this.eventEmitter.emit(BERTHING_CONTRACT_REVIEWED_EVENT, {
      contractId: updated.id,
      contractNumber: updated.contractNumber,
      title: updated.title,
      operatorId: updated.operatorId,
      portId: updated.portId,
      status: updated.status,
      actorId: actor.id,
      notes: dto.notes ?? null,
    } satisfies BerthingContractEvent);

    return updated;
  }

  async verifyContract(
    contractId: number,
    dto: VerifyBerthingContractDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.operatorBerthingContract.findUnique({
      where: { id: contractId },
    });
    if (!existing) {
      throw new NotFoundException(`Berthing contract #${contractId} not found`);
    }
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (
      existing.status !== ContractStatus.PENDING_HEAD_OF_PORT &&
      existing.status !== ContractStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException(
        `Contract #${contractId} is not pending verification (current: ${existing.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.operatorBerthingContract.update({
        where: { id: contractId },
        data: {
          status: dto.status,
          rejectionReason: dto.status === ContractStatus.REJECTED ? dto.rejectionReason : null,
          verifiedById: actor.id,
          verifiedAt: new Date(),
        },
        include: {
          operator: true,
          port: true,
          reviewedByOfficer: { select: { id: true, fullName: true, role: true } },
          verifiedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: existing.portId,
        action: `OPERATOR_BERTHING_CONTRACT_${dto.status}`,
        entityName: 'operator_berthing_contracts',
        entityId: contractId,
        beforeData: { status: existing.status },
        afterData: { status: dto.status },
        reason: dto.rejectionReason,
        tx,
      });

      return res;
    });

    this.eventEmitter.emit(BERTHING_CONTRACT_VERIFIED_EVENT, {
      contractId: updated.id,
      contractNumber: updated.contractNumber,
      title: updated.title,
      operatorId: updated.operatorId,
      portId: updated.portId,
      status: updated.status,
      actorId: actor.id,
      notes: dto.rejectionReason ?? null,
    } satisfies BerthingContractEvent);

    return updated;
  }
}
