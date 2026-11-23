import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AuthenticatedUser,
  enrichUserWithRoleTaxonomy,
} from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: number;
  email: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev-only-porta-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
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
        assignments: {
          where: {
            status: AssignmentStatus.ACTIVE,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
          select: {
            id: true,
            assignmentCode: true,
            role: true,
            portId: true,
            terminalId: true,
            berthId: true,
            zoneId: true,
            taskTypes: true,
            permissionCodes: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or does not exist');
    }

    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000
    ) {
      throw new UnauthorizedException(
        'Sesi berakhir karena kata sandi telah diubah. Silakan login kembali.',
      );
    }

    return enrichUserWithRoleTaxonomy({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      portId: user.portId,
      divisionId: user.divisionId,
      operatorId: user.operatorId,
      tenantId: user.tenantId,
      mustChangePassword: user.mustChangePassword,
      activeAssignments: user.assignments,
    });
  }
}
