import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateDailyPortReportDto } from './dto/daily-reports.dto';
import { DailyReportsService } from './daily-reports.service';

@ApiTags('Daily Port Shift Reports (Tutup Hari)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.dailyReportsService.findAll(req.portScope);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  create(
    @Body() dto: CreateDailyPortReportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.dailyReportsService.create(dto, actor);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  acknowledge(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.dailyReportsService.acknowledge(id, actor, req.portScope);
  }
}

