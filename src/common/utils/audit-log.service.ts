import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditParams {
  actorId?: number | null;
  actorRole?: string | null;
  portId?: number | null;
  action: string;
  entityName: string;
  entityId: string | number;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  tx?: Prisma.TransactionClient;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'currentpassword',
  'newpassword',
  'temporarypassword',
  'temporary_password',
  'generatedcredentials',
  'generated_credentials',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'snaptoken',
  'snap_token',
  'secret',
]);

function sanitizeAuditPayload(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeAuditPayload(item));
  }
  if (typeof input === 'object') {
    // Handle Prisma Decimal or objects with toJSON
    const maybeObj = input as Record<string, unknown>;
    if (typeof (maybeObj as { toNumber?: unknown }).toNumber === 'function') {
      return Number(String(input));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(maybeObj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        continue;
      }
      sanitized[key] = sanitizeAuditPayload(val);
    }
    return sanitized;
  }
  return input;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    const client = params.tx ?? this.prisma;
    const cleanBefore = sanitizeAuditPayload(params.beforeData);
    const cleanAfter = sanitizeAuditPayload(params.afterData);

    // Infer portId from afterData or beforeData if not explicitly provided
    const inferredPortId =
      params.portId ??
      ((cleanAfter as Record<string, unknown> | undefined)?.portId as number | undefined) ??
      ((cleanBefore as Record<string, unknown> | undefined)?.portId as number | undefined) ??
      null;

    await client.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        portId: typeof inferredPortId === 'number' ? inferredPortId : null,
        action: params.action,
        entityName: params.entityName,
        entityId: String(params.entityId),
        beforeData: cleanBefore
          ? (cleanBefore as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        afterData: cleanAfter
          ? (cleanAfter as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        reason: params.reason ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
