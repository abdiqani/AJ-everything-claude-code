import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { DomainsService } from './domains.service';

@Injectable()
export class DomainsCron {
  private readonly logger = new Logger(DomainsCron.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly domains: DomainsService,
  ) {}

  /**
   * Every 15 minutes: re-check all PENDING domains.
   * Allows DNS propagation to complete without user action.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async recheckPendingDomains(): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id, org_id AS "orgId", last_checked_at AS "lastCheckedAt"
       FROM domains
       WHERE verification_state = 'PENDING'
         AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '15 minutes')
       LIMIT 50`,
    );

    if (rows.length === 0) return;
    this.logger.log(`Rechecking ${rows.length} pending domain(s)`);

    for (const domain of rows) {
      try {
        await this.domains.checkVerification(domain.orgId, domain.id);
      } catch (err) {
        this.logger.warn(`Recheck failed for domain ${domain.id}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Daily: expire VERIFIED domains that haven't been re-checked in >90 days.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async expireStaleVerifications(): Promise<void> {
    const { rowCount } = await this.db.query(
      `UPDATE domains
       SET verification_state = 'EXPIRED'
       WHERE verification_state = 'VERIFIED'
         AND expires_at IS NOT NULL
         AND expires_at < NOW()`,
    );
    if (rowCount && rowCount > 0) {
      this.logger.log(`Expired ${rowCount} stale domain verification(s)`);
    }
  }
}
