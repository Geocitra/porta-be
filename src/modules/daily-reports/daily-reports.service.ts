import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DailyReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { CreateDailyPortReportDto } from './dto/daily-reports.dto';

@Injectable()
export class DailyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findAll(scope: ScopeFilter) {
    return this.prisma.dailyPortReport.findMany({
      where: {
        ...(scope.portId ? { portId: scope.portId } : {}),
      },
      include: {
        officer: { select: { id: true, fullName: true } },
        items: { include: { berth: true } },
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateDailyPortReportDto, actor: AuthenticatedUser) {
    // Validate cross-port integrity for every referenced visit/berth
    for (const item of dto.items) {
      if (item.visitId) {
        const visit = await this.prisma.shipVisit.findUnique({ where: { id: item.visitId } });
        if (!visit || visit.portId !== dto.portId) {
          throw new BadRequestException(
            `Visit #${item.visitId} not found or does not belong to port #${dto.portId}`,
          );
        }
      }
      if (item.berthId) {
        const berth = await this.prisma.berth.findUnique({ where: { id: item.berthId } });
        if (!berth || berth.portId !== dto.portId) {
          throw new BadRequestException(
            `Berth #${item.berthId} not found or does not belong to port #${dto.portId}`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.dailyPortReport.create({
        data: {
          portId: dto.portId,
          reportDate: new Date(dto.reportDate),
          officerId: actor.id,
          totalVesselsStaying: dto.items.length,
          generalNotes: dto.generalNotes,
          status: DailyReportStatus.SUBMITTED,
          items: {
            create: dto.items.map((item) => ({
              portId: dto.portId,
              visitId: item.visitId ?? null,
              berthId: item.berthId ?? null,
              vesselNameSnapshot: item.vesselNameSnapshot,
              registrationNumberSnapshot: item.registrationNumberSnapshot,
              isAdhoc: item.isAdhoc ?? false,
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      await this.auditLog.record({
        actorId: actor.id,
        action: 'DAILY_PORT_REPORT_SUBMITTED',
        entityName: 'daily_port_reports',
        entityId: report.id,
        afterData: { reportDate: dto.reportDate, totalVesselsStaying: report.totalVesselsStaying },
        tx,
      });

      return report;
    });
  }

  async acknowledge(reportId: number, actor: AuthenticatedUser, scope: ScopeFilter) {
    const report = await this.prisma.dailyPortReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`DailyPortReport #${reportId} not found`);
    if (scope.portId && report.portId !== scope.portId) {
      throw new BadRequestException('Cross-port access denied');
    }

    return this.prisma.dailyPortReport.update({
      where: { id: reportId },
      data: { status: DailyReportStatus.ACKNOWLEDGED },
    });
  }
}

