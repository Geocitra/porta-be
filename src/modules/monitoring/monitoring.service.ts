import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BerthOperationalStatus,
  ChargePaymentStatus,
  DailyReportReviewStatus,
  HandoverStatus,
  InvoiceStatus,
  MaintenanceSeverity,
  MaintenanceStatus,
  TaskExecutionStatus,
  TaskReviewStatus,
  UserRole,
} from '@prisma/client';
import {
  AuthenticatedUser,
  isKadisRole,
} from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  private async computePortMetrics(portIds: number[]) {
    if (portIds.length === 0) {
      return {
        ports: [],
        visits: [],
        tasks: [],
        manifests: [],
        cargoRecords: [],
        verifiedPayments: [],
        gateHandovers: [],
        leasePayments: [],
        dailyReports: [],
        maintenanceTickets: [],
      };
    }

    await this.tasksService.syncOverdueTasks();

    const portFilter = { portId: { in: portIds } };

    const [
      ports,
      visits,
      tasks,
      manifests,
      cargoRecords,
      verifiedPayments,
      gateHandovers,
      leasePayments,
      dailyReports,
      maintenanceTickets,
    ] = await Promise.all([
      this.prisma.port.findMany({
        where: { id: { in: portIds }, isActive: true },
        include: {
          terminals: { where: { isActive: true } },
          berths: { where: { isActive: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.shipVisit.findMany({
        where: portFilter,
        include: {
          vessel: { select: { id: true, name: true, vesselCategory: true, grossTonnage: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...portFilter,
          executionStatus: { not: TaskExecutionStatus.CANCELLED },
        },
      }),
      this.prisma.vesselManifest.findMany({
        where: portFilter,
      }),
      this.prisma.cargoHandlingRecord.findMany({
        where: portFilter,
      }),
      this.prisma.payment.findMany({
        where: {
          isVerified: true,
          invoice: {
            ...portFilter,
            status: { not: InvoiceStatus.VOID },
          },
        },
        include: { invoice: { select: { portId: true } } },
      }),
      this.prisma.gateWardenHandover.findMany({
        where: {
          ...portFilter,
          status: HandoverStatus.SETTLED,
        },
      }),
      this.prisma.assetLeasePayment.findMany({
        where: {
          lease: portFilter,
        },
        include: { lease: { select: { portId: true } } },
      }),
      this.prisma.dailyPortReport.findMany({
        where: portFilter,
      }),
      this.prisma.maintenanceTicket.findMany({
        where: portFilter,
      }),
    ]);

    return {
      ports,
      visits,
      tasks,
      manifests,
      cargoRecords,
      verifiedPayments,
      gateHandovers,
      leasePayments,
      dailyReports,
      maintenanceTickets,
    };
  }

  private summarizeForPorts(
    portIds: number[],
    data: Awaited<ReturnType<typeof this.computePortMetrics>>,
  ) {
    const set = new Set(portIds);
    const ports = data.ports.filter((p) => set.has(p.id));
    const visits = data.visits.filter((v) => set.has(v.portId));
    const tasks = data.tasks.filter((t) => set.has(t.portId));
    const manifests = data.manifests.filter((m) => set.has(m.portId));
    const cargo = data.cargoRecords.filter((c) => set.has(c.portId));
    const payments = data.verifiedPayments.filter((p) => set.has(p.invoice.portId));
    const handovers = data.gateHandovers.filter((h) => set.has(h.portId));
    const leases = data.leasePayments.filter((lp) => set.has(lp.lease.portId));
    const reports = data.dailyReports.filter((r) => set.has(r.portId));

    const totalBerths = ports.reduce((acc, p) => acc + p.berths.length, 0);
    const openBerths = ports.reduce(
      (acc, p) =>
        acc + p.berths.filter((b) => b.operationalStatus === BerthOperationalStatus.OPEN).length,
      0,
    );

    const totalPassengers = manifests.reduce(
      (acc, m) => acc + m.adultCount + m.childCount + m.infantCount,
      0,
    );
    const totalVehicles = manifests.reduce((acc, m) => acc + m.vehicleCount, 0);
    const manifestCargoTons = manifests.reduce(
      (acc, m) => acc + DecimalUtil.toNumber(m.cargoTons),
      0,
    );
    const cargoHandlingQty = cargo.reduce(
      (acc, c) => acc + DecimalUtil.toNumber(c.quantity),
      0,
    );

    const vesselRev = payments.reduce((acc, p) => acc + DecimalUtil.toNumber(p.amountIdr), 0);
    const gateRev = handovers.reduce(
      (acc, h) => acc + DecimalUtil.toNumber(h.actualCashSettledIdr),
      0,
    );
    const leaseRev = leases.reduce((acc, l) => acc + DecimalUtil.toNumber(l.amountIdr), 0);
    const cargoRev = cargo
      .filter((c) => c.paymentStatus === ChargePaymentStatus.PAID)
      .reduce((acc, c) => acc + DecimalUtil.toNumber(c.totalAmountIdr), 0);
    const totalRevenueIdr = vesselRev + gateRev + leaseRev + cargoRev;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (t) => t.executionStatus === TaskExecutionStatus.COMPLETED,
    ).length;
    const overdueTasks = tasks.filter(
      (t) => t.isOverdue && t.executionStatus !== TaskExecutionStatus.COMPLETED,
    ).length;
    const unsubmittedTasks = tasks.filter(
      (t) =>
        t.executionStatus === TaskExecutionStatus.NOT_STARTED ||
        t.executionStatus === TaskExecutionStatus.IN_PROGRESS ||
        t.executionStatus === TaskExecutionStatus.OVERDUE,
    ).length;
    const waitingVerificationTasks = tasks.filter(
      (t) =>
        t.reviewStatus === TaskReviewStatus.WAITING_ADMIN ||
        t.reviewStatus === TaskReviewStatus.ADMIN_REVIEW ||
        t.reviewStatus === TaskReviewStatus.WAITING_HEAD_VERIFICATION,
    ).length;

    const completionRatePercent =
      totalTasks > 0 ? DecimalUtil.round2((completedTasks / totalTasks) * 100) : 100;

    const reportsWaitingVerification = reports.filter(
      (r) =>
        r.reviewStatus === DailyReportReviewStatus.WAITING_ADMIN ||
        r.reviewStatus === DailyReportReviewStatus.WAITING_HEAD_VERIFICATION,
    ).length;
    const reportsVerified = reports.filter(
      (r) =>
        r.reviewStatus === DailyReportReviewStatus.HEAD_VERIFIED || r.status === 'ACKNOWLEDGED',
    ).length;

    return {
      totalPorts: ports.length,
      operationalStatus: {
        activePorts: ports.length,
        totalBerths,
        openBerths,
        maintenanceOrClosedBerths: totalBerths - openBerths,
      },
      vesselActivity: {
        totalVisits: visits.length,
        activeBerthedOrAnchored: visits.filter((v) =>
          ['ANCHORED', 'BERTHED'].includes(v.status),
        ).length,
        departedOrSettled: visits.filter((v) =>
          ['DEPARTED', 'BILLED', 'SETTLED'].includes(v.status),
        ).length,
      },
      cargoActivity: {
        totalCargoRecords: cargo.length,
        totalCargoVolumeUnits: DecimalUtil.round2(cargoHandlingQty),
        manifestCargoTons: DecimalUtil.round2(manifestCargoTons),
      },
      passengerActivity: {
        totalManifests: manifests.length,
        totalPassengers,
        totalVehicles,
      },
      taskPerformance: {
        totalTasks,
        completedTasks,
        overdueTasks,
        unsubmittedTasks,
        waitingVerificationTasks,
        completionRatePercent,
      },
      dailyReporting: {
        totalReportsSubmitted: reports.length,
        unsubmittedTaskObligations: unsubmittedTasks,
        reportsWaitingVerification,
        reportsVerified,
      },
      revenue: {
        vesselRevenueIdr: vesselRev,
        gateTicketingRevenueIdr: gateRev,
        assetLeaseRevenueIdr: leaseRev,
        cargoRevenueIdr: cargoRev,
        totalRevenueIdr,
      },
    };
  }

  // ==========================================================================
  // 1. PORT ECOSYSTEM MONITORING
  // ==========================================================================

  async getPortMonitoring(portId: number, user: AuthenticatedUser, scope: ScopeFilter) {
    if (scope.portId && scope.portId !== portId) {
      throw new ForbiddenException('Cross-port monitoring access is forbidden');
    }
    if (
      scope.allowedPortIds &&
      scope.allowedPortIds.length > 0 &&
      !scope.allowedPortIds.includes(portId)
    ) {
      throw new ForbiddenException(
        `Pelabuhan #${portId} berada di luar kewenangan bidang Anda`,
      );
    }

    const raw = await this.computePortMetrics([portId]);
    if (raw.ports.length === 0) {
      throw new NotFoundException(`Port #${portId} not found`);
    }

    const summary = this.summarizeForPorts([portId], raw);
    return {
      port: raw.ports[0],
      ...summary,
    };
  }

  // ==========================================================================
  // 2. KABID (KEPALA BIDANG) MONITORING & DRILL-DOWN
  // ==========================================================================

  async getKabidMonitoring(
    user: AuthenticatedUser,
    scope: ScopeFilter,
    divisionIdQuery?: number,
  ) {
    let targetDivisionId = user.divisionId ?? scope.divisionId ?? divisionIdQuery;
    if (user.role === UserRole.KEPALA_BIDANG) {
      if (!user.divisionId) {
        throw new ForbiddenException('Akun Kepala Bidang belum memiliki divisionId');
      }
      if (divisionIdQuery && divisionIdQuery !== user.divisionId) {
        throw new ForbiddenException('Tidak diizinkan mengakses bidang lain');
      }
      targetDivisionId = user.divisionId;
    }

    const division = targetDivisionId
      ? await this.prisma.division.findUnique({
          where: { id: targetDivisionId },
          include: { divisionPorts: true },
        })
      : await this.prisma.division.findFirst({
          where: { isActive: true },
          include: { divisionPorts: true },
        });

    if (!division) {
      throw new NotFoundException('Bidang (Division) tidak ditemukan');
    }

    const portIds = division.divisionPorts.map((dp) => dp.portId);
    const raw = await this.computePortMetrics(portIds);
    const divisionSummary = this.summarizeForPorts(portIds, raw);

    const perPortBreakdown = raw.ports.map((p) => ({
      portId: p.id,
      code: p.code,
      name: p.name,
      portCategory: p.portCategory,
      metrics: this.summarizeForPorts([p.id], raw),
    }));

    return {
      division: {
        id: division.id,
        code: division.code,
        name: division.name,
        description: division.description,
      },
      ...divisionSummary,
      perPortBreakdown,
      performanceTrend: perPortBreakdown.map((item) => ({
        portCode: item.code,
        portName: item.name,
        completionRatePercent: item.metrics.taskPerformance.completionRatePercent,
        totalRevenueIdr: item.metrics.revenue.totalRevenueIdr,
        totalVisits: item.metrics.vesselActivity.totalVisits,
      })),
    };
  }

  async getKabidDrilldown(
    user: AuthenticatedUser,
    scope: ScopeFilter,
    params: {
      portId?: number;
      terminalId?: number;
      berthId?: number;
    },
  ) {
    let allowedPortIds = scope.allowedPortIds;
    if (user.role === UserRole.KEPALA_BIDANG) {
      if (!allowedPortIds || allowedPortIds.length === 0) {
        const divPorts = await this.prisma.divisionPort.findMany({
          where: { divisionId: user.divisionId! },
          select: { portId: true },
        });
        allowedPortIds = divPorts.map((d) => d.portId);
      }
      if (params.portId && !allowedPortIds.includes(params.portId)) {
        throw new ForbiddenException(
          `Drill-down ditolak: Pelabuhan #${params.portId} berada di luar cakupan bidang Anda`,
        );
      }
    }

    const effectivePortIds = params.portId
      ? [params.portId]
      : allowedPortIds && allowedPortIds.length > 0
        ? allowedPortIds
        : (await this.prisma.port.findMany({ where: { isActive: true }, select: { id: true } })).map(
            (p) => p.id,
          );

    const ports = await this.prisma.port.findMany({
      where: { id: { in: effectivePortIds }, isActive: true },
      include: {
        terminals: {
          where: {
            isActive: true,
            ...(params.terminalId ? { id: params.terminalId } : {}),
          },
          include: {
            berths: {
              where: {
                isActive: true,
                ...(params.berthId ? { id: params.berthId } : {}),
              },
            },
          },
        },
        berths: {
          where: {
            isActive: true,
            ...(params.terminalId ? { terminalId: params.terminalId } : {}),
            ...(params.berthId ? { id: params.berthId } : {}),
          },
          include: {
            berthingRecords: {
              include: {
                visit: {
                  include: {
                    vessel: { select: { id: true, name: true, vesselCategory: true } },
                    operator: { select: { id: true, name: true } },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            tasks: {
              where: { executionStatus: { not: TaskExecutionStatus.CANCELLED } },
              include: {
                assignee: { select: { id: true, fullName: true } },
              },
              orderBy: { dueDate: 'asc' },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    const portLevelTasks = await this.prisma.task.findMany({
      where: {
        portId: { in: effectivePortIds },
        ...(params.terminalId ? { terminalId: params.terminalId } : {}),
        ...(params.berthId ? { berthId: params.berthId } : {}),
        executionStatus: { not: TaskExecutionStatus.CANCELLED },
      },
      include: {
        assignee: { select: { id: true, fullName: true } },
        berth: { select: { id: true, code: true, name: true } },
        terminal: { select: { id: true, code: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return {
      drilldownScope: {
        divisionId: user.divisionId ?? null,
        portIds: effectivePortIds,
        terminalId: params.terminalId ?? null,
        berthId: params.berthId ?? null,
      },
      ports,
      tasks: portLevelTasks,
    };
  }

  // ==========================================================================
  // 3. KADIS (KEPALA DINAS) AGENCY-WIDE STRATEGIC MONITORING
  // ==========================================================================

  async getKadisMonitoring(user: AuthenticatedUser) {
    if (
      user.role !== UserRole.SUPERADMIN &&
      !isKadisRole(user.role)
    ) {
      throw new ForbiddenException(
        'Hanya KEPALA_DINAS (KADIS) yang berwenang mengakses agregasi strategis tingkat dinas.',
      );
    }

    const allPorts = await this.prisma.port.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const allPortIds = allPorts.map((p) => p.id);
    const raw = await this.computePortMetrics(allPortIds);
    const agencySummary = this.summarizeForPorts(allPortIds, raw);

    const divisions = await this.prisma.division.findMany({
      where: { isActive: true },
      include: {
        divisionPorts: true,
        users: {
          where: { role: UserRole.KEPALA_BIDANG, isActive: true },
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    const divisionPerformance = divisions.map((div) => {
      const divPortIds = div.divisionPorts.map((dp) => dp.portId);
      const metrics = this.summarizeForPorts(divPortIds, raw);
      return {
        divisionId: div.id,
        code: div.code,
        name: div.name,
        kabidOfficers: div.users,
        portCount: divPortIds.length,
        completionRatePercent: metrics.taskPerformance.completionRatePercent,
        overdueTasks: metrics.taskPerformance.overdueTasks,
        unsubmittedTasks: metrics.taskPerformance.unsubmittedTasks,
        totalVisits: metrics.vesselActivity.totalVisits,
        totalRevenueIdr: metrics.revenue.totalRevenueIdr,
      };
    });

    const portPerformance = raw.ports.map((p) => {
      const metrics = this.summarizeForPorts([p.id], raw);
      return {
        portId: p.id,
        code: p.code,
        name: p.name,
        portCategory: p.portCategory,
        portClassification: p.portClassification,
        ...metrics,
      };
    });

    // Annual PAD Target vs Realization
    const annualTargetIdr = 5_000_000_000; // Rp 5 Miliar target indikator kinerja PAD Dinas
    const realizationPercent = DecimalUtil.round2(
      (agencySummary.revenue.totalRevenueIdr / annualTargetIdr) * 100,
    );

    const totalReports = agencySummary.dailyReporting.totalReportsSubmitted;
    const reportComplianceRatePercent =
      totalReports > 0
        ? DecimalUtil.round2(
            (agencySummary.dailyReporting.reportsVerified / totalReports) * 100,
          )
        : 100;

    // Critical Issues detection (overdue tasks, task issues, critical maintenance, closed berths)
    const criticalMaintenance = raw.maintenanceTickets.filter(
      (m) =>
        m.status !== MaintenanceStatus.VERIFIED_FIXED &&
        (m.severity === MaintenanceSeverity.CRITICAL ||
          m.severity === MaintenanceSeverity.HIGH),
    );
    const tasksWithIssues = raw.tasks.filter(
      (t) =>
        (t.hasIssue || t.isOverdue) &&
        t.executionStatus !== TaskExecutionStatus.COMPLETED,
    );

    return {
      agencyOverview: {
        ...agencySummary,
        revenueTargetAndRealization: {
          annualTargetIdr,
          realizedRevenueIdr: agencySummary.revenue.totalRevenueIdr,
          realizationPercent,
        },
        reportCompliance: {
          totalReportsSubmitted: totalReports,
          verifiedReports: agencySummary.dailyReporting.reportsVerified,
          waitingVerification: agencySummary.dailyReporting.reportsWaitingVerification,
          reportComplianceRatePercent,
        },
      },
      divisionPerformance,
      portPerformance,
      criticalIssues: {
        overdueOrIssueTasksCount: tasksWithIssues.length,
        highOrCriticalMaintenanceCount: criticalMaintenance.length,
        tasksRequiringAttention: tasksWithIssues.slice(0, 15).map((t) => ({
          id: t.id,
          taskNumber: t.taskNumber,
          title: t.title,
          portId: t.portId,
          isOverdue: t.isOverdue,
          hasIssue: t.hasIssue,
          issueNotes: t.issueNotes,
        })),
        criticalMaintenanceTickets: criticalMaintenance.slice(0, 10),
      },
    };
  }
}
