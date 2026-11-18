import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MonitoringService } from './monitoring.service';

@ApiTags('Hierarchical Monitoring (Kepala Pelabuhan, Kabid & Kadis)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('port/:portId')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
  )
  getPortMonitoring(
    @Param('portId', ParseIntPipe) portId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.monitoringService.getPortMonitoring(portId, user, req.portScope);
  }

  @Get('kabid')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @ApiQuery({ name: 'divisionId', required: false, type: Number })
  getKabidMonitoring(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
    @Query('divisionId') divisionId?: string,
  ) {
    return this.monitoringService.getKabidMonitoring(
      user,
      req.portScope,
      divisionId ? Number(divisionId) : undefined,
    );
  }

  @Get('kabid/drilldown')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'terminalId', required: false, type: Number })
  @ApiQuery({ name: 'berthId', required: false, type: Number })
  getKabidDrilldown(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
    @Query('portId') portId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('berthId') berthId?: string,
  ) {
    return this.monitoringService.getKabidDrilldown(user, req.portScope, {
      portId: portId ? Number(portId) : undefined,
      terminalId: terminalId ? Number(terminalId) : undefined,
      berthId: berthId ? Number(berthId) : undefined,
    });
  }

  @Get('kadis')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.DISHUB_EKSEKUTIF,
  )
  getKadisMonitoring(@CurrentUser() user: AuthenticatedUser) {
    return this.monitoringService.getKadisMonitoring(user);
  }
}
