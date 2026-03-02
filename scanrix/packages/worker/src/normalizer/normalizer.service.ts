import { Pool } from 'pg';
import { HttpxResult } from '../scanners/httpx';
import { NucleiResult } from '../scanners/nuclei';
import { ZapResult } from '../scanners/zap';
import { NiktoResult } from '../scanners/nikto';
import { TestsslResult } from '../scanners/testssl';

type Tool = 'httpx' | 'nuclei' | 'zap' | 'nikto' | 'testssl';

interface NormalizedFinding {
  tool: Tool;
  title: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'med' | 'high';
  category?: string;
  targetUrl: string;
  evidence?: unknown;
  request?: string;
  response?: string;
  cwe?: string;
  cve?: string;
  recommendation?: string;
  references?: string[];
  raw: unknown;
}

export class NormalizerService {
  constructor(private readonly db: Pool) {}

  async ingest(
    scanId: string,
    tool: Tool,
    result: HttpxResult | NucleiResult | ZapResult | NiktoResult | TestsslResult,
  ): Promise<void> {
    let findings: NormalizedFinding[] = [];

    switch (tool) {
      case 'httpx':   findings = this.normalizeHttpx(result as HttpxResult); break;
      case 'nuclei':  findings = this.normalizeNuclei(result as NucleiResult); break;
      case 'zap':     findings = this.normalizeZap(result as ZapResult); break;
      case 'nikto':   findings = this.normalizeNikto(result as NiktoResult); break;
      case 'testssl': findings = this.normalizeTestssl(result as TestsslResult); break;
    }

    for (const f of findings) {
      await this.upsertFinding(scanId, f);
    }
  }

  private async upsertFinding(scanId: string, f: NormalizedFinding): Promise<void> {
    await this.db.query(
      `INSERT INTO findings
         (scan_id, tool, title, severity, confidence, category, target_url,
          evidence, request, response, cwe, cve, recommendation, references, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (scan_id, tool, category, target_url, COALESCE(cve,''), title)
       DO UPDATE SET
         confidence = EXCLUDED.confidence,
         evidence   = EXCLUDED.evidence`,
      [
        scanId, f.tool, f.title, f.severity, f.confidence,
        f.category ?? null, f.targetUrl,
        f.evidence ? JSON.stringify(f.evidence) : null,
        f.request ?? null, f.response ?? null,
        f.cwe ?? null, f.cve ?? null,
        f.recommendation ?? null,
        f.references ? JSON.stringify(f.references) : null,
        JSON.stringify(f.raw),
      ],
    );
  }

  // ── HTTPX ──────────────────────────────────────────────────────────────
  private normalizeHttpx(result: HttpxResult): NormalizedFinding[] {
    return result.lines.map((line: any) => ({
      tool: 'httpx' as const,
      title: `HTTP ${line['status-code']} – ${line.url}`,
      severity: 'info',
      confidence: 'high',
      category: 'recon',
      targetUrl: line.url ?? '',
      evidence: { title: line.title, tech: line.technologies, status: line['status-code'] },
      raw: line,
    }));
  }

  // ── NUCLEI ─────────────────────────────────────────────────────────────
  private normalizeNuclei(result: NucleiResult): NormalizedFinding[] {
    return result.lines.map((line: any) => {
      const info = line.info ?? {};
      const sev = this.mapSeverity(info.severity);
      const cveId = info.classification?.cve_id?.[0];
      const cweId = info.classification?.cwe_id?.[0];
      return {
        tool: 'nuclei' as const,
        title: info.name ?? line['template-id'] ?? 'Nuclei Finding',
        severity: sev,
        confidence: 'high',
        category: info.tags?.[0] ?? 'misc',
        targetUrl: line.matched ?? line.host ?? '',
        evidence: { matcher: line['matched-at'], curl: line['curl-command'] },
        cve: cveId,
        cwe: cweId,
        recommendation: info.description,
        references: info.reference,
        raw: line,
      };
    });
  }

  // ── ZAP ────────────────────────────────────────────────────────────────
  private normalizeZap(result: ZapResult): NormalizedFinding[] {
    return result.alerts.map((alert: any) => {
      const riskMap: Record<string, NormalizedFinding['severity']> = {
        '0': 'info', '1': 'low', '2': 'medium', '3': 'high',
      };
      const confMap: Record<string, NormalizedFinding['confidence']> = {
        '0': 'low', '1': 'low', '2': 'med', '3': 'high',
      };
      return {
        tool: 'zap' as const,
        title: alert.name ?? alert.alert ?? 'ZAP Alert',
        severity: riskMap[String(alert.riskcode)] ?? 'info',
        confidence: confMap[String(alert.confidence)] ?? 'med',
        category: this.zapCategory(alert.pluginid),
        targetUrl: alert.uri ?? '',
        evidence: { attack: alert.attack, evidence: alert.evidence, param: alert.param },
        request: alert.requestheader,
        response: alert.responseheader,
        cwe: alert.cweid ? `CWE-${alert.cweid}` : undefined,
        recommendation: alert.solution,
        references: alert.reference ? [alert.reference] : undefined,
        raw: alert,
      };
    });
  }

  // ── NIKTO ──────────────────────────────────────────────────────────────
  private normalizeNikto(result: NiktoResult): NormalizedFinding[] {
    return result.vulnerabilities.map((v: any) => ({
      tool: 'nikto' as const,
      title: v.msg ?? v.id ?? 'Nikto Finding',
      severity: 'low',
      confidence: 'med',
      category: 'server-config',
      targetUrl: v.url ?? '',
      evidence: { method: v.method, osvdbid: v.OSVDB },
      raw: v,
    }));
  }

  // ── TESTSSL ────────────────────────────────────────────────────────────
  private normalizeTestssl(result: TestsslResult): NormalizedFinding[] {
    const SEVERITY_MAP: Record<string, NormalizedFinding['severity']> = {
      CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium',
      LOW: 'low', INFO: 'info', OK: 'info', WARN: 'low',
    };

    return result.findings
      .filter((f: any) => f.severity && f.severity !== 'OK')
      .map((f: any) => ({
        tool: 'testssl' as const,
        title: `TLS: ${f.id ?? f.finding}`,
        severity: SEVERITY_MAP[f.severity] ?? 'info',
        confidence: 'high',
        category: 'tls',
        targetUrl: f.ip ?? '',
        evidence: { finding: f.finding, cve: f.cve, cwe: f.cwe },
        cve: f.cve,
        cwe: f.cwe,
        raw: f,
      }));
  }

  private mapSeverity(s?: string): NormalizedFinding['severity'] {
    const map: Record<string, NormalizedFinding['severity']> = {
      critical: 'critical', high: 'high', medium: 'medium',
      low: 'low', info: 'info', informational: 'info',
    };
    return map[s?.toLowerCase() ?? ''] ?? 'info';
  }

  private zapCategory(pluginId?: string): string {
    const map: Record<string, string> = {
      '10038': 'csp', '10020': 'headers', '10021': 'headers',
      '40012': 'xss', '40014': 'xss', '40018': 'sqli',
      '90021': 'path-traversal', '10094': 'log4shell',
    };
    return map[pluginId ?? ''] ?? 'web';
  }
}
