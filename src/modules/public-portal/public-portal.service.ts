import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplaintStatus, InvoiceStatus, VisitStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { DecimalUtil } from '../../common/utils/decimal.util';
import { DocNumberUtil } from '../../common/utils/doc-number.util';
import { CreateComplaintDto, ResolveComplaintDto } from './dto/public-portal.dto';

@Injectable()
export class PublicPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  getPublicPorts() {
    return this.prisma.port.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        location: true,
        berths: {
          where: { isActive: true },
          select: { id: true, code: true, name: true, berthType: true, billingEligibility: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  getPublicTariffs() {
    return this.prisma.portTariff.findMany({
      where: { isActive: true },
      select: {
        tariffCode: true,
        serviceCode: true,
        shippingCategory: true,
        shipType: true,
        activityMode: true,
        berthType: true,
        unitType: true,
        currency: true,
        amount: true,
        legalBasis: true,
        effectiveFrom: true,
      },
      orderBy: [{ serviceCode: 'asc' }, { tariffCode: 'asc' }],
    });
  }

  getPublicSchedules(portId?: number) {
    return this.prisma.shipVisit.findMany({
      where: {
        ...(portId ? { portId } : {}),
        status: { in: [VisitStatus.APPROVED, VisitStatus.ANCHORED, VisitStatus.BERTHED] },
      },
      select: {
        visitNumber: true,
        originPort: true,
        destinationPort: true,
        eta: true,
        etd: true,
        status: true,
        port: { select: { code: true, name: true } },
        vessel: { select: { name: true, shippingCategory: true } },
      },
      orderBy: { eta: 'asc' },
      take: 50,
    });
  }

  async checkInvoicePublic(invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: {
        invoiceNumber: true,
        ssrdNumber: true,
        collectionInstrument: true,
        status: true,
        totalAmountIdr: true,
        issuedAt: true,
        dueDate: true,
        visit: {
          select: {
            port: { select: { name: true } },
            vessel: { select: { name: true } },
          },
        },
      },
    });

    if (!invoice || invoice.status === InvoiceStatus.VOID) {
      throw new NotFoundException(`Tagihan dengan nomor "${invoiceNumber}" tidak ditemukan`);
    }

    return {
      ...invoice,
      totalAmountIdr: DecimalUtil.toNumber(invoice.totalAmountIdr),
    };
  }

  async submitComplaint(dto: CreateComplaintDto) {
    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port || !port.isActive) {
      throw new NotFoundException(`Port #${dto.portId} not found`);
    }

    const ticketNumber = DocNumberUtil.generate('ADU', port.code);
    return this.prisma.complaint.create({
      data: {
        ticketNumber,
        portId: dto.portId,
        reporterName: dto.reporterName,
        reporterPhone: dto.reporterPhone,
        reporterEmail: dto.reporterEmail,
        category: dto.category,
        subject: dto.subject,
        description: dto.description,
      },
      select: {
        ticketNumber: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async trackComplaint(ticketNumber: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { ticketNumber },
      select: {
        ticketNumber: true,
        category: true,
        subject: true,
        status: true,
        resolutionNote: true,
        resolvedAt: true,
        createdAt: true,
        port: { select: { name: true } },
      },
    });

    if (!complaint) {
      throw new NotFoundException(`Tiket pengaduan "${ticketNumber}" tidak ditemukan`);
    }
    return complaint;
  }

  findStaffComplaints(scope: ScopeFilter) {
    return this.prisma.complaint.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: { port: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveComplaint(
    complaintId: number,
    dto: ResolveComplaintDto,
    actor: AuthenticatedUser,
    scope: ScopeFilter,
  ) {
    const existing = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!existing) throw new NotFoundException(`Complaint #${complaintId} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    const isResolved =
      dto.status === ComplaintStatus.RESOLVED || dto.status === ComplaintStatus.CLOSED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: dto.status,
          resolutionNote: dto.resolutionNote,
          resolvedAt: isResolved ? new Date() : null,
        },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'COMPLAINT_UPDATED',
        entityName: 'complaints',
        entityId: complaintId,
        beforeData: { status: existing.status },
        afterData: { status: dto.status, resolutionNote: dto.resolutionNote },
        tx,
      });

      return updated;
    });
  }
}

