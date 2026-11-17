import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { CreateUserDto, UpdateUserStatusDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAll(scope: ScopeFilter) {
    return this.prisma.user.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        portId: true,
        operatorId: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedUser) {
    if (actor.role === UserRole.ADMIN_PELABUHAN) {
      if (dto.role !== UserRole.PETUGAS_DERMAGA && dto.role !== UserRole.BENDAHARA) {
        throw new ForbiddenException(
          'ADMIN_PELABUHAN can only create PETUGAS_DERMAGA or BENDAHARA accounts',
        );
      }
      if (dto.portId && dto.portId !== actor.portId) {
        throw new ForbiddenException('Cannot create user for another port');
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email is already registered');

    const portId = actor.role === UserRole.ADMIN_PELABUHAN ? actor.portId : (dto.portId ?? null);
    if (
      (dto.role === UserRole.ADMIN_PELABUHAN ||
        dto.role === UserRole.PETUGAS_DERMAGA ||
        dto.role === UserRole.BENDAHARA) &&
      !portId
    ) {
      throw new BadRequestException(`Role ${dto.role} requires portId`);
    }
    if (dto.role === UserRole.OPERATOR_KAPAL && !dto.operatorId) {
      throw new BadRequestException('Role OPERATOR_KAPAL requires operatorId');
    }
    if (dto.role === UserRole.TENANT && !dto.tenantId) {
      throw new BadRequestException('Role TENANT requires tenantId');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: dto.role,
          portId,
          operatorId: dto.operatorId ?? null,
          tenantId: dto.tenantId ?? null,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          portId: true,
          operatorId: true,
          tenantId: true,
          isActive: true,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'USER_CREATED',
        entityName: 'users',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });
  }

  async updateStatus(
    userId: number,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException(`User #${userId} not found`);
    if (target.id === actor.id) {
      throw new ForbiddenException('Cannot change your own account status');
    }
    if (
      actor.role === UserRole.ADMIN_PELABUHAN &&
      target.role !== UserRole.PETUGAS_DERMAGA &&
      target.role !== UserRole.BENDAHARA
    ) {
      throw new ForbiddenException(
        'ADMIN_PELABUHAN can only manage PETUGAS_DERMAGA or BENDAHARA accounts',
      );
    }
    if (scope.portId && target.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port user management forbidden');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive: dto.isActive },
        select: { id: true, email: true, role: true, isActive: true },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'USER_STATUS_UPDATED',
        entityName: 'users',
        entityId: userId,
        beforeData: { isActive: target.isActive },
        afterData: { isActive: dto.isActive },
        tx,
      });

      return updated;
    });
  }
}

