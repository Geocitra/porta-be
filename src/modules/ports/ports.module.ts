import { Module } from '@nestjs/common';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { PortsController, TerminalsAndBerthsController } from './ports.controller';
import { PortsService } from './ports.service';

@Module({
  controllers: [PortsController, TerminalsAndBerthsController],
  providers: [PortsService, AuditLogService],
  exports: [PortsService],
})
export class PortsModule {}
