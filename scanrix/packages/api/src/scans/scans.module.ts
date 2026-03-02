import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { AuthModule } from '../auth/auth.module';
import { DomainsModule } from '../domains/domains.module';
import { PlansModule } from '../plans/plans.module';
import { SCAN_QUEUE } from './scans.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: SCAN_QUEUE }),
    // Stricter throttle for scan creation (10 per minute per user)
    ThrottlerModule.forRoot([{ name: 'scan-create', ttl: 60_000, limit: 10 }]),
    AuthModule,
    DomainsModule,
    PlansModule,
  ],
  controllers: [ScansController],
  providers: [ScansService],
})
export class ScansModule {}
