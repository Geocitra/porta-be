import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { OperatorProfile, UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  AuthenticatedUser,
  enrichUserWithRoleTaxonomy,
} from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { ChangeMyPasswordDto, UpdateMyProfileDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOperatorDto, RegisterTenantDto } from './dto/register.dto';

export const COMPANY_ONBOARDED_EVENT = 'company.onboarded';

export interface CompanyOnboardedEvent {
  entityType: 'OPERATOR' | 'TENANT';
  entityId: number;
  companyName: string;
  actorId: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private toAuthUserPayload(user: {
    id: number;
    email: string;
    username: string | null;
    fullName: string;
    role: UserRole;
    portId: number | null;
    divisionId?: number | null;
    operatorId: number | null;
    tenantId: number | null;
    mustChangePassword: boolean;
    operator?: { verificationStatus: VerificationStatus } | null;
    tenant?: { verificationStatus: VerificationStatus } | null;
  }) {
    return enrichUserWithRoleTaxonomy({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      portId: user.portId,
      divisionId: user.divisionId ?? null,
      operatorId: user.operatorId,
      operatorVerificationStatus: user.operator?.verificationStatus ?? null,
      tenantId: user.tenantId,
      tenantVerificationStatus: user.tenant?.verificationStatus ?? null,
      mustChangePassword: user.mustChangePassword,
    });
  }

  async registerOperator(dto: RegisterOperatorDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.shipOperator.create({
        data: {
          name: dto.companyName.trim(),
          npwp: dto.npwp,
          phone: dto.phone,
          email,
          address: dto.address,
          operatorProfile: dto.operatorProfile ?? OperatorProfile.REGULAR_SCHEDULED,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: UserRole.OPERATOR_KAPAL,
          operatorId: operator.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'OPERATOR_REGISTERED',
        entityName: 'ship_operators',
        entityId: operator.id,
        afterData: { operatorId: operator.id, companyName: operator.name, email: user.email },
        tx,
      });

      return { user, operator };
    });

    this.eventEmitter.emit(COMPANY_ONBOARDED_EVENT, {
      entityType: 'OPERATOR',
      entityId: created.operator.id,
      companyName: created.operator.name,
      actorId: created.user.id,
    } satisfies CompanyOnboardedEvent);

    const accessToken = await this.jwtService.signAsync({
      sub: created.user.id,
      email: created.user.email,
    });

    return {
      accessToken,
      user: this.toAuthUserPayload({
        ...created.user,
        operator: { verificationStatus: created.operator.verificationStatus },
      }),
    };
  }

  async registerTenant(dto: RegisterTenantDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.businessName.trim(),
          npwp: dto.npwp,
          nib: dto.nib,
          phone: dto.phone,
          email,
          address: dto.address,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: dto.fullName.trim(),
          role: UserRole.TENANT,
          tenantId: tenant.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'TENANT_REGISTERED',
        entityName: 'tenants',
        entityId: tenant.id,
        afterData: { tenantId: tenant.id, businessName: tenant.name, email: user.email },
        tx,
      });

      return { user, tenant };
    });

    this.eventEmitter.emit(COMPANY_ONBOARDED_EVENT, {
      entityType: 'TENANT',
      entityId: created.tenant.id,
      companyName: created.tenant.name,
      actorId: created.user.id,
    } satisfies CompanyOnboardedEvent);

    const accessToken = await this.jwtService.signAsync({
      sub: created.user.id,
      email: created.user.email,
    });

    return {
      accessToken,
      user: this.toAuthUserPayload({
        ...created.user,
        tenant: { verificationStatus: created.tenant.verificationStatus },
      }),
    };
  }

  async login(dto: LoginDto) {
    const rawIdentifier = (dto.identifier || dto.email || '').trim().toLowerCase();
    if (!rawIdentifier) {
      throw new BadRequestException('Email atau username wajib diisi');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: rawIdentifier }, { username: rawIdentifier }],
      },
      include: {
        operator: { select: { verificationStatus: true } },
        tenant: { select: { verificationStatus: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Kredensial salah atau akun tidak aktif');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Kredensial salah atau akun tidak aktif');
    }

    await this.auditLog.record({
      actorId: user.id,
      actorRole: user.role,
      portId: user.portId,
      action: 'USER_LOGIN',
      entityName: 'users',
      entityId: user.id,
      afterData: { email: user.email, role: user.role, portId: user.portId },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      requirePasswordChange: user.mustChangePassword,
      user: this.toAuthUserPayload(user),
    };
  }

  async updateMyProfile(actor: AuthenticatedUser, dto: UpdateMyProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        operator: { select: { verificationStatus: true } },
        tenant: { select: { verificationStatus: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const nextEmail = dto.email ? dto.email.trim().toLowerCase() : undefined;
    const nextUsername =
      dto.username !== undefined
        ? dto.username
          ? dto.username.trim().toLowerCase()
          : null
        : undefined;

    const isChangingCredential =
      (nextEmail !== undefined && nextEmail !== user.email) ||
      (nextUsername !== undefined && nextUsername !== user.username);

    if (isChangingCredential) {
      if (!dto.currentPassword) {
        throw new BadRequestException(
          'Kata sandi saat ini wajib diisi untuk mengubah email atau username',
        );
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Kata sandi saat ini salah');
      }
    }

    if (nextEmail && nextEmail !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: nextEmail } });
      if (emailTaken) throw new ConflictException('Email sudah digunakan akun lain');
    }

    if (nextUsername && nextUsername !== user.username) {
      const usernameTaken = await this.prisma.user.findUnique({
        where: { username: nextUsername },
      });
      if (usernameTaken) throw new ConflictException('Username sudah digunakan akun lain');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
          ...(nextEmail ? { email: nextEmail } : {}),
          ...(nextUsername !== undefined ? { username: nextUsername } : {}),
        },
        include: {
          operator: { select: { verificationStatus: true } },
          tenant: { select: { verificationStatus: true } },
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        portId: user.portId,
        action: 'USER_PROFILE_UPDATED',
        entityName: 'users',
        entityId: user.id,
        beforeData: { email: user.email, username: user.username, fullName: user.fullName },
        afterData: { email: updated.email, username: updated.username, fullName: updated.fullName },
        tx,
      });

      return this.toAuthUserPayload(updated);
    });
  }

  async changeMyPassword(actor: AuthenticatedUser, dto: ChangeMyPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        operator: { select: { verificationStatus: true } },
        tenant: { select: { verificationStatus: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Kata sandi saat ini salah');
    }

    if (dto.newPassword.trim() === dto.currentPassword.trim()) {
      throw new BadRequestException(
        'Kata sandi baru tidak boleh sama dengan kata sandi sementara / kata sandi saat ini.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const now = new Date();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: now,
        },
        include: {
          operator: { select: { verificationStatus: true } },
          tenant: { select: { verificationStatus: true } },
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        actorRole: user.role,
        portId: user.portId,
        action: 'USER_PASSWORD_CHANGED',
        entityName: 'users',
        entityId: user.id,
        tx,
      });

      return updated;
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      message: 'Kata sandi berhasil diperbarui.',
      accessToken,
      requirePasswordChange: false,
      user: this.toAuthUserPayload(updatedUser),
    };
  }
}
