import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditLogService } from '../utils/audit-log.service';
import { StorageService } from '../utils/storage.service';

@Global()
@Module({
  providers: [PrismaService, AuditLogService, StorageService],
  exports: [PrismaService, AuditLogService, StorageService],
})
export class PrismaModule {}
