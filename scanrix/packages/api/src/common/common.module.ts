import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AnalyticsService } from './analytics.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [AuditService, AnalyticsService],
  exports: [AuditService, AnalyticsService],
})
export class CommonModule {}
