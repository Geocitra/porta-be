import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SimulateRevenueDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports & Anti-Leakage Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Roles(
  UserRole.SUPERADMIN,
  UserRole.KEPALA_DINAS,
  UserRole.KEPALA_BIDANG,
  UserRole.KEPALA_PELABUHAN,
  UserRole.ADMIN_PELABUHAN,
  UserRole.PETUGAS_TAGIHAN,
  UserRole.BENDAHARA,
  UserRole.DISHUB_EKSEKUTIF,
)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue-summary')
  getRevenueSummary(@Req() req: { portScope: ScopeFilter }) {
    return this.reportsService.getRevenueSummary(req.portScope);
  }

  @Get('unbilled-visits')
  getUnbilledDepartedVisits(@Req() req: { portScope: ScopeFilter }) {
    return this.reportsService.getUnbilledDepartedVisits(req.portScope);
  }

  @Post('simulate-revenue')
  simulateRevenue(
    @Body() dto: SimulateRevenueDto,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.reportsService.simulateRevenue(dto, req.portScope);
  }

  @Get('gis-opportunities')
  getGisOpportunities(@Req() req: { portScope: ScopeFilter }) {
    return this.reportsService.getGisOpportunities(req.portScope);
  }

  @Get('audit-logs')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  getAuditLogs(
    @Req() req: { portScope: ScopeFilter },
    @Query('entityName') entityName?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.reportsService.getAuditLogs({
      portId: req.portScope.portId,
      entityName,
      action,
      actorId: actorId ? Number(actorId) : undefined,
    });
  }
}

@ApiTags('Audit Logs Domain Endpoint')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'entityName', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: Number })
  findAuditLogs(
    @Req() req: { portScope: ScopeFilter },
    @Query('portId') portId?: string,
    @Query('entityName') entityName?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.reportsService.getAuditLogs({
      portId: req.portScope.portId ?? (portId ? Number(portId) : undefined),
      entityName,
      action,
      actorId: actorId ? Number(actorId) : undefined,
    });
  }
}
