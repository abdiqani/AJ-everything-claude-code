import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { DomainsService } from '../domains/domains.service';
import { PlansService } from '../plans/plans.service';
import { SsrfGuard } from '../common/ssrf-guard';
import { Scan, ScanProfile, SCAN_QUEUE } from './scans.types';

@Injectable()
export class ScansService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    @InjectQueue(SCAN_QUEUE) private readonly queue: Queue,
    private readonly domains: DomainsService,
    private readonly plans: PlansService,
  ) {}

  async createScan(
    orgId: string,
    userId: string,
    plan: string,
    targetUrl: string,
    scanProfile: ScanProfile,
  ): Promise<Scan> {
    // 1. SSRF protection + URL normalization
    const normalizedUrl = await SsrfGuard.validate(targetUrl);
    const targetHost = normalizedUrl.hostname;

    // 2. Domain ownership verification
    await this.domains.assertDomainVerified(orgId, targetHost);

    // 3. Plan checks
    await this.plans.assertScanAllowed(orgId, plan, scanProfile);

    // 4. Create scan record
    const { rows } = await this.db.query<Scan>(
      `INSERT INTO scans (org_id, created_by, target_url, target_host, scan_profile)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, org_id AS "orgId", created_by AS "createdBy",
                 target_url AS "targetUrl", target_host AS "targetHost",
                 scan_profile AS "scanProfile", status,
                 created_at AS "createdAt"`,
      [orgId, userId, normalizedUrl.toString(), targetHost, scanProfile],
    );

    const scan = rows[0];

    // 5. Enqueue job
    await this.queue.add(
      'run-scan',
      { scanId: scan.id, targetUrl: scan.targetUrl, scanProfile },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    return scan;
  }

  async listScans(orgId: string, limit = 20, offset = 0): Promise<Scan[]> {
    const { rows } = await this.db.query<Scan>(
      `SELECT id, org_id AS "orgId", created_by AS "createdBy",
              target_url AS "targetUrl", target_host AS "targetHost",
              scan_profile AS "scanProfile", status, error_message AS "errorMessage",
              started_at AS "startedAt", completed_at AS "completedAt",
              created_at AS "createdAt"
       FROM scans WHERE org_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    );
    return rows;
  }

  async getScan(orgId: string, scanId: string): Promise<Scan> {
    const { rows } = await this.db.query<Scan>(
      `SELECT id, org_id AS "orgId", created_by AS "createdBy",
              target_url AS "targetUrl", target_host AS "targetHost",
              scan_profile AS "scanProfile", status, error_message AS "errorMessage",
              started_at AS "startedAt", completed_at AS "completedAt",
              created_at AS "createdAt"
       FROM scans WHERE id = $1 AND org_id = $2`,
      [scanId, orgId],
    );
    if (!rows[0]) throw new NotFoundException('Scan not found');
    return rows[0];
  }
}
