import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WARNING_ISSUED_EVENT, WarningIssuedEvent } from '../warnings/warnings.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  findMyNotifications(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
      data: { isRead: true },
    });
  }

  @OnEvent(WARNING_ISSUED_EVENT)
  async handleWarningIssued(event: WarningIssuedEvent): Promise<void> {
    const operatorUsers = await this.prisma.user.findMany({
      where: { operatorId: event.operatorId, isActive: true },
      select: { id: true },
    });

    if (operatorUsers.length === 0) return;

    await this.prisma.notification.createMany({
      data: operatorUsers.map((u) => ({
        userId: u.id,
        title: `Surat Teguran ${event.warningNumber}`,
        message: event.message,
        type: 'WARNING',
        linkUrl: `/operator/warnings/${event.warningId}`,
      })),
    });
  }
}

