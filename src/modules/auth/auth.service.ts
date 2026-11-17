import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OperatorProfile, UserRole, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { LoginDto } from './dto/login.dto';
import { RegisterOperatorDto, RegisterTenantDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  async registerOperator(dto: RegisterOperatorDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const operator = await tx.shipOperator.create({
        data: {
          name: dto.companyName,
          npwp: dto.npwp,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          operatorProfile: dto.operatorProfile ?? OperatorProfile.REGULAR_SCHEDULED,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: UserRole.OPERATOR_KAPAL,
          operatorId: operator.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'OPERATOR_REGISTERED',
        entityName: 'ship_operators',
        entityId: operator.id,
        afterData: { operatorId: operator.id, companyName: operator.name, email: user.email },
        tx,
      });

      return { user, operator };
    });

    const accessToken = await this.jwtService.signAsync({
      sub: created.user.id,
      email: created.user.email,
    });

    return {
      accessToken,
      user: {
        id: created.user.id,
        email: created.user.email,
        fullName: created.user.fullName,
        role: created.user.role,
        operatorId: created.operator.id,
        operatorVerificationStatus: created.operator.verificationStatus,
      },
    };
  }

  async registerTenant(dto: RegisterTenantDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.businessName,
          npwp: dto.npwp,
          nib: dto.nib,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          verificationStatus: VerificationStatus.PENDING,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: UserRole.TENANT,
          tenantId: tenant.id,
        },
      });

      await this.auditLog.record({
        actorId: user.id,
        action: 'TENANT_REGISTERED',
        entityName: 'tenants',
        entityId: tenant.id,
        afterData: { tenantId: tenant.id, businessName: tenant.name, email: user.email },
        tx,
      });

      return { user, tenant };
    });

    const accessToken = await this.jwtService.signAsync({
      sub: created.user.id,
      email: created.user.email,
    });

    return {
      accessToken,
      user: {
        id: created.user.id,
        email: created.user.email,
        fullName: created.user.fullName,
        role: created.user.role,
        tenantId: created.tenant.id,
        tenantVerificationStatus: created.tenant.verificationStatus,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        operator: { select: { verificationStatus: true } },
        tenant: { select: { verificationStatus: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive user');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials or inactive user');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        portId: user.portId,
        operatorId: user.operatorId,
        operatorVerificationStatus: user.operator?.verificationStatus ?? null,
        tenantId: user.tenantId,
        tenantVerificationStatus: user.tenant?.verificationStatus ?? null,
      },
    };
  }
}
