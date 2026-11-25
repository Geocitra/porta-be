import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BerthApprovalStatus, BerthServiceCategory, PortCategory, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import {
  CreateBerthDto,
  CreateDivisionDto,
  CreatePortDto,
  CreatePortFacilityDto,
  CreatePortZoneDto,
  CreateTerminalDto,
  UpdateBerthDto,
  UpdatePortDto,
  UpdateTerminalDto,
} from './dto/ports.dto';

@Injectable()
export class PortsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAllPorts(portCategory?: PortCategory, scope?: ScopeFilter) {
    return this.prisma.port.findMany({
      where: {
        isActive: true,
        ...(portCategory ? { portCategory } : {}),
        ...(scope?.portId ? { id: scope.portId } : {}),
        ...(scope?.allowedPortIds && !scope.portId ? { id: { in: scope.allowedPortIds } } : {}),
      },
      include: {
        terminals: { where: { isActive: true }, orderBy: { code: 'asc' } },
        berths: {
          where: { isActive: true },
          include: { terminal: { select: { id: true, code: true, name: true, terminalType: true } } },
          orderBy: { code: 'asc' },
        },
        zones: { where: { isActive: true }, orderBy: { code: 'asc' } },
        facilities: { where: { isActive: true }, orderBy: { code: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createPort(dto: CreatePortDto, actor?: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const port = await tx.port.create({
        data: {
          code: dto.code,
          name: dto.name,
          location: dto.location,
          portCategory: dto.portCategory,
          portClassification: dto.portClassification ?? 'PENGUMPUL',
        },
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: port.id,
        action: 'PORT_CREATED',
        entityName: 'ports',
        entityId: port.id,
        afterData: port,
        tx,
      });
      return port;
    });
  }

  async updatePort(portId: number, dto: UpdatePortDto, actor?: AuthenticatedUser) {
    const existing = await this.prisma.port.findUnique({ where: { id: portId } });
    if (!existing) throw new NotFoundException(`Port #${portId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.port.update({
        where: { id: portId },
        data: dto,
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId,
        action: 'PORT_UPDATED',
        entityName: 'ports',
        entityId: portId,
        beforeData: existing,
        afterData: updated,
        tx,
      });
      return updated;
    });
  }

  findTerminals(portId?: number, scope?: ScopeFilter) {
    const effectivePortId = scope?.portId ?? portId;
    return this.prisma.terminal.findMany({
      where: {
        isActive: true,
        ...(effectivePortId ? { portId: effectivePortId } : {}),
        ...(scope?.allowedPortIds && !effectivePortId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: {
        port: { select: { id: true, code: true, name: true } },
        berths: { where: { isActive: true }, orderBy: { code: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createTerminal(dto: CreateTerminalDto, actor?: AuthenticatedUser, scope?: ScopeFilter) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port) throw new NotFoundException(`Port #${dto.portId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const terminal = await tx.terminal.create({
        data: {
          portId: dto.portId,
          code: dto.code,
          name: dto.name,
          terminalType: dto.terminalType,
          terminalClass: dto.terminalClass,
          description: dto.description,
        },
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: terminal.portId,
        action: 'TERMINAL_CREATED',
        entityName: 'terminals',
        entityId: terminal.id,
        afterData: terminal,
        tx,
      });
      return terminal;
    });
  }

  async updateTerminal(
    terminalId: number,
    dto: UpdateTerminalDto,
    actor?: AuthenticatedUser,
    scope?: ScopeFilter,
  ) {
    const existing = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!existing) throw new NotFoundException(`Terminal #${terminalId} not found`);
    if (scope?.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.terminal.update({
        where: { id: terminalId },
        data: dto,
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: existing.portId,
        action: 'TERMINAL_UPDATED',
        entityName: 'terminals',
        entityId: terminalId,
        beforeData: existing,
        afterData: updated,
        tx,
      });
      return updated;
    });
  }

  async findBerthsByPort(
    portId?: number,
    berthServiceCategory?: BerthServiceCategory,
    scope?: ScopeFilter,
  ) {
    const effectivePortId = scope?.portId ?? portId;
    return this.prisma.berth.findMany({
      where: {
        isActive: true,
        ...(effectivePortId ? { portId: effectivePortId } : {}),
        ...(scope?.allowedPortIds && !effectivePortId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope?.allowedBerthIds ? { id: { in: scope.allowedBerthIds } } : {}),
        ...(berthServiceCategory ? { berthServiceCategory } : {}),
      },
      include: {
        terminal: { select: { id: true, code: true, name: true, terminalType: true } },
        zones: { where: { isActive: true } },
        facilities: { where: { isActive: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getBerthsSchedule(portId: number, dateStr?: string, scope?: ScopeFilter) {
    const effectivePortId = scope?.portId ?? portId;
    if (scope?.portId && portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const baseDate = dateStr ? new Date(`${dateStr}T00:00:00+09:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      throw new BadRequestException('Format tanggal tidak valid (gunakan YYYY-MM-DD)');
    }

    const isoDate = dateStr || baseDate.toISOString().slice(0, 10);
    const dayStart = new Date(`${isoDate}T00:00:00+09:00`);
    const dayEnd = new Date(`${isoDate}T23:59:59.999+09:00`);

    const berths = await this.prisma.berth.findMany({
      where: {
        isActive: true,
        portId: effectivePortId,
        ...(scope?.allowedBerthIds ? { id: { in: scope.allowedBerthIds } } : {}),
      },
      orderBy: { code: 'asc' },
    });

    const records = await this.prisma.berthingRecord.findMany({
      where: {
        portId: effectivePortId,
        approvalStatus: { not: BerthApprovalStatus.REJECTED },
      },
      include: {
        visit: {
          select: {
            id: true,
            visitNumber: true,
            eta: true,
            etd: true,
            status: true,
            vessel: { select: { id: true, name: true } },
            operator: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      portId: effectivePortId,
      date: isoDate,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      berths: berths.map((berth) => {
        const occupiedSlots = records
          .filter((r) => r.berthId === berth.id)
          .map((r) => {
            const rawStart = r.actualStartAt ?? r.plannedStartAt ?? r.visit.eta;
            const rawEnd = r.actualEndAt ?? r.plannedEndAt ?? r.visit.etd;
            return {
              berthingId: r.id,
              visitId: r.visitId,
              visitNumber: r.visit.visitNumber,
              vesselName: r.visit.vessel?.name ?? `Kapal #${r.visitId}`,
              operatorName: r.visit.operator?.name ?? '-',
              startAt: rawStart.toISOString(),
              endAt: rawEnd.toISOString(),
              status: r.actualEndAt
                ? ('COMPLETED' as const)
                : r.actualStartAt
                ? ('ACTIVE' as const)
                : r.approvalStatus === BerthApprovalStatus.PENDING
                ? ('PENDING_OVERRIDE' as const)
                : ('PLANNED' as const),
              _startMs: rawStart.getTime(),
              _endMs: rawEnd.getTime(),
            };
          })
          .filter((slot) => slot._startMs < dayEnd.getTime() && slot._endMs > dayStart.getTime())
          .sort((a, b) => a._startMs - b._startMs);

        const freeSlots: Array<{ startAt: string; endAt: string }> = [];
        let cursorMs = dayStart.getTime();
        const dayEndMs = dayEnd.getTime();

        for (const slot of occupiedSlots) {
          const clippedStart = Math.max(slot._startMs, dayStart.getTime());
          const clippedEnd = Math.min(slot._endMs, dayEndMs);
          if (clippedStart > cursorMs) {
            freeSlots.push({
              startAt: new Date(cursorMs).toISOString(),
              endAt: new Date(clippedStart).toISOString(),
            });
          }
          if (clippedEnd > cursorMs) {
            cursorMs = clippedEnd;
          }
        }

        if (cursorMs < dayEndMs) {
          freeSlots.push({
            startAt: new Date(cursorMs).toISOString(),
            endAt: new Date(dayEndMs).toISOString(),
          });
        }

        return {
          berth: {
            id: berth.id,
            code: berth.code,
            name: berth.name,
            authorityType: berth.authorityType,
            operationalStatus: berth.operationalStatus,
            berthServiceCategory: berth.berthServiceCategory,
            maxLengthMeters: berth.maxLengthMeters != null ? Number(berth.maxLengthMeters) : null,
          },
          occupiedSlots: occupiedSlots.map(({ _startMs, _endMs, ...rest }) => rest),
          freeSlots,
        };
      }),
    };
  }

  async createBerth(dto: CreateBerthDto, actor?: AuthenticatedUser, scope?: ScopeFilter) {
    if (scope?.portId && dto.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port) throw new NotFoundException(`Port #${dto.portId} not found`);

    if (dto.terminalId) {
      const terminal = await this.prisma.terminal.findUnique({ where: { id: dto.terminalId } });
      if (!terminal || terminal.portId !== dto.portId) {
        throw new BadRequestException(
          `Terminal #${dto.terminalId} does not belong to Port #${dto.portId}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const berth = await tx.berth.create({
        data: {
          portId: dto.portId,
          terminalId: dto.terminalId ?? null,
          code: dto.code,
          name: dto.name,
          berthType: dto.berthType,
          berthServiceCategory: dto.berthServiceCategory,
          operationalStatus: dto.operationalStatus,
          authorityType: dto.authorityType,
          billingEligibility: dto.billingEligibility,
          legalBasis: dto.legalBasis,
          managementEvidence: dto.managementEvidence,
          maxLengthMeters: dto.maxLengthMeters,
          maxDraftMeters: dto.maxDraftMeters,
          maxGrossTonnage: dto.maxGrossTonnage,
          allowedVesselCategories: dto.allowedVesselCategories ?? [],
          allowedShipTypes: dto.allowedShipTypes ?? [],
          technicalSpecs: dto.technicalSpecs
            ? (dto.technicalSpecs as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: berth.portId,
        action: 'BERTH_CREATED',
        entityName: 'berths',
        entityId: berth.id,
        afterData: berth,
        tx,
      });
      return berth;
    });
  }

  async updateBerth(
    berthId: number,
    dto: UpdateBerthDto,
    scope: ScopeFilter,
    actor?: AuthenticatedUser,
  ) {
    const existing = await this.prisma.berth.findUnique({ where: { id: berthId } });
    if (!existing) throw new NotFoundException(`Berth #${berthId} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    if (dto.terminalId) {
      const terminal = await this.prisma.terminal.findUnique({ where: { id: dto.terminalId } });
      if (!terminal || terminal.portId !== existing.portId) {
        throw new BadRequestException(
          `Terminal #${dto.terminalId} does not belong to Port #${existing.portId}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.berth.update({
        where: { id: berthId },
        data: {
          ...(dto.terminalId !== undefined ? { terminalId: dto.terminalId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.berthServiceCategory !== undefined
            ? { berthServiceCategory: dto.berthServiceCategory }
            : {}),
          ...(dto.operationalStatus !== undefined
            ? { operationalStatus: dto.operationalStatus }
            : {}),
          ...(dto.maxLengthMeters !== undefined ? { maxLengthMeters: dto.maxLengthMeters } : {}),
          ...(dto.maxDraftMeters !== undefined ? { maxDraftMeters: dto.maxDraftMeters } : {}),
          ...(dto.maxGrossTonnage !== undefined ? { maxGrossTonnage: dto.maxGrossTonnage } : {}),
          ...(dto.allowedVesselCategories !== undefined
            ? { allowedVesselCategories: dto.allowedVesselCategories }
            : {}),
          ...(dto.allowedShipTypes !== undefined
            ? { allowedShipTypes: dto.allowedShipTypes }
            : {}),
          ...(dto.technicalSpecs !== undefined
            ? {
                technicalSpecs: dto.technicalSpecs
                  ? (dto.technicalSpecs as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.auditLog.record({
        actorId: actor?.id,
        actorRole: actor?.role,
        portId: existing.portId,
        action: 'BERTH_UPDATED',
        entityName: 'berths',
        entityId: berthId,
        beforeData: existing,
        afterData: updated,
        tx,
      });
      return updated;
    });
  }

  findZonesByPort(portId: number, scope: ScopeFilter) {
    if (scope.portId && scope.portId !== portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    return this.prisma.portZone.findMany({
      where: { portId, isActive: true },
      include: { terminal: true, berth: true, facilities: true },
      orderBy: { code: 'asc' },
    });
  }

  async createZone(
    portId: number,
    dto: CreatePortZoneDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (scope.portId && scope.portId !== portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    return this.prisma.$transaction(async (tx) => {
      const zone = await tx.portZone.create({
        data: {
          portId,
          terminalId: dto.terminalId ?? null,
          berthId: dto.berthId ?? null,
          code: dto.code,
          name: dto.name,
          zoneType: dto.zoneType,
          areaSqm: dto.areaSqm,
          description: dto.description,
        },
      });
      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId,
        action: 'PORT_ZONE_CREATED',
        entityName: 'port_zones',
        entityId: zone.id,
        afterData: zone,
        tx,
      });
      return zone;
    });
  }

  findFacilitiesByPort(portId: number, scope: ScopeFilter) {
    if (scope.portId && scope.portId !== portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    return this.prisma.portFacility.findMany({
      where: { portId, isActive: true },
      include: { terminal: true, berth: true, zone: true },
      orderBy: { code: 'asc' },
    });
  }

  async createFacility(
    portId: number,
    dto: CreatePortFacilityDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    if (scope.portId && scope.portId !== portId) {
      throw new ForbiddenException('Cross-port access denied');
    }
    return this.prisma.$transaction(async (tx) => {
      const facility = await tx.portFacility.create({
        data: {
          portId,
          terminalId: dto.terminalId ?? null,
          berthId: dto.berthId ?? null,
          zoneId: dto.zoneId ?? null,
          code: dto.code,
          name: dto.name,
          facilityType: dto.facilityType,
          conditionStatus: dto.conditionStatus,
          specifications: dto.specifications
            ? (dto.specifications as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        portId,
        action: 'PORT_FACILITY_CREATED',
        entityName: 'port_facilities',
        entityId: facility.id,
        afterData: facility,
        tx,
      });
      return facility;
    });
  }

  findDivisions() {
    return this.prisma.division.findMany({
      where: { isActive: true },
      include: {
        divisionPorts: {
          include: { port: { select: { id: true, code: true, name: true, portCategory: true } } },
        },
        users: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createDivision(dto: CreateDivisionDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const division = await tx.division.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          ...(dto.portIds && dto.portIds.length > 0
            ? {
                divisionPorts: {
                  create: dto.portIds.map((portId) => ({ portId })),
                },
              }
            : {}),
        },
        include: { divisionPorts: { include: { port: true } } },
      });
      await this.auditLog.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'DIVISION_CREATED',
        entityName: 'divisions',
        entityId: division.id,
        afterData: division,
        tx,
      });
      return division;
    });
  }
}
