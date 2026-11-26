import { Module } from '@nestjs/common';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { StorageService } from '../../common/utils/storage.service';
import { AssignmentsModule } from '../assignments/assignments.module';
import { TaskSourceContextHydrator } from './helpers/task-source-hydrator';
import { TaskTriggerListener } from './task-trigger.listener';
import {
  TaskReviewsController,
  TasksController,
  TaskSubmissionsController,
} from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [AssignmentsModule],
  controllers: [TasksController, TaskSubmissionsController, TaskReviewsController],
  providers: [
    TasksService,
    TaskTriggerListener,
    TaskSourceContextHydrator,
    AuditLogService,
    StorageService,
  ],
  exports: [TasksService],
})
export class TasksModule {}
