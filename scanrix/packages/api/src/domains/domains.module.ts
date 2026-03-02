import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainsCron } from './domains.cron';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DomainsController],
  providers: [DomainsService, DomainsCron],
  exports: [DomainsService],
})
export class DomainsModule {}
