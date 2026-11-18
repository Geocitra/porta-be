import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VerificationStatus, VesselCategory } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import {
  CreateOperatorDto,
  CreateVesselDto,
  UpdateOperatorDto,
  UpdateVesselDto,
  UploadDocumentDto,
  VerifyEntityDto,
} from './dto/vessels.dto';

export const DOCUMENT_UPLOADED_EVENT = 'document.uploaded';

export interface DocumentUploadedEvent {
  documentId: number;
  category: string;
  operatorId?: number | null;
  vesselId?: number | null;
  tenantId?: number | null;
  uploadedById: number;
  portId?: number | null;
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

  async updateOperator(operatorId: number, dto: UpdateOperatorDto, actor?: AuthenticatedUser) {
    const existing = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!existing) throw new NotFoundException(`Operator #${operatorId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipOperator.update({
        where: { id: operatorId },
        data: dto,
        include: { vessels: { where: { isActive: true } }, documents: true },
      });

      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: actor?.portId,
        action: 'OPERATOR_UPDATED',
        entityName: 'ship_operators',
        entityId: operatorId,
        beforeData: existing,
        afterData: updated,
        tx,
      });

      return updated;
    });
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
          operatorId: dto.operatorId,
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

  async updateVessel(vesselId: number, dto: UpdateVesselDto, actor?: AuthenticatedUser) {
    const existing = await this.prisma.vessel.findUnique({ where: { id: vesselId } });
    if (!existing) throw new NotFoundException(`Vessel #${vesselId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vessel.update({
        where: { id: vesselId },
        data: dto,
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
        action: 'VESSEL_UPDATED',
        entityName: 'vessels',
        entityId: vesselId,
        beforeData: existing,
        afterData: updated,
        tx,
      });

      return updated;
    });
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
}
