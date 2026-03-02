import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import * as dns from 'dns/promises';
import { DATABASE_POOL } from '../common/database.module';

export type VerificationMethod = 'dns_txt' | 'http_file' | 'html_meta';

export interface Domain {
  id: string;
  orgId: string;
  rootDomain: string;
  verificationState: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
  verificationToken: string;
  verifiedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class DomainsService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async addDomain(orgId: string, rootDomain: string): Promise<Domain> {
    const normalized = rootDomain.toLowerCase().replace(/^www\./, '');
    const { rows } = await this.db.query<Domain>(
      `INSERT INTO domains (org_id, root_domain)
       VALUES ($1, $2)
       ON CONFLICT (org_id, root_domain) DO UPDATE SET root_domain = EXCLUDED.root_domain
       RETURNING id, org_id AS "orgId", root_domain AS "rootDomain",
                 verification_state AS "verificationState",
                 verification_token AS "verificationToken",
                 verified_at AS "verifiedAt", created_at AS "createdAt"`,
      [orgId, normalized],
    );
    return rows[0];
  }

  async getDomains(orgId: string): Promise<Domain[]> {
    const { rows } = await this.db.query<Domain>(
      `SELECT id, org_id AS "orgId", root_domain AS "rootDomain",
              verification_state AS "verificationState",
              verification_token AS "verificationToken",
              verified_at AS "verifiedAt", created_at AS "createdAt"
       FROM domains WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId],
    );
    return rows;
  }

  async checkVerification(orgId: string, domainId: string): Promise<Domain> {
    const domain = await this.getDomainById(orgId, domainId);

    // Try all three methods
    const verified =
      (await this.checkDnsTxt(domain.rootDomain, domain.verificationToken)) ||
      (await this.checkHttpFile(domain.rootDomain, domain.verificationToken)) ||
      (await this.checkHtmlMeta(domain.rootDomain, domain.verificationToken));

    const newState = verified ? 'VERIFIED' : 'FAILED';
    const { rows } = await this.db.query<Domain>(
      `UPDATE domains
       SET verification_state = $1,
           verified_at = CASE WHEN $1 = 'VERIFIED' THEN NOW() ELSE NULL END,
           last_checked_at = NOW(),
           expires_at = CASE WHEN $1 = 'VERIFIED' THEN NOW() + INTERVAL '90 days' ELSE NULL END
       WHERE id = $2 AND org_id = $3
       RETURNING id, org_id AS "orgId", root_domain AS "rootDomain",
                 verification_state AS "verificationState",
                 verification_token AS "verificationToken",
                 verified_at AS "verifiedAt", created_at AS "createdAt"`,
      [newState, domainId, orgId],
    );
    return rows[0];
  }

  async assertDomainVerified(orgId: string, rootDomain: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT verification_state FROM domains
       WHERE org_id = $1 AND root_domain = $2`,
      [orgId, rootDomain.toLowerCase().replace(/^www\./, '')],
    );
    if (rows.length === 0 || rows[0].verification_state !== 'VERIFIED') {
      throw new ForbiddenException(
        'Domain not verified. Please verify domain ownership before scanning.',
      );
    }
  }

  private async getDomainById(orgId: string, domainId: string): Promise<Domain> {
    const { rows } = await this.db.query<Domain>(
      `SELECT id, org_id AS "orgId", root_domain AS "rootDomain",
              verification_state AS "verificationState",
              verification_token AS "verificationToken",
              verified_at AS "verifiedAt", created_at AS "createdAt"
       FROM domains WHERE id = $1 AND org_id = $2`,
      [domainId, orgId],
    );
    if (!rows[0]) throw new NotFoundException('Domain not found');
    return rows[0];
  }

  private async checkDnsTxt(domain: string, token: string): Promise<boolean> {
    try {
      const records = await dns.resolveTxt(domain);
      return records.flat().some((r) => r === `scanrix-verification=${token}`);
    } catch {
      return false;
    }
  }

  private async checkHttpFile(domain: string, token: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://${domain}/.well-known/scanrix-verification.txt`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return false;
      const text = await res.text();
      return text.trim() === token;
    } catch {
      return false;
    }
  }

  private async checkHtmlMeta(domain: string, token: string): Promise<boolean> {
    try {
      const res = await fetch(`https://${domain}/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const html = await res.text();
      return html.includes(`name="scanrix-verification" content="${token}"`);
    } catch {
      return false;
    }
  }
}
