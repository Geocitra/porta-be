import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  expandEquivalentRoles,
} from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user context');
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const effectiveRoles = expandEquivalentRoles(requiredRoles);
      if (!effectiveRoles.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} is not permitted to perform this action`,
        );
      }
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = new Set<string>();
      for (const assignment of user.activeAssignments ?? []) {
        for (const code of assignment.permissionCodes) {
          userPermissions.add(code);
        }
      }
      // If user has explicit active assignments with permissionCodes, enforce them
      if (user.activeAssignments && user.activeAssignments.length > 0 && userPermissions.size > 0) {
        const hasAnyPermission = requiredPermissions.some((perm) => userPermissions.has(perm));
        if (!hasAnyPermission) {
          throw new ForbiddenException(
            `Missing required permission: [${requiredPermissions.join(', ')}]`,
          );
        }
      }
    }

    return true;
  }
}
