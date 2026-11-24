import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentStatus, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  getRoleTaxonomy,
  ROLE_GROUPS,
  ROLE_TAXONOMY_MAP,
} from '../../common/authz/role-taxonomy';
import {
  AuthenticatedUser,
  enrichUserWithRoleTaxonomy,
  isPetugasRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { CredentialGeneratorUtil } from '../../common/utils/credential-generator.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import {
  CreateUserDto,
  ResetUserPasswordDto,
  UpdateRolePermissionsDto,
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
  UserRole.ADMIN_PELABUHAN,
  ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(scope: ScopeFilter) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      select: USER_PUBLIC_SELECT,
      orderBy: { id: 'asc' },
    });

    return users.map((u) => enrichUserWithRoleTaxonomy(u));
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
    if (actor.role === UserRole.ADMIN_PELABUHAN) {
      if (!isPetugasRole(target.role) && target.role !== UserRole.BENDAHARA) {
        throw new ForbiddenException(
          'ADMIN_PELABUHAN hanya dapat mengelola akun Petugas Pelabuhan / Petugas Spesialis atau Bendahara.',
        );
      }
    } else if (actor.role === UserRole.KEPALA_PELABUHAN) {
      if (
        !isPetugasRole(target.role) &&
        target.role !== UserRole.BENDAHARA &&
        target.role !== UserRole.ADMIN_PELABUHAN
      ) {
        throw new ForbiddenException(
          'KEPALA_PELABUHAN hanya dapat mengelola akun Admin Pelabuhan, Bendahara, atau Petugas di pelabuhannya.',
        );
      }
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

  private async resolveUniqueUsername(
    requestedUsername: string | undefined,
    params: { fullName: string; email: string; role: UserRole },
  ): Promise<{ username: string; isAutoGenerated: boolean }> {
    if (requestedUsername && requestedUsername.trim().length > 0) {
      const normalized = requestedUsername.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({
        where: { username: normalized },
      });
      if (existing) {
        throw new ConflictException('Username sudah digunakan.');
      }
      return { username: normalized, isAutoGenerated: false };
    }

    const base = CredentialGeneratorUtil.generateBaseUsername(params);
    let candidate = base;
    let counter = 1;

    while (this.prisma.user?.findUnique) {
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!taken) break;
      counter += 1;
      candidate = `${base}.${counter}`.slice(0, 50);
    }

    return { username: candidate, isAutoGenerated: true };
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedUser) {
    if (actor.role === UserRole.ADMIN_PELABUHAN) {
      if (!isPetugasRole(dto.role) && dto.role !== UserRole.BENDAHARA) {
        throw new ForbiddenException(
          'ADMIN_PELABUHAN hanya dapat membuat akun Petugas Pelabuhan / Petugas Spesialis atau Bendahara.',
        );
      }
      if (actor.portId && dto.portId && dto.portId !== actor.portId) {
        throw new ForbiddenException('Tidak dapat membuat pengguna untuk pelabuhan lain.');
      }
    } else if (actor.role === UserRole.KEPALA_PELABUHAN) {
      if (
        !isPetugasRole(dto.role) &&
        dto.role !== UserRole.BENDAHARA &&
        dto.role !== UserRole.ADMIN_PELABUHAN
      ) {
        throw new ForbiddenException(
          'KEPALA_PELABUHAN hanya dapat membuat akun Admin Pelabuhan, Bendahara, atau Petugas di pelabuhannya.',
        );
      }
      if (actor.portId && dto.portId && dto.portId !== actor.portId) {
        throw new ForbiddenException('Tidak dapat membuat pengguna untuk pelabuhan lain.');
      }
    }

    const email = dto.email.trim().toLowerCase();
    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new ConflictException('Email sudah terdaftar.');

    const { username, isAutoGenerated: isUsernameAutoGenerated } =
      await this.resolveUniqueUsername(dto.username, {
        fullName: dto.fullName,
        email,
        role: dto.role,
      });

    const isPasswordAutoGenerated = !dto.password || dto.password.trim().length === 0;
    const rawTemporaryPassword = isPasswordAutoGenerated
      ? CredentialGeneratorUtil.generateTemporaryPassword()
      : dto.password!.trim();

    const portId =
      (actor.role === UserRole.ADMIN_PELABUHAN || actor.role === UserRole.KEPALA_PELABUHAN) &&
      actor.portId
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

    const passwordHash = await bcrypt.hash(rawTemporaryPassword, 10);
    const mustChangePassword = dto.mustChangePassword ?? true;
    const taxonomy = getRoleTaxonomy(dto.role);
    const shouldAutoAssign =
      (dto.autoCreateAssignment ?? true) &&
      portId !== null &&
      (isPetugasRole(dto.role) || dto.role === UserRole.BENDAHARA);

    const createdUser = await this.prisma.$transaction(async (tx) => {
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
          mustChangePassword,
        },
        select: USER_PUBLIC_SELECT,
      });

      if (shouldAutoAssign && tx.userAssignment?.create) {
        await tx.userAssignment.create({
          data: {
            assignmentCode: DocNumberUtil.generate('ASG', portId!),
            userId: created.id,
            role: created.role,
            portId: portId!,
            taskTypes: taxonomy.handledTaskTypes,
            permissionCodes: taxonomy.defaultPermissions,
            startDate: new Date(),
            status: AssignmentStatus.ACTIVE,
            assignedById: actor.id,
            notes: `Penugasan otomatis saat pembuatan akun (${taxonomy.roleLabel})`,
          },
        });
      }

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId: created.portId,
        action: 'USER_CREATED',
        entityName: 'users',
        entityId: created.id,
        afterData: {
          id: created.id,
          email: created.email,
          username: created.username,
          fullName: created.fullName,
          role: created.role,
          portId: created.portId,
          mustChangePassword: created.mustChangePassword,
          isPasswordAutoGenerated,
          isUsernameAutoGenerated,
        },
        tx,
      });

      if (tx.user?.findUnique) {
        const refreshed = await tx.user.findUnique({
          where: { id: created.id },
          select: USER_PUBLIC_SELECT,
        });
        return refreshed ?? created;
      }
      return created;
    });

    const enrichedUser = enrichUserWithRoleTaxonomy(createdUser);

    return {
      ...enrichedUser,
      user: enrichedUser,
      generatedCredentials: {
        email: enrichedUser.email,
        username: enrichedUser.username,
        temporaryPassword: rawTemporaryPassword,
        isPasswordAutoGenerated,
        isUsernameAutoGenerated,
        mustChangePassword: enrichedUser.mustChangePassword,
        copyNotice:
          'PENTING: Salin username dan kata sandi sementara ini sekarang untuk dikirimkan kepada petugas/pengguna. Kata sandi sementara hanya ditampilkan satu kali di layar ini, dan pengguna wajib menggantinya saat pertama kali login.',
      },
    };
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
        'ADMIN_PELABUHAN hanya dapat menetapkan peran Petugas Pelabuhan / Petugas Spesialis atau Bendahara.',
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
      (actor.role === UserRole.ADMIN_PELABUHAN || actor.role === UserRole.KEPALA_PELABUHAN) &&
      actor.portId
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
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
        portId: res.portId,
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
        afterData: res,
        tx,
      });

      return res;
    });

    return enrichUserWithRoleTaxonomy(updated);
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
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
        afterData: { isActive: res.isActive },
        tx,
      });

      return res;
    });

    return enrichUserWithRoleTaxonomy(updated);
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

    const isPasswordAutoGenerated = !dto.newPassword || dto.newPassword.trim().length === 0;
    const rawTemporaryPassword = isPasswordAutoGenerated
      ? CredentialGeneratorUtil.generateTemporaryPassword()
      : dto.newPassword!.trim();

    const passwordHash = await bcrypt.hash(rawTemporaryPassword, 10);
    const mustChangePassword = dto.mustChangePassword ?? true;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword,
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
        afterData: {
          mustChangePassword: res.mustChangePassword,
          isPasswordAutoGenerated,
        },
        tx,
      });

      return res;
    });

    const enrichedUser = enrichUserWithRoleTaxonomy(updated);

    return {
      ...enrichedUser,
      user: enrichedUser,
      generatedCredentials: {
        email: enrichedUser.email,
        username: enrichedUser.username,
        temporaryPassword: rawTemporaryPassword,
        isPasswordAutoGenerated,
        mustChangePassword: enrichedUser.mustChangePassword,
        copyNotice:
          'PENTING: Salin kata sandi sementara baru ini untuk diberikan kepada pengguna yang lupa kata sandi. Sesi login lama pengguna otomatis dihentikan dan pengguna wajib mengganti kata sandi ini setelah login kembali.',
      },
    };
  }

  // ============================================================================
  // DYNAMIC RBAC ROLE & PERMISSION MANAGEMENT PLANE
  // ============================================================================

  async getRbacRolesCatalog(scope?: ScopeFilter) {
    const [dbRolePermissions, userCounts] = await Promise.all([
      this.prisma.rolePermission?.findMany
        ? this.prisma.rolePermission.findMany({
            include: { permission: true },
          })
        : Promise.resolve([]),
      this.prisma.user?.groupBy
        ? this.prisma.user.groupBy({
            by: ['role'],
            where: {
              isActive: true,
              ...(scope?.portId ? { portId: scope.portId } : {}),
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const rolePermsMap = new Map<UserRole, string[]>();
    for (const rp of dbRolePermissions) {
      const list = rolePermsMap.get(rp.role) ?? [];
      list.push(rp.permission.code);
      rolePermsMap.set(rp.role, list);
    }

    const countMap = new Map<UserRole, number>();
    for (const row of userCounts) {
      countMap.set(row.role, row._count._all);
    }

    const roles = Object.values(ROLE_TAXONOMY_MAP).map((def) => {
      const dbPerms = rolePermsMap.get(def.role) ?? [];
      const effectivePermissions = Array.from(
        new Set([...def.defaultPermissions, ...dbPerms]),
      );
      return {
        ...def,
        databasePermissions: dbPerms,
        effectivePermissions,
        activeUsersCount: countMap.get(def.role) ?? 0,
      };
    });

    return {
      totalRoles: roles.length,
      roles,
    };
  }

  async updateRolePermissions(
    role: UserRole,
    dto: UpdateRolePermissionsDto,
    actor: AuthenticatedUser,
  ) {
    if (actor.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException(
        'Hanya SUPERADMIN yang berwenang mengubah matriks izin (RolePermission) tingkat sistem.',
      );
    }

    const taxonomy = getRoleTaxonomy(role);
    if (!taxonomy) {
      throw new NotFoundException(`Role ${role} tidak ditemukan dalam taksonomi sistem.`);
    }

    const normalizedCodes = Array.from(
      new Set(
        (dto.permissionCodes ?? [])
          .map((c) => c.trim())
          .filter((c) => c.length > 0),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      const permissionIds: number[] = [];
      for (const code of normalizedCodes) {
        const perm = await tx.permission.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name: code.replace(/[:._]/g, ' ').toUpperCase(),
            module: taxonomy.operationalDomain,
          },
        });
        permissionIds.push(perm.id);
      }

      await tx.rolePermission.deleteMany({
        where: { role },
      });

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            role,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ROLE_PERMISSIONS_UPDATED',
        entityName: 'role_permissions',
        entityId: role,
        afterData: {
          role,
          permissionCodes: normalizedCodes,
        },
        tx,
      });
    });

    return {
      role,
      roleLabel: taxonomy.roleLabel,
      operationalDomain: taxonomy.operationalDomain,
      updatedPermissions: normalizedCodes,
    };
  }
}
