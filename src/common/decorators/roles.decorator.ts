import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Reusable Role Groups (Best Practice to prevent merge conflicts across controllers)
 */
export const PORT_MONITORING_AND_READ_ROLES: UserRole[] = [
  UserRole.SUPERADMIN,
  UserRole.KEPALA_DINAS,
  UserRole.KEPALA_BIDANG,
  UserRole.KEPALA_PELABUHAN,
  UserRole.ADMIN_PELABUHAN,
  UserRole.PETUGAS_PELABUHAN,
  UserRole.PETUGAS_DERMAGA,
  UserRole.PETUGAS_RUANGAN,
  UserRole.BENDAHARA,
  UserRole.DISHUB_EKSEKUTIF,
];

export const PORT_OPERATIONAL_EXECUTION_ROLES: UserRole[] = [
  UserRole.ADMIN_PELABUHAN,
  UserRole.PETUGAS_PELABUHAN,
  UserRole.PETUGAS_DERMAGA,
  UserRole.PETUGAS_RUANGAN,
];

export const PORT_STRUCTURAL_APPROVER_ROLES: UserRole[] = [
  UserRole.KEPALA_PELABUHAN,
  UserRole.ADMIN_PELABUHAN,
];
