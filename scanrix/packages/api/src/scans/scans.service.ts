import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { STORAGE_ADAPTER } from '../storage/storage.module';
import { StorageAdapter } from '../storage/storage.adapter';
import { DomainsService } from '../domains/domains.service';
import { PlansService } from '../plans/plans.service';
import { AuditService } from '../common/audit.service';
import { AnalyticsService } from '../common/analytics.service';
import { SsrfGuard } from '../common/ssrf-guard';
import { Scan, ScanProfile, SCAN_QUEUE } from './scans.types';

@Injectable()
export class ScansService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    @InjectQueue(SCAN_QUEUE) private readonly queue: Queue,
    private readonly domains: DomainsService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async createScan(
    orgId: string,
    userId: string,
    plan: string,
    targetUrl: string,
    scanProfile: ScanProfile,
  ): Promise<Scan> {
    // 1. SSRF protection + URL normalization (before transaction — no DB needed)
    const normalizedUrl = await SsrfGuard.validate(targetUrl);
    const targetHost = normalizedUrl.hostname;

    // 2. Domain ownership verification (read-only, safe outside transaction)
    await this.domains.assertDomainVerified(orgId, targetHost);

    // 3–5. Quota check + scan insert + counter increment in a single serializable
    //      transaction, protected by a per-org advisory lock to prevent TOCTOU races.
    const client = await this.db.connect();
    let scan: Scan;
    try {
      await client.query('BEGIN');
      // Advisory lock keyed on org hash — serializes concurrent requests for the same org
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [orgId]);

      // Re-check quota inside the lock
      await this.plans.assertScanAllowed(orgId, plan, scanProfile);

      const { rows } = await client.query<Scan>(
        `INSERT INTO scans (org_id, created_by, target_url, target_host, scan_profile)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id AS "orgId", created_by AS "createdBy",
                   target_url AS "targetUrl", target_host AS "targetHost",
                   scan_profile AS "scanProfile", status,
                   created_at AS "createdAt"`,
        [orgId, userId, normalizedUrl.toString(), targetHost, scanProfile],
      );
      scan = rows[0];

      await client.query(
        `UPDATE orgs SET scans_used = scans_used + 1 WHERE id = $1`,
        [orgId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 6. Audit log + analytics (fire-and-forget, outside transaction)
    try {
      await this.audit.log({
        orgId,
        userId,
        action: 'scan.created',
        target: normalizedUrl.toString(),
        metadata: { scanId: scan.id, scanProfile },
      });
    } catch { /* best-effort */ }
    try {
      this.analytics.track(userId, 'scan.created', { scanId: scan.id, scanProfile, targetHost });
    } catch { /* best-effort */ }

    // 7. Enqueue job
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

  async listArtifacts(
    orgId: string,
    scanId: string,
  ): Promise<Array<{ tool: string; artifactKey: string; contentType: string; sizeBytes: number; createdAt: Date }>> {
    const { rows } = await this.db.query(
      `SELECT sa.tool, sa.artifact_key AS "artifactKey",
              sa.content_type AS "contentType", sa.size_bytes AS "sizeBytes",
              sa.created_at AS "createdAt"
       FROM scan_artifacts sa
       JOIN scans s ON s.id = sa.scan_id
       WHERE s.org_id = $1 AND sa.scan_id = $2
       ORDER BY sa.created_at ASC`,
      [orgId, scanId],
    );
    return rows;
  }

  async getArtifactDownloadUrl(
    orgId: string,
    scanId: string,
    artifactKey: string,
    plan: string,
  ): Promise<{ url: string; expiresIn: number }> {
    if (plan === 'free') {
      throw new ForbiddenException('Artifact downloads require a paid plan. Upgrade at /dashboard/upgrade');
    }

    const { rows } = await this.db.query(
      `SELECT sa.artifact_key
       FROM scan_artifacts sa
       JOIN scans s ON s.id = sa.scan_id
       WHERE s.org_id = $1 AND sa.scan_id = $2 AND sa.artifact_key = $3`,
      [orgId, scanId, artifactKey],
    );
    if (!rows[0]) throw new NotFoundException('Artifact not found');

    const url = await this.storage.getSignedUrl(artifactKey, 3600);
    return { url, expiresIn: 3600 };
  }
}
