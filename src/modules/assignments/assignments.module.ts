import { Module } from '@nestjs/common';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AuditLogService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
