import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class VesselsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  findOperators(scope: ScopeFilter) {
    return this.prisma.shipOperator.findMany({
      where: {
        isActive: true,
        ...(scope.operatorId ? { id: scope.operatorId } : {}),
      },
      include: { documents: true },
      orderBy: { name: 'asc' },
    });
  }

  createOperator(dto: CreateOperatorDto) {
    return this.prisma.shipOperator.create({
      data: {
        ...dto,
        verificationStatus: VerificationStatus.VERIFIED, // Created directly by Port Staff
      },
    });
  }

  async updateOperator(operatorId: number, dto: UpdateOperatorDto) {
    const existing = await this.prisma.shipOperator.findUnique({ where: { id: operatorId } });
    if (!existing) throw new NotFoundException(`Operator #${operatorId} not found`);

    return this.prisma.shipOperator.update({
      where: { id: operatorId },
      data: dto,
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
      });

      await this.auditLog.record({
        actorId: actor.id,
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

  async createVessel(dto: CreateVesselDto, scope: ScopeFilter) {
    if (scope.operatorId && dto.operatorId !== scope.operatorId) {
      throw new ForbiddenException('Cannot register vessel for another operator');
    }

    const operator = await this.prisma.shipOperator.findUnique({ where: { id: dto.operatorId } });
    if (!operator || !operator.isActive) {
      throw new NotFoundException(`Operator #${dto.operatorId} not found or inactive`);
    }

    return this.prisma.vessel.create({
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
      },
    });
  }

  async updateVessel(vesselId: number, dto: UpdateVesselDto) {
    const existing = await this.prisma.vessel.findUnique({ where: { id: vesselId } });
    if (!existing) throw new NotFoundException(`Vessel #${vesselId} not found`);

    return this.prisma.vessel.update({
      where: { id: vesselId },
      data: dto,
      include: {
        operator: {
          select: { id: true, name: true, operatorProfile: true, verificationStatus: true },
        },
        documents: true,
      },
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

    return this.prisma.document.create({
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

    return this.prisma.document.create({
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
  }
}
