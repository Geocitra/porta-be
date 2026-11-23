import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  TaskExecutionStatus,
  TaskReviewStatus,
  TaskType,
  UserRole,
} from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AdminApproveTaskDto,
  CreateTaskDto,
  CreateTaskTemplateDto,
  HeadVerifyTaskDto,
  ReturnOrRejectTaskDto,
  SubmitTaskDto,
  UpdateAdminTaskChecklistDto,
  UpdateOfficerTaskChecklistDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@ApiTags('Tasks Management & Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('templates')
  findTemplates() {
    return this.tasksService.findTemplates();
  }

  @Post('templates')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  createTemplate(
    @Body() dto: CreateTaskTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasksService.createOrUpdateTemplate(dto, actor);
  }

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'terminalId', required: false, type: Number })
  @ApiQuery({ name: 'berthId', required: false, type: Number })
  @ApiQuery({ name: 'assigneeId', required: false, type: Number })
  @ApiQuery({ name: 'taskType', required: false, enum: TaskType })
  @ApiQuery({ name: 'executionStatus', required: false, enum: TaskExecutionStatus })
  @ApiQuery({ name: 'reviewStatus', required: false, enum: TaskReviewStatus })
  @ApiQuery({ name: 'isOverdue', required: false, type: Boolean })
  @ApiQuery({ name: 'unsubmittedOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'obligationDate', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() user: AuthenticatedUser,
    @Query('portId') portId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('berthId') berthId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('taskType', new ParseEnumPipe(TaskType, { optional: true }))
    taskType?: TaskType,
    @Query('executionStatus', new ParseEnumPipe(TaskExecutionStatus, { optional: true }))
    executionStatus?: TaskExecutionStatus,
    @Query('reviewStatus', new ParseEnumPipe(TaskReviewStatus, { optional: true }))
    reviewStatus?: TaskReviewStatus,
    @Query('isOverdue') isOverdue?: string,
    @Query('unsubmittedOnly') unsubmittedOnly?: string,
    @Query('obligationDate') obligationDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasksService.findAll(req.portScope, user, {
      portId: portId ? Number(portId) : undefined,
      terminalId: terminalId ? Number(terminalId) : undefined,
      berthId: berthId ? Number(berthId) : undefined,
      assigneeId: assigneeId ? Number(assigneeId) : undefined,
      taskType,
      executionStatus,
      reviewStatus,
      isOverdue:
        isOverdue !== undefined ? isOverdue === 'true' || isOverdue === '1' : undefined,
      unsubmittedOnly: unsubmittedOnly === 'true' || unsubmittedOnly === '1',
      obligationDate,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
  )
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.findById(id, user, req.portScope);
  }

  @Post()
  @Roles(
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
  )
  createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.createTask(dto, actor, req.portScope);
  }

  @Patch(':id/start')
  @Roles(...ROLE_GROUPS.ALL_FIELD_OFFICERS)
  startTask(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.startTask(id, actor, req.portScope);
  }

  @Patch(':id/checklist')
  @Roles(...ROLE_GROUPS.ALL_FIELD_OFFICERS)
  updateChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfficerTaskChecklistDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.updateOfficerChecklist(id, dto, actor, req.portScope);
  }

  @Post(':id/attachments')
  @Roles(...ROLE_GROUPS.ALL_FIELD_OFFICERS, UserRole.ADMIN_PELABUHAN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('notes') notes: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.uploadTaskAttachment(id, file, notes, actor, req.portScope);
  }

  @Post(':id/submit')
  @Roles(...ROLE_GROUPS.ALL_FIELD_OFFICERS)
  submitTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.submitTask(id, dto, actor, req.portScope);
  }
}

@ApiTags('Task Submissions (Petugas)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('task-submissions')
export class TaskSubmissionsController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(...ROLE_GROUPS.ALL_FIELD_OFFICERS)
  createSubmission(
    @Body() dto: SubmitTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    if (!dto.taskId) {
      throw new BadRequestException('taskId is required when submitting via /task-submissions');
    }
    return this.tasksService.submitTask(dto.taskId, dto, actor, req.portScope);
  }
}

@ApiTags('Task Reviews (Admin Checker & Kepala Pelabuhan Verification)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('task-reviews')
export class TaskReviewsController {
  constructor(private readonly tasksService: TasksService) {}

  // ==========================================================================
  // ADMIN PELABUHAN (CHECKER) ENDPOINTS
  // ==========================================================================

  @Get('admin/dashboard')
  @Roles(UserRole.ADMIN_PELABUHAN, UserRole.KEPALA_PELABUHAN)
  @ApiQuery({ name: 'date', required: false, type: String })
  getAdminDashboard(
    @Req() req: { portScope: ScopeFilter },
    @Query('date') date?: string,
  ) {
    return this.tasksService.getAdminCheckerDashboard(req.portScope, date);
  }

  @Post('admin/:taskId/start-review')
  @Roles(UserRole.ADMIN_PELABUHAN)
  startAdminReview(
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.startAdminReview(taskId, actor, req.portScope);
  }

  @Patch('admin/:taskId/checklist')
  @Roles(UserRole.ADMIN_PELABUHAN)
  updateAdminChecklist(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateAdminTaskChecklistDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.updateAdminChecklist(taskId, dto, actor, req.portScope);
  }

  @Post('admin/:taskId/approve')
  @Roles(UserRole.ADMIN_PELABUHAN)
  adminApprove(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: AdminApproveTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.adminApproveAndForward(taskId, dto, actor, req.portScope);
  }

  @Post('admin/:taskId/return')
  @Roles(UserRole.ADMIN_PELABUHAN)
  adminReturn(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReturnOrRejectTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.adminReturnTask(taskId, dto, actor, req.portScope);
  }

  // ==========================================================================
  // KEPALA PELABUHAN (SUBSTANTIVE VERIFIER) ENDPOINTS
  // ==========================================================================

  @Get('head/queue')
  @Roles(UserRole.KEPALA_PELABUHAN)
  getHeadQueue(@Req() req: { portScope: ScopeFilter }) {
    return this.tasksService.getHeadVerificationQueue(req.portScope);
  }

  @Get('head/port-status')
  @Roles(UserRole.KEPALA_PELABUHAN)
  getHeadPortStatus(@Req() req: { portScope: ScopeFilter }) {
    return this.tasksService.getHeadPortOperationalStatus(req.portScope);
  }

  @Post('head/:taskId/verify')
  @Roles(UserRole.KEPALA_PELABUHAN)
  headVerify(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: HeadVerifyTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.headVerifyTask(taskId, dto, actor, req.portScope);
  }

  @Post('head/:taskId/return')
  @Roles(UserRole.KEPALA_PELABUHAN)
  headReturn(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReturnOrRejectTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.headReturnTask(taskId, dto, actor, req.portScope);
  }

  @Post('head/:taskId/reject')
  @Roles(UserRole.KEPALA_PELABUHAN)
  headReject(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReturnOrRejectTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.tasksService.headRejectTask(taskId, dto, actor, req.portScope);
  }
}
