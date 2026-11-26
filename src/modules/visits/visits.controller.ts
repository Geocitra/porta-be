import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole, VesselCategory } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ApproveBerthingOverrideDto,
  ApproveVisitDto,
  CreateVisitDto,
  EndBerthingDto,
  RecordArrivalDto,
  RecordDepartureDto,
  StartBerthingDto,
} from './dto/visits.dto';
import { VisitsService } from './visits.service';

@ApiTags('Visits & Berthing Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  @ApiQuery({ name: 'vesselCategory', enum: VesselCategory, required: false })
  findAll(
    @Req() req: { portScope: ScopeFilter },
    @Query('vesselCategory', new ParseEnumPipe(VesselCategory, { optional: true }))
    vesselCategory?: VesselCategory,
  ) {
    return this.visitsService.findAll(req.portScope, vesselCategory);
  }

  @Get('berthing-overrides/pending')
  @Roles(UserRole.KEPALA_PELABUHAN, ...ROLE_GROUPS.ALL_BERTH_OFFICERS, UserRole.PETUGAS_REGISTRASI_KONTRAK)
  findPendingOverrides(@Req() req: { portScope: ScopeFilter }) {
    return this.visitsService.findPendingBerthingOverrides(req.portScope);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findById(@Param('id', ParseIntPipe) id: number, @Req() req: { portScope: ScopeFilter }) {
    return this.visitsService.findById(id, req.portScope);
  }

  @Get(':id/berthings/check-compatibility')
  @Roles(UserRole.KEPALA_PELABUHAN, ...ROLE_GROUPS.ALL_BERTH_OFFICERS, UserRole.PETUGAS_REGISTRASI_KONTRAK)
  @ApiQuery({ name: 'berthId', type: Number, required: true })
  checkCompatibility(
    @Param('id', ParseIntPipe) id: number,
    @Query('berthId', ParseIntPipe) berthId: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.checkBerthCompatibility(id, berthId, req.portScope);
  }

  @Post()
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS, UserRole.OPERATOR_KAPAL)
  createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.createVisit(dto, user, req.portScope);
  }

  @Post(':id/approve')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS, UserRole.PETUGAS_REGISTRASI_KONTRAK)
  approveVisit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.approveVisit(id, user, req.portScope, dto);
  }

  @Post(':id/arrival')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS)
  recordArrival(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordArrivalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.recordArrival(id, dto, user, req.portScope);
  }

  @Post(':id/berthings/start')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('evidenceFile'))
  startBerthing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartBerthingDto,
    @UploadedFile() evidenceFile: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.startBerthing(id, dto, user, req.portScope, evidenceFile);
  }

  @Post(':id/berthings/:berthingId/approve-override')
  @Roles(UserRole.KEPALA_PELABUHAN)
  approveBerthingOverride(
    @Param('id', ParseIntPipe) id: number,
    @Param('berthingId', ParseIntPipe) berthingId: number,
    @Body() dto: ApproveBerthingOverrideDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.approveBerthingOverride(id, berthingId, dto, user, req.portScope);
  }

  @Post(':id/berthings/:berthingId/end')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS)
  endBerthing(
    @Param('id', ParseIntPipe) id: number,
    @Param('berthingId', ParseIntPipe) berthingId: number,
    @Body() dto: EndBerthingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.endBerthing(id, berthingId, dto, user, req.portScope);
  }

  @Post(':id/depart')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS)
  recordDeparture(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordDepartureDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.recordDeparture(id, dto, user, req.portScope);
  }
}
