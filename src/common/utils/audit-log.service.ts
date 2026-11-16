import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditParams {
  actorId?: number | null;
  action: string;
  entityName: string;
  entityId: string | number;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string;
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    const client = params.tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        entityName: params.entityName,
        entityId: String(params.entityId),
        beforeData: params.beforeData ? (params.beforeData as Prisma.InputJsonValue) : Prisma.JsonNull,
        afterData: params.afterData ? (params.afterData as Prisma.InputJsonValue) : Prisma.JsonNull,
        reason: params.reason ?? null,
      },
    });
  }
}

