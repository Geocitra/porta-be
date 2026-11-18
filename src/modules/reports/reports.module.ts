import { Module } from '@nestjs/common';
import { AuditLogsController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController, AuditLogsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
