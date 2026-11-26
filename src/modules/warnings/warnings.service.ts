import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceStatus, UserRole, WarningLevel, WarningStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { IssueWarningDto } from './dto/warnings.dto';
import {
  buildAutoStrdMessage,
  calculateOverdueMetrics,
  getMissingWarningLevels,
  MONTHLY_PENALTY_RATE,
} from './penalty-escalation.util';

export const WARNING_ISSUED_EVENT = 'warning.issued';
const AUTO_ESCALATION_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_SWEEP_DELAY_MS = 15 * 1000;

export interface WarningIssuedEvent {
  warningId: number;
  operatorId: number;
  warningNumber: string;
  message: string;
}

@Injectable()
export class WarningsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WarningsService.name);
  private initialSweepTimer: ReturnType<typeof setTimeout> | null = null;
  private escalationInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.initialSweepTimer = setTimeout(() => {
      void this.runOverdueEscalationSweep().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Initial overdue STRD sweep skipped: ${msg}`);
      });
    }, INITIAL_SWEEP_DELAY_MS);

    this.escalationInterval = setInterval(() => {
      void this.runOverdueEscalationSweep().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Scheduled overdue STRD sweep failed: ${msg}`);
      });
    }, AUTO_ESCALATION_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.initialSweepTimer) clearTimeout(this.initialSweepTimer);
    if (this.escalationInterval) clearInterval(this.escalationInterval);
  }

  findAll(scope: ScopeFilter) {
    if (scope.tenantId && !scope.operatorId) {
      return [];
    }
    return this.prisma.warning.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
      },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, totalAmountIdr: true, status: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async issue(dto: IssueWarningDto, actor: AuthenticatedUser, scope: ScopeFilter) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice #${dto.invoiceId} not found`);
    if (scope.portId && invoice.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PARTIAL) {
      throw new BadRequestException(
        `Warnings can only be issued for ISSUED or PARTIAL invoices (current: ${invoice.status})`,
      );
    }

    const existing = await this.prisma.warning.findUnique({
      where: {
        invoiceId_warningLevel: {
          invoiceId: dto.invoiceId,
          warningLevel: dto.warningLevel,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `${dto.warningLevel} has already been issued for invoice ${invoice.invoiceNumber}`,
      );
    }

    const warning = await this.createWarningRecord({
      portId: invoice.portId,
      operatorId: invoice.operatorId,
      invoiceId: invoice.id,
      warningLevel: dto.warningLevel,
      message: dto.message,
      issuedById: actor.id,
      auditAction: 'WARNING_ISSUED',
    });

    return warning;
  }

  async getOverdueSummary(scope: ScopeFilter) {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        dueDate: { lt: now },
        ...(scope.portId ? { portId: scope.portId } : {}),
        ...(scope.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
        ...(scope.operatorId ? { operatorId: scope.operatorId } : {}),
      },
      include: {
        operator: { select: { id: true, name: true } },
        payments: { where: { isVerified: true }, select: { amountIdr: true } },
        warnings: { select: { id: true, warningLevel: true, warningNumber: true, createdAt: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return invoices
      .map((inv) => {
        if (!inv.dueDate) return null;
        const paidIdr = inv.payments.reduce(
          (sum, p) => sum + DecimalUtil.toNumber(p.amountIdr),
          0,
        );
        const metrics = calculateOverdueMetrics(
          inv.dueDate,
          now,
          DecimalUtil.toNumber(inv.totalAmountIdr),
          paidIdr,
        );
        if (metrics.remainingPrincipalIdr <= 0) return null;

        const existingLevels = new Set(inv.warnings.map((w) => w.warningLevel));
        const pendingEscalationLevels = getMissingWarningLevels(
          metrics.daysOverdue,
          existingLevels,
        );

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          operatorId: inv.operatorId,
          operatorName: inv.operator.name,
          dueDate: inv.dueDate,
          status: inv.status,
          penaltyRateMonthly: MONTHLY_PENALTY_RATE,
          ...metrics,
          issuedWarningLevels: Array.from(existingLevels),
          pendingEscalationLevels,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async runOverdueEscalationSweep(actorId?: number, scope?: ScopeFilter) {
    const now = new Date();
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL] },
        dueDate: { lt: now },
        ...(scope?.portId ? { portId: scope.portId } : {}),
        ...(scope?.allowedPortIds && !scope.portId
          ? { portId: { in: scope.allowedPortIds } }
          : {}),
      },
      include: {
        payments: { where: { isVerified: true }, select: { amountIdr: true } },
        warnings: { select: { warningLevel: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const fallbackIssuerId =
      actorId ?? (await this.resolveSystemIssuerId());
    if (!fallbackIssuerId) {
      return { scannedCount: overdueInvoices.length, escalatedCount: 0, issuedWarnings: [] };
    }

    const issuedWarnings: Array<{
      warningId: number;
      warningNumber: string;
      invoiceNumber: string;
      warningLevel: WarningLevel;
      penaltyIdr: number;
    }> = [];

    for (const invoice of overdueInvoices) {
      if (!invoice.dueDate) continue;
      const paidIdr = invoice.payments.reduce(
        (sum, p) => sum + DecimalUtil.toNumber(p.amountIdr),
        0,
      );
      const metrics = calculateOverdueMetrics(
        invoice.dueDate,
        now,
        DecimalUtil.toNumber(invoice.totalAmountIdr),
        paidIdr,
      );
      if (metrics.remainingPrincipalIdr <= 0) continue;

      const existingLevels = new Set(invoice.warnings.map((w) => w.warningLevel));
      const missingLevels = getMissingWarningLevels(metrics.daysOverdue, existingLevels);

      for (const level of missingLevels) {
        const message = buildAutoStrdMessage({
          level,
          invoiceNumber: invoice.invoiceNumber,
          metrics,
        });
        const created = await this.createWarningRecord({
          portId: invoice.portId,
          operatorId: invoice.operatorId,
          invoiceId: invoice.id,
          warningLevel: level,
          message,
          issuedById: fallbackIssuerId,
          auditAction: 'WARNING_AUTO_ESCALATED',
        });
        issuedWarnings.push({
          warningId: created.id,
          warningNumber: created.warningNumber,
          invoiceNumber: invoice.invoiceNumber,
          warningLevel: level,
          penaltyIdr: metrics.penaltyIdr,
        });
      }
    }

    if (issuedWarnings.length > 0) {
      this.logger.log(
        `Auto-escalated ${issuedWarnings.length} STRD warnings across ${overdueInvoices.length} overdue invoices`,
      );
    }

    return {
      scannedCount: overdueInvoices.length,
      escalatedCount: issuedWarnings.length,
      issuedWarnings,
    };
  }

  private async resolveSystemIssuerId(): Promise<number | null> {
    const officer = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        role: { in: [UserRole.BENDAHARA, UserRole.SUPERADMIN] },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return officer?.id ?? null;
  }

  private async createWarningRecord(params: {
    portId: number;
    operatorId: number;
    invoiceId: number;
    warningLevel: WarningLevel;
    message: string;
    issuedById: number;
    auditAction: string;
  }) {
    const warningNumber = DocNumberUtil.generate('WRN', params.portId);

    const warning = await this.prisma.$transaction(async (tx) => {
      const created = await tx.warning.create({
        data: {
          warningNumber,
          portId: params.portId,
          operatorId: params.operatorId,
          invoiceId: params.invoiceId,
          warningLevel: params.warningLevel,
          message: params.message,
          issuedById: params.issuedById,
          status: WarningStatus.SENT,
        },
      });

      await this.auditLog.record({
        actorId: params.issuedById,
        action: params.auditAction,
        entityName: 'warnings',
        entityId: created.id,
        afterData: created,
        tx,
      });

      return created;
    });

    this.eventEmitter.emit(WARNING_ISSUED_EVENT, {
      warningId: warning.id,
      operatorId: warning.operatorId,
      warningNumber: warning.warningNumber,
      message: warning.message,
    } satisfies WarningIssuedEvent);

    return warning;
  }
}

