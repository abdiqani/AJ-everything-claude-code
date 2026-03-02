import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database.module';
import { STORAGE_ADAPTER } from '../storage/storage.module';
import { StorageAdapter } from '../storage/storage.adapter';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

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

  async getDownloadUrl(
    orgId: string,
    scanId: string,
    format: 'html' | 'json',
    plan: string,
  ): Promise<{ url: string; format: 'html' | 'json'; expiresIn: number }> {
    if (plan === 'free') {
      throw new ForbiddenException('Report downloads require a paid plan. Upgrade at /dashboard/upgrade');
    }
    const { rows } = await this.db.query(
      `SELECT r.html_key AS "htmlKey", r.json_key AS "jsonKey"
       FROM reports r
       JOIN scans s ON s.id = r.scan_id
       WHERE r.scan_id = $1 AND s.org_id = $2`,
      [scanId, orgId],
    );
    if (!rows[0]) throw new NotFoundException('Report not found');

    const key: string = format === 'html' ? rows[0].htmlKey : rows[0].jsonKey;
    if (!key) throw new NotFoundException(`Report ${format} file not available`);

    const url = await this.storage.getSignedUrl(key, 3600);
    return { url, format, expiresIn: 3600 };
  }
}
