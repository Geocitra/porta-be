import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssignmentStatus, UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto,
  RevokeAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignments.dto';

@ApiTags('Assignments, Roles & Granular Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get('permissions')
  getPermissionsCatalog() {
    return this.assignmentsService.getPermissionsCatalog();
  }

  @Get('my')
  findMyAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.findMyAssignments(user);
  }

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'berthId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: AssignmentStatus })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(
    @Req() req: { portScope: ScopeFilter },
    @Query('portId') portId?: string,
    @Query('userId') userId?: string,
    @Query('berthId') berthId?: string,
    @Query('status', new ParseEnumPipe(AssignmentStatus, { optional: true }))
    status?: AssignmentStatus,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.assignmentsService.findAll(req.portScope, {
      portId: portId ? Number(portId) : undefined,
      userId: userId ? Number(userId) : undefined,
      berthId: berthId ? Number(berthId) : undefined,
      status,
      activeOnly: activeOnly === 'true' || activeOnly === '1',
    });
  }

  @Post()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  create(
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assignmentsService.create(dto, actor, req.portScope);
  }

  @Patch(':id')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assignmentsService.update(id, dto, actor, req.portScope);
  }

  @Patch(':id/revoke')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  revoke(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokeAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assignmentsService.revoke(id, dto, actor, req.portScope);
  }
}
