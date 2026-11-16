import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceStatus, WarningStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { IssueWarningDto } from './dto/warnings.dto';

export const WARNING_ISSUED_EVENT = 'warning.issued';

export interface WarningIssuedEvent {
  warningId: number;
  operatorId: number;
  warningNumber: string;
  message: string;
}

@Injectable()
export class WarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(scope: ScopeFilter) {
    return this.prisma.warning.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
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

    const warningNumber = DocNumberUtil.generate('WRN', invoice.portId);

    const warning = await this.prisma.$transaction(async (tx) => {
      const created = await tx.warning.create({
        data: {
          warningNumber,
          portId: invoice.portId,
          operatorId: invoice.operatorId,
          invoiceId: invoice.id,
          warningLevel: dto.warningLevel,
          message: dto.message,
          issuedById: actor.id,
          status: WarningStatus.SENT,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'WARNING_ISSUED',
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

