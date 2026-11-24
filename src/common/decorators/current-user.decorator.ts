import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BerthServiceCategory, TaskType, UserRole } from '@prisma/client';
import {
  getRoleTaxonomy,
  isSpecializedOrGeneralPetugasRole,
  OperationalDomain,
} from '../authz/role-taxonomy';

export interface ActiveAssignmentContext {
  id: number;
  assignmentCode: string;
  role: UserRole;
  portId: number;
  terminalId: number | null;
  berthId: number | null;
  zoneId: number | null;
  taskTypes: TaskType[];
  permissionCodes: string[];
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  username: string | null;
  fullName: string;
  role: UserRole;
  roleLabel?: string;
  operationalDomain?: OperationalDomain;
  allowedBerthCategories?: BerthServiceCategory[];
  handledTaskTypes?: TaskType[];
  uiCapabilities?: string[];
  effectivePermissions?: string[];
  portId: number | null;
  divisionId?: number | null;
  operatorId: number | null;
  tenantId: number | null;
  mustChangePassword: boolean;
  allowedPortIds?: number[];
  activeAssignments?: ActiveAssignmentContext[];
}

export function isPetugasRole(role: UserRole): boolean {
  return isSpecializedOrGeneralPetugasRole(role);
}

export function isKadisRole(role: UserRole): boolean {
  return role === UserRole.KEPALA_DINAS || role === UserRole.DISHUB_EKSEKUTIF;
}

/**
 * Expands only true backward-compatible aliases:
 * - KEPALA_DINAS <-> DISHUB_EKSEKUTIF
 * - PETUGAS_DERMAGA <-> PETUGAS_PELABUHAN (general fallback officer roles)
 * Specialized officer roles (PETUGAS_REGISTRASI_KONTRAK, PETUGAS_DERMAGA_BARANG,
 * PETUGAS_DERMAGA_PENUMPANG, PETUGAS_RUANGAN, PETUGAS_TAGIHAN, BENDAHARA) are
 * strictly checked against their explicit domain role list.
 */
export function expandEquivalentRoles(roles: UserRole[]): UserRole[] {
  const expanded = new Set<UserRole>(roles);
  if (
    expanded.has(UserRole.PETUGAS_PELABUHAN) ||
    expanded.has(UserRole.PETUGAS_DERMAGA)
  ) {
    expanded.add(UserRole.PETUGAS_PELABUHAN);
    expanded.add(UserRole.PETUGAS_DERMAGA);
  }
  if (expanded.has(UserRole.KEPALA_DINAS) || expanded.has(UserRole.DISHUB_EKSEKUTIF)) {
    expanded.add(UserRole.KEPALA_DINAS);
    expanded.add(UserRole.DISHUB_EKSEKUTIF);
  }
  return Array.from(expanded);
}

export function enrichUserWithRoleTaxonomy<T extends { role: UserRole }>(user: T) {
  const taxonomy = getRoleTaxonomy(user.role);
  return {
    ...user,
    roleLabel: taxonomy?.roleLabel ?? user.role,
    operationalDomain: taxonomy?.operationalDomain ?? 'BERTH_GENERAL',
    allowedBerthCategories: taxonomy?.allowedBerthCategories ?? [],
    handledTaskTypes: taxonomy?.handledTaskTypes ?? [],
    uiCapabilities: taxonomy?.uiCapabilities ?? [],
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
