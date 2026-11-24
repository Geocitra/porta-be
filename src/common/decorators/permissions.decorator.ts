import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequirePermissions = Permissions;

export const ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY = 'allow_when_must_change_password';
export const AllowWhenMustChangePassword = () =>
  SetMetadata(ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY, true);
