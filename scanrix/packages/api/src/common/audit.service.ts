import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.module';

export type AuditAction =
  | 'scan.created'
  | 'scan.completed'
  | 'scan.failed'
  | 'domain.added'
  | 'domain.verified'
  | 'domain.failed'
  | 'user.blocked'
  | 'billing.checkout'
  | 'billing.subscribed'
  | 'billing.cancelled';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async log(opts: {
    orgId?: string;
    userId?: string;
    action: AuditAction;
    target?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // Best-effort — never throw
    try {
      await this.db.query(
        `INSERT INTO audit_log (org_id, user_id, action, target, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          opts.orgId ?? null,
          opts.userId ?? null,
          opts.action,
          opts.target ?? null,
          opts.metadata ? JSON.stringify(opts.metadata) : null,
        ],
      );
    } catch (err) {
      console.error('[audit] Failed to write audit log:', err);
    }
  }
}
