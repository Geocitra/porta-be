import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AssignmentStatus, UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  isKadisRole,
  isPetugasRole,
} from '../decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export interface ScopeFilter {
  portId?: number;
  allowedPortIds?: number[];
  terminalId?: number;
  berthId?: number;
  allowedBerthIds?: number[];
  divisionId?: number;
  operatorId?: number;
  tenantId?: number;
}

/**
 * Enforces multi-port, division (Kabid), berth assignment (Petugas), and operator/tenant isolation.
 * - SUPERADMIN & KEPALA_DINAS (KADIS / DISHUB_EKSEKUTIF): global read scope (can filter by query portId)
 * - KEPALA_BIDANG (KABID): restricted strictly to ports mapped to user.divisionId in division_ports
 * - KEPALA_PELABUHAN, ADMIN_PELABUHAN, BENDAHARA: strictly locked to their single port ecosystem (user.portId)
 * - PETUGAS_PELABUHAN / PETUGAS_DERMAGA: locked to user.portId + validated against active UserAssignments (berthId/terminalId)
 * - OPERATOR_KAPAL: strictly locked to user.operatorId
 * - TENANT: strictly locked to user.tenantId
 */
@Injectable()
export class PortScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Unauthenticated request');
    }

    const scope: ScopeFilter = {};
    const requestedPortIdRaw =
      request.body?.portId ?? request.query?.portId ?? request.params?.portId;
    const requestedPortId =
      requestedPortIdRaw !== undefined && requestedPortIdRaw !== '' && requestedPortIdRaw !== null
        ? Number(requestedPortIdRaw)
        : undefined;

    const requestedBerthIdRaw =
      request.body?.berthId ?? request.query?.berthId ?? request.params?.berthId;
    const requestedBerthId =
      requestedBerthIdRaw !== undefined &&
      requestedBerthIdRaw !== '' &&
      requestedBerthIdRaw !== null
        ? Number(requestedBerthIdRaw)
        : undefined;

    if (user.role === UserRole.SUPERADMIN || isKadisRole(user.role)) {
      if (requestedPortId !== undefined && !Number.isNaN(requestedPortId)) {
        scope.portId = requestedPortId;
      }
    } else if (user.role === UserRole.KEPALA_BIDANG) {
      if (!user.divisionId) {
        throw new ForbiddenException('Akun Kepala Bidang belum terhubung ke Bidang (divisionId)');
      }
      const divisionPorts = await this.prisma.divisionPort.findMany({
        where: { divisionId: user.divisionId },
        select: { portId: true },
      });
      const allowedPortIds = divisionPorts.map((dp) => dp.portId);
      if (allowedPortIds.length === 0) {
        throw new ForbiddenException('Bidang Anda belum memiliki cakupan pelabuhan aktif');
      }
      if (requestedPortId !== undefined && !allowedPortIds.includes(requestedPortId)) {
        throw new ForbiddenException(
          `Pelabuhan #${requestedPortId} berada di luar kewenangan bidang Anda`,
        );
      }
      scope.divisionId = user.divisionId;
      scope.allowedPortIds = allowedPortIds;
      user.allowedPortIds = allowedPortIds;
      if (requestedPortId !== undefined) {
        scope.portId = requestedPortId;
      } else if (allowedPortIds.length === 1) {
        scope.portId = allowedPortIds[0];
      }
    } else if (user.role === UserRole.OPERATOR_KAPAL) {
      if (!user.operatorId) {
        throw new ForbiddenException('Operator account is not linked to any ship operator');
      }
      scope.operatorId = user.operatorId;
      if (requestedPortId !== undefined && !Number.isNaN(requestedPortId)) {
        scope.portId = requestedPortId;
      }
    } else if (user.role === UserRole.TENANT) {
      if (!user.tenantId) {
        throw new ForbiddenException('Tenant account is not linked to any tenant profile');
      }
      scope.tenantId = user.tenantId;
      if (requestedPortId !== undefined && !Number.isNaN(requestedPortId)) {
        scope.portId = requestedPortId;
      }
    } else if (
      user.role === UserRole.ADMIN_PELABUHAN &&
      !user.portId
    ) {
      // Backward compatibility for legacy seed Admin without portId, while enforcing single-port lock when portId is set
      if (requestedPortId !== undefined && !Number.isNaN(requestedPortId)) {
        scope.portId = requestedPortId;
      }
    } else {
      // KEPALA_PELABUHAN, ADMIN_PELABUHAN (with portId), PETUGAS_PELABUHAN, PETUGAS_DERMAGA, BENDAHARA
      const now = new Date();
      const activeAssignments = isPetugasRole(user.role)
        ? await this.prisma.userAssignment.findMany({
            where: {
              userId: user.id,
              status: AssignmentStatus.ACTIVE,
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gte: now } }],
            },
          })
        : [];

      user.activeAssignments = activeAssignments.map((a) => ({
        id: a.id,
        assignmentCode: a.assignmentCode,
        role: a.role,
        portId: a.portId,
        terminalId: a.terminalId,
        berthId: a.berthId,
        zoneId: a.zoneId,
        taskTypes: a.taskTypes,
        permissionCodes: a.permissionCodes,
      }));

      const assignedPortIds = new Set<number>();
      if (user.portId) assignedPortIds.add(user.portId);
      for (const a of activeAssignments) {
        assignedPortIds.add(a.portId);
      }

      if (assignedPortIds.size === 0) {
        throw new ForbiddenException('Port staff account is not assigned to any port');
      }

      if (requestedPortId !== undefined && !assignedPortIds.has(requestedPortId)) {
        throw new ForbiddenException('Cross-port access is forbidden');
      }

      const effectivePortId = requestedPortId ?? user.portId ?? Array.from(assignedPortIds)[0];
      scope.portId = effectivePortId;
      scope.allowedPortIds = Array.from(assignedPortIds);

      // Berth-level assignment enforcement for PETUGAS_PELABUHAN
      if (isPetugasRole(user.role) && activeAssignments.length > 0) {
        const portAssignments = activeAssignments.filter((a) => a.portId === effectivePortId);
        const hasAllBerthAccess = portAssignments.some((a) => a.berthId === null);
        if (!hasAllBerthAccess) {
          const allowedBerthIds = portAssignments
            .map((a) => a.berthId)
            .filter((id): id is number => id !== null);
          scope.allowedBerthIds = allowedBerthIds;

          if (
            requestedBerthId !== undefined &&
            allowedBerthIds.length > 0 &&
            !allowedBerthIds.includes(requestedBerthId)
          ) {
            throw new ForbiddenException(
              `Akses ditolak: Anda tidak memiliki penugasan aktif pada Dermaga #${requestedBerthId}`,
            );
          }
        }
      }
    }

    request.portScope = scope;
    return true;
  }
}
