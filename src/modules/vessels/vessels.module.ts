import { Module } from '@nestjs/common';
import { AuditLogService } from '../../common/utils/audit-log.service';
import { StorageService } from '../../common/utils/storage.service';
import { OperatorsController, VesselsController } from './vessels.controller';
import { VesselsService } from './vessels.service';

@Module({
  controllers: [OperatorsController, VesselsController],
  providers: [VesselsService, StorageService, AuditLogService],
  exports: [VesselsService],
})
export class VesselsModule {}
