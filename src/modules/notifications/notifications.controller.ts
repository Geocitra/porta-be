import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationPriority, UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications & Operational Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'priority', required: false, enum: NotificationPriority })
  @ApiQuery({ name: 'category', required: false, type: String })
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('isRead') isRead?: string,
    @Query('priority', new ParseEnumPipe(NotificationPriority, { optional: true }))
    priority?: NotificationPriority,
    @Query('category') category?: string,
  ) {
    return this.notificationsService.findMyNotifications(user.id, {
      isRead: isRead !== undefined ? isRead === 'true' || isRead === '1' : undefined,
      priority,
      category,
    });
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getMyPreferences(user.id);
  }

  @Put('preferences')
  upsertPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      category: string;
      minPriority?: NotificationPriority;
      inAppEnabled?: boolean;
    },
  ) {
    return this.notificationsService.upsertPreference(user.id, body);
  }

  @Post('scan-alerts')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  scanAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('portId') portId?: string,
  ) {
    const effectivePortId =
      user.portId ?? (portId ? Number(portId) : undefined);
    return this.notificationsService.scanAndGenerateOperationalAlerts(effectivePortId);
  }
}
