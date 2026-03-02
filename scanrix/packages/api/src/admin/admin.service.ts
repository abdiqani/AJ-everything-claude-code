import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { AuditService } from '../common/audit.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {}

  async listAllScans(limit: number, offset: number, status?: string) {
    const params: unknown[] = [limit, offset];
    const where = status ? `WHERE s.status = $3` : '';
    if (status) params.push(status);

    const { rows } = await this.db.query(
      `SELECT s.id, s.target_url AS "targetUrl", s.scan_profile AS "scanProfile",
              s.status, s.created_at AS "createdAt",
              o.name AS "orgName", up.id AS "userId"
       FROM scans s
       JOIN orgs o ON o.id = s.org_id
       JOIN user_profiles up ON up.id = s.created_by
       ${where}
       ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      params,
    );
    return rows;
  }

  async listUsers(limit: number) {
    const { rows } = await this.db.query(
      `SELECT up.id, up.role,
              o.id AS "orgId", o.name AS "orgName", o.plan,
              o.scans_used AS "scansUsed", o.scans_limit AS "scansLimit",
              up.created_at AS "createdAt"
       FROM user_profiles up
       JOIN orgs o ON o.id = up.org_id
       ORDER BY up.created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }

  async getStats() {
    const { rows } = await this.db.query(`
      SELECT
        (SELECT COUNT(*) FROM scans)                                         AS total_scans,
        (SELECT COUNT(*) FROM scans WHERE status = 'RUNNING')                AS running_scans,
        (SELECT COUNT(*) FROM scans WHERE status = 'FAILED')                 AS failed_scans,
        (SELECT COUNT(*) FROM orgs)                                          AS total_orgs,
        (SELECT COUNT(*) FROM domains WHERE verification_state = 'VERIFIED') AS verified_domains,
        (SELECT COUNT(*) FROM findings)                                       AS total_findings
    `);
    return rows[0];
  }

  async blockUser(userId: string, reason?: string) {
    // Cancel any QUEUED scans for this user
    const { rows } = await this.db.query(
      `UPDATE scans SET status = 'CANCELLED'
       WHERE created_by = $1 AND status IN ('QUEUED','RUNNING')
       RETURNING id`,
      [userId],
    );

    await this.audit.log({
      userId,
      action: 'user.blocked',
      metadata: { reason, cancelledScans: rows.length },
    });

    return { blocked: true, cancelledScans: rows.length };
  }

  async unblockUser(userId: string) {
    await this.audit.log({ userId, action: 'user.blocked', metadata: { unblocked: true } });
    return { unblocked: true };
  }
}
