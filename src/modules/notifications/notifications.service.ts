import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationPriority,
  TaskExecutionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TASK_WORKFLOW_EVENT,
  TaskWorkflowEvent,
} from '../tasks/tasks.service';
import {
  BERTHING_OVERRIDE_REQUESTED_EVENT,
  BerthingOverrideRequestedEvent,
  VISIT_APPROVED_EVENT,
  VISIT_CREATED_EVENT,
  VisitLifecycleEvent,
} from '../visits/visits.service';
import {
  MAINTENANCE_REPORTED_EVENT,
  MaintenanceReportedEvent,
} from '../maintenance/maintenance.service';
import {
  BERTHING_CONTRACT_REVIEWED_EVENT,
  BERTHING_CONTRACT_SUBMITTED_EVENT,
  BERTHING_CONTRACT_VERIFIED_EVENT,
  BerthingContractEvent,
} from '../vessels/vessels.service';
import { WARNING_ISSUED_EVENT, WarningIssuedEvent } from '../warnings/warnings.service';
import {
  GATEWAY_PAYMENT_SETTLED_EVENT,
  GatewayPaymentSettledEvent,
} from '../payments/payments.service';

export interface CreateSmartNotificationParams {
  userId: number;
  portId?: number | null;
  title: string;
  message: string;
  type: string;
  category?: string;
  priority?: NotificationPriority;
  resourceType?: string;
  resourceId?: string | number;
  dedupKey?: string;
  linkUrl?: string;
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  [NotificationPriority.INFORMATIONAL]: 1,
  [NotificationPriority.WARNING]: 2,
  [NotificationPriority.URGENT]: 3,
  [NotificationPriority.CRITICAL]: 4,
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  findMyNotifications(
    userId: number,
    filters?: {
      isRead?: boolean;
      priority?: NotificationPriority;
      category?: string;
    },
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(filters?.isRead !== undefined ? { isRead: filters.isRead } : {}),
        ...(filters?.priority ? { priority: filters.priority } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markAsRead(notificationId: number, userId: number) {
    const existing = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Notification #${notificationId} not found`);
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updatedCount: res.count };
  }

  async getMyPreferences(userId: number) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { category: 'asc' },
    });
  }

  async upsertPreference(
    userId: number,
    dto: {
      category: string;
      minPriority?: NotificationPriority;
      inAppEnabled?: boolean;
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_category: { userId, category: dto.category },
      },
      update: {
        ...(dto.minPriority ? { minPriority: dto.minPriority } : {}),
        ...(dto.inAppEnabled !== undefined ? { inAppEnabled: dto.inAppEnabled } : {}),
      },
      create: {
        userId,
        category: dto.category,
        minPriority: dto.minPriority ?? NotificationPriority.INFORMATIONAL,
        inAppEnabled: dto.inAppEnabled ?? true,
      },
    });
  }

  /**
   * Dispatches a notification with deduplication (dedupKey) and user preference checks.
   */
  async dispatchNotification(params: CreateSmartNotificationParams) {
    const category = params.category ?? 'GENERAL';
    const priority = params.priority ?? NotificationPriority.INFORMATIONAL;

    const pref = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_category: { userId: params.userId, category },
      },
    });

    if (pref) {
      if (!pref.inAppEnabled) return null;
      if (PRIORITY_RANK[priority] < PRIORITY_RANK[pref.minPriority]) {
        return null;
      }
    }

    if (params.dedupKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { dedupKey: params.dedupKey },
      });
      if (existing) return existing;
    }

    return this.prisma.notification.create({
      data: {
        userId: params.userId,
        portId: params.portId ?? null,
        title: params.title,
        message: params.message,
        type: params.type,
        category,
        priority,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId !== undefined ? String(params.resourceId) : null,
        dedupKey: params.dedupKey ?? null,
        linkUrl: params.linkUrl ?? null,
      },
    });
  }

  /**
   * Proactive alert scanner for:
   * - Tasks not started, tasks overdue, manifest not submitted, daily report missing, damaged assets.
   */
  async scanAndGenerateOperationalAlerts(portId?: number) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const portWhere = portId ? { portId } : {};

    const [overdueTasks, notStartedTasks, unsubmittedManifestVisits] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          ...portWhere,
          dueDate: { lt: now },
          executionStatus: {
            notIn: [TaskExecutionStatus.COMPLETED, TaskExecutionStatus.CANCELLED],
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          ...portWhere,
          executionStatus: TaskExecutionStatus.NOT_STARTED,
        },
      }),
      this.prisma.shipVisit.findMany({
        where: {
          ...portWhere,
          status: { in: ['ANCHORED', 'BERTHED'] },
          manifests: { none: {} },
        },
        include: { vessel: { select: { name: true } } },
      }),
    ]);

    let generatedCount = 0;

    for (const task of overdueTasks) {
      const recipients = new Set<number>();
      if (task.assigneeId) recipients.add(task.assigneeId);

      const adminsAndHeads = await this.prisma.user.findMany({
        where: {
          portId: task.portId,
          isActive: true,
          role: { in: [UserRole.ADMIN_PELABUHAN, UserRole.KEPALA_PELABUHAN] },
        },
        select: { id: true },
      });
      for (const u of adminsAndHeads) recipients.add(u.id);

      for (const userId of recipients) {
        const created = await this.dispatchNotification({
          userId,
          portId: task.portId,
          title: `Pekerjaan Terlambat (${task.taskNumber})`,
          message: `Task "${task.title}" telah melewati batas waktu (Due: ${task.dueDate.toISOString()}) dan membutuhkan tindak lanjut segera.`,
          type: 'TASK_OVERDUE',
          category: 'TASK',
          priority: NotificationPriority.URGENT,
          resourceType: 'tasks',
          resourceId: task.id,
          dedupKey: `OVERDUE_${task.id}_USER_${userId}_${todayStr}`,
          linkUrl: `/tasks/${task.id}`,
        });
        if (created) generatedCount += 1;
      }
    }

    for (const task of notStartedTasks) {
      if (!task.assigneeId) continue;
      const created = await this.dispatchNotification({
        userId: task.assigneeId,
        portId: task.portId,
        title: `Kewajiban Pekerjaan Belum Dikerjakan (${task.taskNumber})`,
        message: `Task "${task.title}" belum dimulai. Segera laksanakan sesuai SOP.`,
        type: 'TASK_NOT_STARTED',
        category: 'TASK',
        priority: NotificationPriority.WARNING,
        resourceType: 'tasks',
        resourceId: task.id,
        dedupKey: `NOT_STARTED_${task.id}_USER_${task.assigneeId}_${todayStr}`,
        linkUrl: `/tasks/${task.id}`,
      });
      if (created) generatedCount += 1;
    }

    for (const visit of unsubmittedManifestVisits) {
      const admins = await this.prisma.user.findMany({
        where: {
          portId: visit.portId,
          isActive: true,
          role: UserRole.ADMIN_PELABUHAN,
        },
        select: { id: true },
      });
      for (const admin of admins) {
        const created = await this.dispatchNotification({
          userId: admin.id,
          portId: visit.portId,
          title: `Manifest Belum Dikirim (${visit.visitNumber})`,
          message: `Kapal ${visit.vessel.name} sudah berada di pelabuhan namun data manifest belum dikirim.`,
          type: 'MANIFEST_NOT_SUBMITTED',
          category: 'MANIFEST',
          priority: NotificationPriority.WARNING,
          resourceType: 'ship_visits',
          resourceId: visit.id,
          dedupKey: `MANIFEST_MISSING_${visit.id}_USER_${admin.id}_${todayStr}`,
          linkUrl: `/visits/${visit.id}`,
        });
        if (created) generatedCount += 1;
      }
    }

    return {
      scannedAt: now.toISOString(),
      overdueTasksCount: overdueTasks.length,
      notStartedTasksCount: notStartedTasks.length,
      unsubmittedManifestVisitsCount: unsubmittedManifestVisits.length,
      notificationsDispatched: generatedCount,
    };
  }

  @OnEvent(TASK_WORKFLOW_EVENT)
  async handleTaskWorkflowEvent(event: TaskWorkflowEvent): Promise<void> {
    if (event.action === 'SUBMIT_TASK') {
      // Notify ADMIN_PELABUHAN in the task's port
      const admins = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: UserRole.ADMIN_PELABUHAN,
          OR: [{ portId: event.portId }, { portId: null }],
        },
        select: { id: true },
      });
      for (const admin of admins) {
        await this.dispatchNotification({
          userId: admin.id,
          portId: event.portId,
          title: `Task Menunggu Pemeriksaan Admin (${event.taskNumber})`,
          message: `Pekerjaan "${event.title}" telah dikirim oleh petugas dan menunggu pemeriksaan kelengkapan Anda.`,
          type: 'TASK_WAITING_ADMIN',
          category: 'TASK',
          priority: NotificationPriority.INFORMATIONAL,
          resourceType: 'tasks',
          resourceId: event.taskId,
          linkUrl: `/tasks/${event.taskId}`,
        });
      }
    } else if (event.action === 'ADMIN_APPROVE') {
      // Notify KEPALA_PELABUHAN in the task's port
      const heads = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: UserRole.KEPALA_PELABUHAN,
          portId: event.portId,
        },
        select: { id: true },
      });
      for (const head of heads) {
        await this.dispatchNotification({
          userId: head.id,
          portId: event.portId,
          title: `Task Menunggu Verifikasi Kepala Pelabuhan (${event.taskNumber})`,
          message: `Pekerjaan "${event.title}" telah lolos pemeriksaan Admin dan menunggu verifikasi akhir Anda.`,
          type: 'TASK_WAITING_HEAD',
          category: 'TASK',
          priority: NotificationPriority.WARNING,
          resourceType: 'tasks',
          resourceId: event.taskId,
          linkUrl: `/tasks/${event.taskId}`,
        });
      }
    } else if (
      (event.action === 'ADMIN_RETURN' ||
        event.action === 'HEAD_RETURN' ||
        event.action === 'HEAD_REJECT' ||
        event.action === 'HEAD_VERIFY') &&
      event.assigneeId
    ) {
      const isReturnedOrRejected = event.action !== 'HEAD_VERIFY';
      await this.dispatchNotification({
        userId: event.assigneeId,
        portId: event.portId,
        title: isReturnedOrRejected
          ? `Pekerjaan Dikembalikan / Ditolak (${event.taskNumber})`
          : `Pekerjaan Terverifikasi Selesai (${event.taskNumber})`,
        message: isReturnedOrRejected
          ? `Task "${event.title}" memerlukan perbaikan (${event.reviewStatus}). Alasan: ${event.reason ?? '-'}`
          : `Task "${event.title}" telah diverifikasi oleh Kepala Pelabuhan.`,
        type: isReturnedOrRejected ? 'TASK_RETURNED' : 'TASK_VERIFIED',
        category: 'TASK',
        priority: isReturnedOrRejected
          ? NotificationPriority.URGENT
          : NotificationPriority.INFORMATIONAL,
        resourceType: 'tasks',
        resourceId: event.taskId,
        linkUrl: `/tasks/${event.taskId}`,
      });
    }
  }

  @OnEvent(VISIT_CREATED_EVENT)
  @OnEvent(VISIT_APPROVED_EVENT)
  async handleVesselArrivingNotification(event: VisitLifecycleEvent): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        portId: event.portId,
        role: {
          in: [
            UserRole.PETUGAS_DERMAGA_BARANG,
            UserRole.PETUGAS_DERMAGA_PENUMPANG,
            UserRole.PETUGAS_PELABUHAN,
            UserRole.PETUGAS_DERMAGA,
            UserRole.ADMIN_PELABUHAN,
            UserRole.KEPALA_PELABUHAN,
          ],
        },
      },
      select: { id: true },
    });

    for (const u of recipients) {
      await this.dispatchNotification({
        userId: u.id,
        portId: event.portId,
        title: `Kapal Akan Datang: ${event.vesselName} (${event.visitNumber})`,
        message: `Jadwal kedatangan kapal ${event.vesselName} tercatat pada ${event.eta.toISOString()}.`,
        type: 'VESSEL_ARRIVING',
        category: 'VESSEL',
        priority: NotificationPriority.INFORMATIONAL,
        resourceType: 'ship_visits',
        resourceId: event.visitId,
        dedupKey: `VESSEL_ARRIVING_${event.visitId}_USER_${u.id}`,
        linkUrl: `/visits/${event.visitId}`,
      });
    }
  }

  @OnEvent(BERTHING_CONTRACT_SUBMITTED_EVENT)
  async handleBerthingContractSubmitted(event: BerthingContractEvent): Promise<void> {
    const officers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        portId: event.portId,
        role: {
          in: [
            UserRole.PETUGAS_REGISTRASI_KONTRAK,
            UserRole.ADMIN_PELABUHAN,
            UserRole.PETUGAS_PELABUHAN,
          ],
        },
      },
      select: { id: true },
    });

    for (const u of officers) {
      await this.dispatchNotification({
        userId: u.id,
        portId: event.portId,
        title: `Pengajuan Kontrak PKS Sandar Baru (${event.contractNumber})`,
        message: `Kontrak PKS Sandar "${event.title}" menunggu pemeriksaan prasyarat oleh Petugas Registrasi & Kontrak.`,
        type: 'BERTHING_CONTRACT_SUBMITTED',
        category: 'CONTRACT',
        priority: NotificationPriority.WARNING,
        resourceType: 'operator_berthing_contracts',
        resourceId: event.contractId,
        dedupKey: `CONTRACT_SUBMIT_${event.contractId}_USER_${u.id}`,
        linkUrl: `/operators/${event.operatorId}/contracts`,
      });
    }
  }

  @OnEvent(BERTHING_CONTRACT_REVIEWED_EVENT)
  async handleBerthingContractReviewed(event: BerthingContractEvent): Promise<void> {
    if (event.status === 'PENDING_HEAD_OF_PORT') {
      const heads = await this.prisma.user.findMany({
        where: {
          isActive: true,
          portId: event.portId,
          role: UserRole.KEPALA_PELABUHAN,
        },
        select: { id: true },
      });

      for (const head of heads) {
        await this.dispatchNotification({
          userId: head.id,
          portId: event.portId,
          title: `Kontrak PKS Sandar Menunggu ACC Kepala Pelabuhan (${event.contractNumber})`,
          message: `Kontrak "${event.title}" telah lolos pemeriksaan Petugas Registrasi dan menunggu pengesahan (ACC) Anda.`,
          type: 'BERTHING_CONTRACT_WAITING_HEAD',
          category: 'CONTRACT',
          priority: NotificationPriority.URGENT,
          resourceType: 'operator_berthing_contracts',
          resourceId: event.contractId,
          dedupKey: `CONTRACT_WAIT_HEAD_${event.contractId}_USER_${head.id}`,
          linkUrl: `/operators/${event.operatorId}/contracts`,
        });
      }
    }
  }

  @OnEvent(BERTHING_CONTRACT_VERIFIED_EVENT)
  async handleBerthingContractVerified(event: BerthingContractEvent): Promise<void> {
    const operatorUsers = await this.prisma.user.findMany({
      where: { operatorId: event.operatorId, isActive: true },
      select: { id: true },
    });

    for (const u of operatorUsers) {
      await this.dispatchNotification({
        userId: u.id,
        portId: event.portId,
        title: `Status Kontrak PKS Sandar ${event.contractNumber}: ${event.status}`,
        message:
          event.status === 'ACTIVE'
            ? `Kontrak PKS Sandar "${event.title}" telah disahkan (ACC) oleh Kepala Pelabuhan dan kini AKTIF.`
            : `Kontrak PKS Sandar "${event.title}" ditolak. Catatan: ${event.notes ?? '-'}`,
        type: 'BERTHING_CONTRACT_VERIFIED',
        category: 'CONTRACT',
        priority:
          event.status === 'ACTIVE'
            ? NotificationPriority.INFORMATIONAL
            : NotificationPriority.URGENT,
        resourceType: 'operator_berthing_contracts',
        resourceId: event.contractId,
        dedupKey: `CONTRACT_VERIFIED_${event.contractId}_${event.status}_USER_${u.id}`,
        linkUrl: `/kapal/kontrak`,
      });
    }
  }

  @OnEvent(WARNING_ISSUED_EVENT)
  async handleWarningIssued(event: WarningIssuedEvent): Promise<void> {
    const operatorUsers = await this.prisma.user.findMany({
      where: { operatorId: event.operatorId, isActive: true },
      select: { id: true },
    });

    for (const u of operatorUsers) {
      await this.dispatchNotification({
        userId: u.id,
        title: `Surat Teguran ${event.warningNumber}`,
        message: event.message,
        type: 'WARNING',
        category: 'BILLING',
        priority: NotificationPriority.URGENT,
        resourceType: 'warnings',
        resourceId: event.warningId,
        dedupKey: `WARNING_${event.warningId}_USER_${u.id}`,
        linkUrl: `/operator/warnings/${event.warningId}`,
      });
    }
  }

  @OnEvent(GATEWAY_PAYMENT_SETTLED_EVENT)
  async handleGatewayPaymentSettled(
    event: GatewayPaymentSettledEvent,
  ): Promise<void> {
    const formattedAmount = `Rp ${Math.round(event.amountIdr).toLocaleString('id-ID')}`;
    const payerLink =
      event.targetType === 'INVOICE' ? '/kapal/penagihan' : '/tenant/tagihan';

    await this.dispatchNotification({
      userId: event.payerUserId,
      portId: event.portId,
      title: `Pembayaran Online Berhasil (${event.orderId})`,
      message: `Pembayaran ${formattedAmount} melalui Midtrans telah terverifikasi lunas dan e-SSRD resmi diterbitkan.`,
      type: 'PAYMENT_SETTLED',
      category: 'BILLING',
      priority: NotificationPriority.INFORMATIONAL,
      resourceType: 'payment_gateway_transactions',
      resourceId: event.transactionId,
      dedupKey: `GW_SETTLED_${event.transactionId}_PAYER_${event.payerUserId}`,
      linkUrl: payerLink,
    });

    const financeOfficers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        portId: event.portId,
        role: { in: [UserRole.BENDAHARA, UserRole.PETUGAS_TAGIHAN] },
      },
      select: { id: true },
    });

    for (const officer of financeOfficers) {
      if (officer.id === event.payerUserId) continue;
      await this.dispatchNotification({
        userId: officer.id,
        portId: event.portId,
        title: `Pembayaran Midtrans Terverifikasi (${event.orderId})`,
        message: `Penerimaan retribusi sebesar ${formattedAmount} (${event.targetType} #${event.targetId}) telah otomatis lunas dan disahkan oleh Midtrans.`,
        type: 'PAYMENT_SETTLED',
        category: 'BILLING',
        priority: NotificationPriority.INFORMATIONAL,
        resourceType: 'payment_gateway_transactions',
        resourceId: event.transactionId,
        dedupKey: `GW_SETTLED_${event.transactionId}_OFFICER_${officer.id}`,
        linkUrl: '/bendahara/verifikasi',
      });
    }
  }

  @OnEvent(BERTHING_OVERRIDE_REQUESTED_EVENT)
  async handleBerthingOverrideRequested(
    event: BerthingOverrideRequestedEvent,
  ): Promise<void> {
    const approvers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        portId: event.portId,
        role: { in: [UserRole.ADMIN_PELABUHAN, UserRole.KEPALA_PELABUHAN] },
      },
      select: { id: true },
    });

    for (const u of approvers) {
      await this.dispatchNotification({
        userId: u.id,
        portId: event.portId,
        title: `Persetujuan Sandar Diperlukan (${event.visitNumber})`,
        message: `Kapal ${event.vesselName} diajukan bersandar di ${event.berthName} (beda kategori). Alasan: ${event.overrideReason}`,
        type: 'BERTHING_OVERRIDE',
        category: 'SAFETY',
        priority: NotificationPriority.URGENT,
        resourceType: 'berthing_records',
        resourceId: event.berthingRecordId,
        dedupKey: `BERTHING_OVERRIDE_${event.berthingRecordId}_USER_${u.id}`,
        linkUrl: `/visits/${event.visitId}`,
      });
    }
  }

  @OnEvent(MAINTENANCE_REPORTED_EVENT)
  async handleMaintenanceReported(event: MaintenanceReportedEvent): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        portId: event.portId,
        role: { in: [UserRole.ADMIN_PELABUHAN, UserRole.KEPALA_PELABUHAN] },
      },
      select: { id: true },
    });

    const priority =
      event.severity === 'CRITICAL'
        ? NotificationPriority.CRITICAL
        : event.severity === 'HIGH'
          ? NotificationPriority.URGENT
          : NotificationPriority.WARNING;

    for (const u of recipients) {
      await this.dispatchNotification({
        userId: u.id,
        portId: event.portId,
        title: `Laporan Kerusakan Fasilitas/Aset (${event.ticketNumber})`,
        message: `[${event.severity}] ${event.title}: ${event.description}`,
        type: 'FACILITY_ASSET_DAMAGED',
        category: 'MAINTENANCE',
        priority,
        resourceType: 'maintenance_tickets',
        resourceId: event.ticketId,
        dedupKey: `MAINT_${event.ticketId}_USER_${u.id}`,
        linkUrl: `/maintenance`,
      });
    }
  }
}
