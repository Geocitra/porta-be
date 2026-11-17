import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export interface ScopeFilter {
  portId?: number;
  operatorId?: number;
  tenantId?: number;
}

/**
 * Enforces multi-port and operator/tenant isolation on every scoped endpoint.
 * - SUPERADMIN & DISHUB_EKSEKUTIF: global read/scope (can filter by query portId)
 * - ADMIN_PELABUHAN, PETUGAS_DERMAGA, BENDAHARA: strictly locked to user.portId
 * - OPERATOR_KAPAL: strictly locked to user.operatorId
 * - TENANT: strictly locked to user.tenantId
 */
@Injectable()
export class PortScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Unauthenticated request');
    }

    const scope: ScopeFilter = {};

    if (user.role === UserRole.SUPERADMIN || user.role === UserRole.DISHUB_EKSEKUTIF) {
      if (request.query?.portId) {
        scope.portId = Number(request.query.portId);
      }
    } else if (user.role === UserRole.OPERATOR_KAPAL) {
      if (!user.operatorId) {
        throw new ForbiddenException('Operator account is not linked to any ship operator');
      }
      scope.operatorId = user.operatorId;
    } else if (user.role === UserRole.TENANT) {
      if (!user.tenantId) {
        throw new ForbiddenException('Tenant account is not linked to any tenant profile');
      }
      scope.tenantId = user.tenantId;
    } else {
      if (!user.portId) {
        throw new ForbiddenException('Port staff account is not assigned to any port');
      }
      const requestedPortId = request.body?.portId ?? request.query?.portId ?? request.params?.portId;
      if (requestedPortId !== undefined && Number(requestedPortId) !== user.portId) {
        throw new ForbiddenException('Cross-port access is forbidden');
      }
      scope.portId = user.portId;
    }

    request.portScope = scope;
    return true;
  }
}

