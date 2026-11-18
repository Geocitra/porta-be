import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DailyReportsService } from './daily-reports.service';
import {
  CreateDailyPortReportDto,
  ReviewDailyReportDto,
} from './dto/daily-reports.dto';

@ApiTags('Daily Port Shift Reports & Work Obligations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Get('obligations')
  @Roles(
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'officerId', required: false, type: Number })
  getObligations(
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() user: AuthenticatedUser,
    @Query('portId') portId?: string,
    @Query('date') date?: string,
    @Query('officerId') officerId?: string,
  ) {
    return this.dailyReportsService.getDailyObligationRecap(req.portScope, user, {
      portId: portId ? Number(portId) : undefined,
      date,
      officerId: officerId ? Number(officerId) : undefined,
    });
  }

  @Get()
  @Roles(
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.dailyReportsService.findAll(req.portScope);
  }

  @Post()
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
  )
  create(
    @Body() dto: CreateDailyPortReportDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.dailyReportsService.create(dto, actor, req.portScope);
  }

  @Post(':id/admin-check')
  @Roles(UserRole.ADMIN_PELABUHAN)
  adminCheck(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDailyReportDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.dailyReportsService.adminCheckReport(id, dto, actor, req.portScope);
  }

  @Post(':id/head-verify')
  @Roles(UserRole.KEPALA_PELABUHAN)
  headVerify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDailyReportDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.dailyReportsService.headVerifyReport(id, dto, actor, req.portScope);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.KEPALA_PELABUHAN, UserRole.ADMIN_PELABUHAN)
  acknowledge(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.dailyReportsService.acknowledge(id, actor, req.portScope);
  }
}
