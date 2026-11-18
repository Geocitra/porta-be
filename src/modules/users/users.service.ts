import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  AuthenticatedUser,
  isPetugasRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import {
  CreateUserDto,
  ResetUserPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/users.dto';

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  role: true,
  portId: true,
  divisionId: true,
  operatorId: true,
  tenantId: true,
  isActive: true,
  mustChangePassword: true,
  passwordChangedAt: true,
  createdAt: true,
  port: { select: { id: true, code: true, name: true } },
  division: { select: { id: true, code: true, name: true } },
  assignments: {
    where: { status: 'ACTIVE' as const },
    select: {
      id: true,
      assignmentCode: true,
      portId: true,
      terminalId: true,
      berthId: true,
      taskTypes: true,
      permissionCodes: true,
      status: true,
    },
  },
} as const;

const PORT_BOUND_ROLES: UserRole[] = [
  UserRole.KEPALA_PELABUHAN,
  UserRole.PETUGAS_PELABUHAN,
  UserRole.PETUGAS_DERMAGA,
  UserRole.BENDAHARA,
];

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
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      select: USER_PUBLIC_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  private assertCanManageUser(
    actor: AuthenticatedUser,
    target: { id: number; role: UserRole; portId: number | null },
    scope: ScopeFilter,
    actionLabel: string,
  ) {
    if (target.id === actor.id) {
      throw new ForbiddenException(`Tidak dapat ${actionLabel} akun Anda sendiri dari menu ini.`);
    }
    if (
      actor.role === UserRole.ADMIN_PELABUHAN &&
      !isPetugasRole(target.role) &&
      target.role !== UserRole.BENDAHARA
    ) {
      throw new ForbiddenException(
        'ADMIN_PELABUHAN hanya dapat mengelola akun PETUGAS_PELABUHAN / PETUGAS_DERMAGA atau BENDAHARA.',
      );
    }
    if (scope.portId && target.portId !== scope.portId) {
      throw new ForbiddenException('Tidak diizinkan mengelola pengguna lintas pelabuhan.');
    }
  }

  private async validateRoleAndRelations(params: {
    role: UserRole;
    portId: number | null;
    divisionId: number | null;
    operatorId: number | null;
    tenantId: number | null;
  }) {
    if (PORT_BOUND_ROLES.includes(params.role) && !params.portId) {
      throw new BadRequestException(`Peran ${params.role} wajib terhubung ke pelabuhan (portId).`);
    }
    if (params.portId) {
      const port = await this.prisma.port.findUnique({ where: { id: params.portId } });
      if (!port || !port.isActive) {
        throw new NotFoundException(`Pelabuhan #${params.portId} tidak ditemukan atau tidak aktif.`);
      }
    }
    if (params.role === UserRole.KEPALA_BIDANG) {
      if (!params.divisionId) {
        throw new BadRequestException('Peran KEPALA_BIDANG wajib terhubung ke divisionId.');
      }
      const div = await this.prisma.division.findUnique({ where: { id: params.divisionId } });
      if (!div || !div.isActive) {
        throw new NotFoundException(`Bidang #${params.divisionId} tidak ditemukan atau nonaktif.`);
      }
    }
    if (params.role === UserRole.OPERATOR_KAPAL) {
      if (!params.operatorId) {
        throw new BadRequestException('Peran OPERATOR_KAPAL wajib terhubung ke operatorId.');
      }
      const op = await this.prisma.shipOperator.findUnique({ where: { id: params.operatorId } });
      if (!op || !op.isActive) {
        throw new NotFoundException(`Operator #${params.operatorId} tidak ditemukan atau nonaktif.`);
      }
    }
    if (params.role === UserRole.TENANT) {
      if (!params.tenantId) {
        throw new BadRequestException('Peran TENANT wajib terhubung ke tenantId.');
      }
      const tenant = await this.prisma.tenant.findUnique({ where: { id: params.tenantId } });
      if (!tenant || !tenant.isActive) {
        throw new NotFoundException(`Tenant #${params.tenantId} tidak ditemukan atau nonaktif.`);
      }
    }
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedUser) {
    if (actor.role === UserRole.ADMIN_PELABUHAN) {
      if (!isPetugasRole(dto.role) && dto.role !== UserRole.BENDAHARA) {
        throw new ForbiddenException(
          'ADMIN_PELABUHAN hanya dapat membuat akun PETUGAS_PELABUHAN / PETUGAS_DERMAGA atau BENDAHARA.',
        );
      }
      if (actor.portId && dto.portId && dto.portId !== actor.portId) {
        throw new ForbiddenException('Tidak dapat membuat pengguna untuk pelabuhan lain.');
      }
    }

    const email = dto.email.trim().toLowerCase();
    const username = dto.username ? dto.username.trim().toLowerCase() : null;

    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new ConflictException('Email sudah terdaftar.');

    if (username) {
      const existingUsername = await this.prisma.user.findUnique({ where: { username } });
      if (existingUsername) throw new ConflictException('Username sudah digunakan.');
    }

    const portId =
      actor.role === UserRole.ADMIN_PELABUHAN && actor.portId
        ? actor.portId
        : (dto.portId ?? null);
    const divisionId = dto.divisionId ?? null;
    const operatorId = dto.operatorId ?? null;
    const tenantId = dto.tenantId ?? null;

    await this.validateRoleAndRelations({
      role: dto.role,
      portId,
      divisionId,
      operatorId,
      tenantId,
    });

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: dto.role,
          portId,
          divisionId,
          operatorId,
          tenantId,
          mustChangePassword: dto.mustChangePassword ?? true,
        },
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: created.portId,
        action: 'USER_CREATED',
        entityName: 'users',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });
  }

  async updateUser(
    userId: number,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException(`Pengguna #${userId} tidak ditemukan.`);

    this.assertCanManageUser(actor, target, scope, 'mengubah');

    if (
      actor.role === UserRole.ADMIN_PELABUHAN &&
      dto.role &&
      !isPetugasRole(dto.role) &&
      dto.role !== UserRole.BENDAHARA
    ) {
      throw new ForbiddenException(
        'ADMIN_PELABUHAN hanya dapat menetapkan peran PETUGAS_PELABUHAN / PETUGAS_DERMAGA atau BENDAHARA.',
      );
    }

    const nextEmail = dto.email ? dto.email.trim().toLowerCase() : undefined;
    const nextUsername =
      dto.username !== undefined
        ? dto.username
          ? dto.username.trim().toLowerCase()
          : null
        : undefined;

    if (nextEmail && nextEmail !== target.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: nextEmail } });
      if (taken) throw new ConflictException('Email sudah digunakan pengguna lain.');
    }

    if (nextUsername && nextUsername !== target.username) {
      const taken = await this.prisma.user.findUnique({ where: { username: nextUsername } });
      if (taken) throw new ConflictException('Username sudah digunakan pengguna lain.');
    }

    const nextRole = dto.role ?? target.role;
    const nextPortId =
      actor.role === UserRole.ADMIN_PELABUHAN && actor.portId
        ? actor.portId
        : dto.portId !== undefined
          ? dto.portId
          : target.portId;
    const nextDivisionId =
      dto.divisionId !== undefined ? dto.divisionId : target.divisionId;

    await this.validateRoleAndRelations({
      role: nextRole,
      portId: nextPortId,
      divisionId: nextDivisionId,
      operatorId: target.operatorId,
      tenantId: target.tenantId,
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
          ...(nextEmail ? { email: nextEmail } : {}),
          ...(nextUsername !== undefined ? { username: nextUsername } : {}),
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.portId !== undefined ? { portId: nextPortId } : {}),
          ...(dto.divisionId !== undefined ? { divisionId: nextDivisionId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: updated.portId,
        action: 'USER_UPDATED',
        entityName: 'users',
        entityId: userId,
        beforeData: {
          email: target.email,
          username: target.username,
          fullName: target.fullName,
          role: target.role,
          portId: target.portId,
          divisionId: target.divisionId,
          isActive: target.isActive,
        },
        afterData: updated,
        tx,
      });

      return updated;
    });
  }

  async updateStatus(
    userId: number,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException(`Pengguna #${userId} tidak ditemukan.`);

    this.assertCanManageUser(actor, target, scope, 'mengubah status');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive: dto.isActive },
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: target.portId,
        action: 'USER_STATUS_UPDATED',
        entityName: 'users',
        entityId: userId,
        beforeData: { isActive: target.isActive },
        afterData: { isActive: updated.isActive },
        tx,
      });

      return updated;
    });
  }

  async resetPassword(
    userId: number,
    dto: ResetUserPasswordDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException(`Pengguna #${userId} tidak ditemukan.`);

    this.assertCanManageUser(actor, target, scope, 'mereset kata sandi');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: dto.mustChangePassword ?? true,
          passwordChangedAt: new Date(),
        },
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: target.portId,
        action: 'USER_PASSWORD_RESET',
        entityName: 'users',
        entityId: userId,
        afterData: { mustChangePassword: updated.mustChangePassword },
        tx,
      });

      return updated;
    });
  }
}
