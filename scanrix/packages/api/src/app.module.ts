import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ScansModule } from './scans/scans.module';
import { DomainsModule } from './domains/domains.module';
import { AuthModule } from './auth/auth.module';
import { PlansModule } from './plans/plans.module';
import { FindingsModule } from './findings/findings.module';
import { ReportsModule } from './reports/reports.module';
import { DatabaseModule } from './common/database.module';
import { StorageModule } from './storage/storage.module';
import { CommonModule } from './common/common.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting: 200 req/min globally
    ThrottlerModule.forRoot([{
      name: 'global',
      ttl: 60_000,
      limit: 200,
    }]),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),

    DatabaseModule,
    StorageModule,
    CommonModule,
    AuthModule,
    DomainsModule,
    ScansModule,
    PlansModule,
    FindingsModule,
    ReportsModule,
    BillingModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
