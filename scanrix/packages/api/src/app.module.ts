import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScansModule } from './scans/scans.module';
import { DomainsModule } from './domains/domains.module';
import { AuthModule } from './auth/auth.module';
import { PlansModule } from './plans/plans.module';
import { FindingsModule } from './findings/findings.module';
import { ReportsModule } from './reports/reports.module';
import { DatabaseModule } from './common/database.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    AuthModule,
    DomainsModule,
    ScansModule,
    PlansModule,
    FindingsModule,
    ReportsModule,
  ],
})
export class AppModule {}
