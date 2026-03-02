import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';

@Injectable()
export class ReportsService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async getReport(orgId: string, scanId: string) {
    const { rows } = await this.db.query(
      `SELECT r.id, r.scan_id AS "scanId", r.html_key AS "htmlKey",
              r.json_key AS "jsonKey", r.summary, r.created_at AS "createdAt"
       FROM reports r
       JOIN scans s ON s.id = r.scan_id
       WHERE r.scan_id = $1 AND s.org_id = $2`,
      [scanId, orgId],
    );
    if (!rows[0]) throw new NotFoundException('Report not found');
    return rows[0];
  }
}
