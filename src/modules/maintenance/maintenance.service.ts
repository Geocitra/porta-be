import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { StorageService, UploadedFilePayload } from '../../common/utils/storage.service';
import {
  CreateMaintenanceTicketDto,
  UpdateMaintenanceStatusDto,
} from './dto/maintenance.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAll(scope: ScopeFilter) {
    return this.prisma.maintenanceTicket.findMany({
      where: { ...(scope.portId ? { portId: scope.portId } : {}) },
      include: {
        berth: { select: { id: true, code: true, name: true } },
        asset: { select: { id: true, assetCode: true, name: true } },
        reportedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    dto: CreateMaintenanceTicketDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
    evidenceFile?: UploadedFilePayload,
  ) {
    if (scope.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    if (!dto.berthId && !dto.assetId) {
      throw new BadRequestException('Either berthId or assetId must be specified');
    }

    if (dto.berthId) {
      const berth = await this.prisma.berth.findUnique({ where: { id: dto.berthId } });
      if (!berth || berth.portId !== dto.portId) {
        throw new BadRequestException(`Berth #${dto.berthId} does not belong to port #${dto.portId}`);
      }
    }

    if (dto.assetId) {
      const asset = await this.prisma.portAsset.findUnique({ where: { id: dto.assetId } });
      if (!asset || asset.portId !== dto.portId) {
        throw new BadRequestException(`Asset #${dto.assetId} does not belong to port #${dto.portId}`);
      }
    }

    const evidencePhoto = evidenceFile
      ? await this.storage.saveFile(`maintenance/${dto.portId}`, evidenceFile)
      : null;

    const ticketNumber = DocNumberUtil.generate('MNT', dto.portId);

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.maintenanceTicket.create({
        data: {
          ticketNumber,
          portId: dto.portId,
          berthId: dto.berthId ?? null,
          assetId: dto.assetId ?? null,
          severity: dto.severity,
          title: dto.title,
          description: dto.description,
          evidencePhoto,
          reportedById: actor.id,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'MAINTENANCE_REPORTED',
        entityName: 'maintenance_tickets',
        entityId: ticket.id,
        afterData: ticket,
        tx,
      });

      return ticket;
    });
  }

  async updateStatus(
    ticketId: number,
    dto: UpdateMaintenanceStatusDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!existing) throw new NotFoundException(`MaintenanceTicket #${ticketId} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceTicket.update({
        where: { id: ticketId },
        data: {
          status: dto.status,
          assignedTechnician: dto.assignedTechnician ?? existing.assignedTechnician,
          resolutionNote: dto.resolutionNote ?? existing.resolutionNote,
          resolvedAt:
            dto.status === MaintenanceStatus.VERIFIED_FIXED ? new Date() : existing.resolvedAt,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: `MAINTENANCE_${dto.status}`,
        entityName: 'maintenance_tickets',
        entityId: ticketId,
        beforeData: { status: existing.status },
        afterData: { status: dto.status },
        tx,
      });

      return updated;
    });
  }
}

