import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateMaintenanceTicketDto,
  UpdateMaintenanceStatusDto,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Phase 2: Maintenance & Facility Inspections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.ALL_BERTH_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
  )
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.maintenanceService.findAll(req.portScope);
  }

  @Post()
  @Roles(
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.ALL_BERTH_OFFICERS,
  )
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('evidenceFile'))
  create(
    @Body() dto: CreateMaintenanceTicketDto,
    @UploadedFile() evidenceFile: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.maintenanceService.create(dto, actor, req.portScope, evidenceFile);
  }

  @Patch(':id/status')
  @Roles(...ROLE_GROUPS.ROOM_ASSET_OFFICERS)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaintenanceStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.maintenanceService.updateStatus(id, dto, actor, req.portScope);
  }
}
