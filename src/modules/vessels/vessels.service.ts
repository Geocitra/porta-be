import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContractStatus, VerificationStatus, VesselCategory } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import {
  CreateBerthingContractDto,
  CreateOperatorDto,
  CreateVesselDto,
  ReviewBerthingContractDto,
  UpdateOperatorDto,
  UpdateVesselDto,
  UploadDocumentDto,
  VerifyBerthingContractDto,
  VerifyEntityDto,
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
  operatorId: number;
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
      },
      orderBy: { name: 'asc' },
    });

    return operators.map((op) => ({
      ...op,
      fleetSummary: {
        totalVessels: op.vessels.length,
        verifiedVesselsCount: op.vessels.filter(
          (v) => v.verificationStatus === VerificationStatus.VERIFIED,
        ).length,
        pendingVesselsCount: op.vessels.filter(
          (v) => v.verificationStatus === VerificationStatus.PENDING,
        ).length,
      },
    }));
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
      },
    });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Perusahaan Pelayaran #${operatorId} tidak ditemukan`);
    }
    return {
      ...operator,
      fleetSummary: {
        totalVessels: operator.vessels.length,
        verifiedVesselsCount: operator.vessels.filter(
          (v) => v.verificationStatus === VerificationStatus.VERIFIED,
        ).length,
        pendingVesselsCount: operator.vessels.filter(
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
        operatorId,
        isActive: true,
        ...(vesselCategory ? { vesselCategory } : {}),
      },
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
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

    const existing = await this.prisma.shipOperator.findUnique({
      where: { id: operatorId },
      include: { documents: true },
    });
    if (!existing) throw new NotFoundException(`Operator #${operatorId} not found`);

    if (dto.status === VerificationStatus.VERIFIED) {
      const companyDocs = (existing.documents || []).filter((d) => !d.vesselId);
      const hasSiupalOrNib = companyDocs.some((d) => d.category === 'SIUPAL_NIB');
      const hasNpwp = companyDocs.some((d) => d.category === 'NPWP');
      if (!hasSiupalOrNib || !hasNpwp) {
        throw new BadRequestException(
          'Tidak dapat memverifikasi akun operator kapal karena berkas wajib (SIUPAL/NIB dan NPWP Badan Usaha) belum diunggah oleh operator.',
        );
      }
    }

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

  findVessels(scope: ScopeFilter, vesselCategory?: VesselCategory) {
    return this.prisma.vessel.findMany({
      where: {
        isActive: true,
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
        ...(vesselCategory ? { vesselCategory } : {}),
      },
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
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
    if (!dto.operatorId) {
      throw new BadRequestException('Operator ID is required');
    }

    if (scope.operatorId && dto.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot register vessel for another operator');
    }

    const operator = await this.prisma.shipOperator.findUnique({ where: { id: dto.operatorId } });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Operator #${dto.operatorId} not found or inactive`);
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.vessel.create({
        data: {
          operatorId: dto.operatorId!,
          registrationNumber: dto.registrationNumber,
          imoNumber: dto.imoNumber,
          name: dto.name,
          flag: dto.flag ?? 'Indonesia',
          grossTonnage: dto.grossTonnage,
          lengthMeters: dto.lengthMeters,
          draftMeters: dto.draftMeters,
          shipType: dto.shipType,
          vesselCategory: dto.vesselCategory,
          shippingCategory: dto.shippingCategory,
          verificationStatus: scope.operatorId
            ? VerificationStatus.PENDING
            : VerificationStatus.VERIFIED,
          verifiedById: scope.operatorId ? null : (actor?.id ?? null),
          verifiedAt: scope.operatorId ? null : new Date(),
        },
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
        action: 'VESSEL_CREATED_UNDER_OPERATOR',
        entityName: 'vessels',
        entityId: created.id,
        afterData: {
          vesselId: created.id,
          name: created.name,
          operatorId: operator.id,
          operatorName: operator.name,
        },
        tx,
      });

      return created;
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
    if (scope?.operatorId && existing.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot update vessel of another operator');
    }

    const sanitizedData: Record<string, unknown> = { ...dto };
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

    const vessel = await this.prisma.vessel.findUnique({ where: { id: vesselId } });
    if (!vessel) throw new NotFoundException(`Vessel #${vesselId} not found`);
    if (scope.operatorId && vessel.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot upload document for another operator vessel');
    }

    const filePath = await this.storage.saveFile(`vessels/${vesselId}`, file);

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          operatorId: vessel.operatorId,
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
      operatorId: vessel.operatorId,
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
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: {
        operator: true,
        port: { select: { id: true, code: true, name: true } },
        reviewedByOfficer: { select: { id: true, fullName: true, role: true } },
        verifiedBy: { select: { id: true, fullName: true, role: true } },
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
