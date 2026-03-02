import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { ScanProfile } from '../scans/scans.types';

const PLAN_LIMITS: Record<string, { scansPerMonth: number; profiles: ScanProfile[]; concurrency: number }> = {
  free:       { scansPerMonth: 1,    profiles: ['QUICK'],                       concurrency: 1 },
  starter:    { scansPerMonth: 20,   profiles: ['QUICK', 'STANDARD'],           concurrency: 2 },
  pro:        { scansPerMonth: 100,  profiles: ['QUICK', 'STANDARD', 'DEEP'],   concurrency: 5 },
  enterprise: { scansPerMonth: 9999, profiles: ['QUICK', 'STANDARD', 'DEEP'],   concurrency: 20 },
};

@Injectable()
export class PlansService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async assertScanAllowed(orgId: string, plan: string, profile: ScanProfile): Promise<void> {
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['free'];

    if (!limits.profiles.includes(profile)) {
      throw new ForbiddenException(
        `Scan profile "${profile}" is not available on the ${plan} plan. Please upgrade.`,
      );
    }

    // Check monthly usage
    const { rows } = await this.db.query(
      `SELECT COUNT(*) AS cnt FROM scans
       WHERE org_id = $1
         AND created_at >= date_trunc('month', NOW())
         AND status NOT IN ('CANCELLED','FAILED')`,
      [orgId],
    );

    const used = parseInt(rows[0].cnt, 10);
    if (used >= limits.scansPerMonth) {
      throw new ForbiddenException(
        `Monthly scan limit reached (${limits.scansPerMonth} scans/month on ${plan} plan). Please upgrade.`,
      );
    }
  }

  getLimits(plan: string) {
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS['free'];
  }
}
