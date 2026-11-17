import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  UserRole.ADMIN_PELABUHAN,
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
  @Roles(UserRole.SUPERADMIN)
  getAuditLogs() {
    return this.reportsService.getAuditLogs();
  }
}

