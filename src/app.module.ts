import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './common/prisma/prisma.module';
import { loadAppConfig } from './config/env.config';
import { AssetsLeasesModule } from './modules/assets-leases/assets-leases.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { CargoUtilityModule } from './modules/cargo-utility/cargo-utility.module';
import { DailyReportsModule } from './modules/daily-reports/daily-reports.module';
import { GateTicketingModule } from './modules/gate-ticketing/gate-ticketing.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PortsModule } from './modules/ports/ports.module';
import { PublicPortalModule } from './modules/public-portal/public-portal.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TariffsModule } from './modules/tariffs/tariffs.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { VesselsModule } from './modules/vessels/vessels.module';
import { VisitsModule } from './modules/visits/visits.module';
import { WarningsModule } from './modules/warnings/warnings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadAppConfig],
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    PortsModule,
    AssignmentsModule,
    TasksModule,
    MonitoringModule,
    VesselsModule,
    TariffsModule,
    VisitsModule,
    BillingModule,
    DailyReportsModule,
    GateTicketingModule,
    AssetsLeasesModule,
    MaintenanceModule,
    CargoUtilityModule,
    WarningsModule,
    NotificationsModule,
    PublicPortalModule,
    ReportsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
