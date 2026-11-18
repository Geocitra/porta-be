import { Module } from '@nestjs/common';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { TasksModule } from '../tasks/tasks.module';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';

@Module({
  imports: [TasksModule],
  controllers: [DailyReportsController],
  providers: [DailyReportsService, AuditLogService],
  exports: [DailyReportsService],
})
export class DailyReportsModule {}
