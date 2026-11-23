import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TaskType, UserRole } from '@prisma/client';

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
  portId: number | null;
  divisionId?: number | null;
  operatorId: number | null;
  tenantId: number | null;
  mustChangePassword: boolean;
  allowedPortIds?: number[];
  activeAssignments?: ActiveAssignmentContext[];
}

export function isPetugasRole(role: UserRole): boolean {
  return (
    role === UserRole.PETUGAS_PELABUHAN ||
    role === UserRole.PETUGAS_DERMAGA ||
    role === UserRole.PETUGAS_RUANGAN
  );
}

export function isKadisRole(role: UserRole): boolean {
  return role === UserRole.KEPALA_DINAS || role === UserRole.DISHUB_EKSEKUTIF;
}

export function expandEquivalentRoles(roles: UserRole[]): UserRole[] {
  const expanded = new Set<UserRole>(roles);
  if (expanded.has(UserRole.PETUGAS_PELABUHAN) || expanded.has(UserRole.PETUGAS_DERMAGA)) {
    expanded.add(UserRole.PETUGAS_PELABUHAN);
    expanded.add(UserRole.PETUGAS_DERMAGA);
  }
  if (expanded.has(UserRole.KEPALA_DINAS) || expanded.has(UserRole.DISHUB_EKSEKUTIF)) {
    expanded.add(UserRole.KEPALA_DINAS);
    expanded.add(UserRole.DISHUB_EKSEKUTIF);
  }
  return Array.from(expanded);
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
