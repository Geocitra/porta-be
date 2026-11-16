import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
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
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.visitsService.findAll(req.portScope);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number, @Req() req: { portScope: ScopeFilter }) {
    return this.visitsService.findById(id, req.portScope);
  }

  @Post()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.OPERATOR_KAPAL,
  )
  createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.createVisit(dto, user, req.portScope);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  approveVisit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.approveVisit(id, user, req.portScope);
  }

  @Post(':id/arrival')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  recordArrival(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordArrivalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.recordArrival(id, dto, user, req.portScope);
  }

  @Post(':id/berthings/start')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
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

  @Post(':id/berthings/:berthingId/end')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
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
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  recordDeparture(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordDepartureDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.visitsService.recordDeparture(id, dto, user, req.portScope);
  }
}

