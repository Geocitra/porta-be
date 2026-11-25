import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { getRoleTaxonomy } from '../authz/role-taxonomy';
import {
  AuthenticatedUser,
  expandEquivalentRoles,
} from '../decorators/current-user.decorator';
import {
  ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
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

    const allowWhenMustChangePassword = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    // Hard enforcement: if an authenticated user has mustChangePassword === true,
    // block access to all operational endpoints until they change their temporary password.
    if (user && user.mustChangePassword === true && !allowWhenMustChangePassword) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message:
          'Anda wajib mengganti kata sandi sementara Anda terlebih dahulu (/api/v1/auth/me/password) sebelum dapat mengakses fitur operasional.',
      });
    }

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

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
      const userPermissions = new Set<string>(user.effectivePermissions ?? []);
      const taxonomy = getRoleTaxonomy(user.role);
      for (const defPerm of taxonomy?.defaultPermissions ?? []) {
        userPermissions.add(defPerm);
      }
      for (const assignment of user.activeAssignments ?? []) {
        for (const code of assignment.permissionCodes) {
          userPermissions.add(code);
        }
      }
      if (userPermissions.size > 0) {
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
