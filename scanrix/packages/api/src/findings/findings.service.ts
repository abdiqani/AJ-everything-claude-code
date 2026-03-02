import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';

export interface Finding {
  id: string;
  scanId: string;
  tool: string;
  title: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'med' | 'high';
  category?: string;
  targetUrl: string;
  evidence?: unknown;
  request?: string;   // plan-gated
  response?: string;  // plan-gated
  cwe?: string;
  cve?: string;
  recommendation?: string;
  references?: unknown;
  createdAt: Date;
}

@Injectable()
export class FindingsService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async findingsByScan(
    orgId: string,
    scanId: string,
    plan: string,
  ): Promise<Finding[]> {
    const isPaid = plan !== 'free';

    const { rows } = await this.db.query(
      `SELECT f.id, f.scan_id AS "scanId", f.tool, f.title,
              f.severity, f.confidence, f.category, f.target_url AS "targetUrl",
              f.evidence, f.cwe, f.cve, f.recommendation, f.references,
              ${isPaid ? 'f.request, f.response,' : "NULL AS request, NULL AS response,"}
              f.created_at AS "createdAt"
       FROM findings f
       JOIN scans s ON s.id = f.scan_id
       WHERE f.scan_id = $1 AND s.org_id = $2
       ORDER BY
         CASE f.severity
           WHEN 'critical' THEN 1 WHEN 'high' THEN 2
           WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5
         END, f.created_at`,
      [scanId, orgId],
    );

    // Mask paid-only fields for free plan
    if (!isPaid) {
      return rows.map((r: Finding) => ({
        ...r,
        targetUrl: this.maskPath(r.targetUrl),
        evidence: null,
        recommendation: null,
      }));
    }

    return rows;
  }

  private maskPath(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}/****`;
    } catch {
      return '****';
    }
  }
}
