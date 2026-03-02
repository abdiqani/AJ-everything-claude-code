import { Pool } from 'pg';
import { StorageAdapter } from '../storage/storage.adapter';

interface FindingSummary {
  total: number;
  by_severity: Record<string, number>;
  by_tool: Record<string, number>;
}

export class ReportGenerator {
  constructor(
    private readonly db: Pool,
    private readonly storage: StorageAdapter,
  ) {}

  async generate(scanId: string, storagePrefix: string): Promise<void> {
    const { rows: findings } = await this.db.query(
      `SELECT tool, title, severity, confidence, category, target_url, evidence,
              cwe, cve, recommendation, created_at
       FROM findings WHERE scan_id = $1
       ORDER BY CASE severity
         WHEN 'critical' THEN 1 WHEN 'high' THEN 2
         WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5
       END`,
      [scanId],
    );

    const summary: FindingSummary = {
      total: findings.length,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      by_tool: {},
    };

    for (const f of findings) {
      summary.by_severity[f.severity] = (summary.by_severity[f.severity] ?? 0) + 1;
      summary.by_tool[f.tool] = (summary.by_tool[f.tool] ?? 0) + 1;
    }

    const jsonReport = JSON.stringify({ scanId, summary, findings }, null, 2);
    const htmlReport = this.renderHtml(scanId, summary, findings);

    const jsonKey = `${storagePrefix}/report.json`;
    const htmlKey = `${storagePrefix}/report.html`;

    await this.storage.putObject(jsonKey, jsonReport, 'application/json');
    await this.storage.putObject(htmlKey, htmlReport, 'text/html');

    await this.db.query(
      `INSERT INTO reports (scan_id, html_key, json_key, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scan_id) DO UPDATE SET
         html_key = EXCLUDED.html_key,
         json_key = EXCLUDED.json_key,
         summary  = EXCLUDED.summary`,
      [scanId, htmlKey, jsonKey, JSON.stringify(summary)],
    );
  }

  private renderHtml(scanId: string, summary: FindingSummary, findings: any[]): string {
    const sevColor: Record<string, string> = {
      critical: '#dc2626', high: '#ea580c', medium: '#d97706',
      low: '#2563eb', info: '#6b7280',
    };

    const badge = (sev: string, count: number) =>
      `<span style="background:${sevColor[sev]};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:4px">${sev.toUpperCase()}: ${count}</span>`;

    const rows = findings
      .map(
        (f) => `
      <tr>
        <td><span style="color:${sevColor[f.severity]};font-weight:bold">${f.severity}</span></td>
        <td>${escHtml(f.tool)}</td>
        <td>${escHtml(f.title)}</td>
        <td style="word-break:break-all">${escHtml(f.target_url)}</td>
        <td>${escHtml(f.category ?? '')}</td>
        <td>${f.cve ? `<a href="https://nvd.nist.gov/vuln/detail/${f.cve}">${escHtml(f.cve)}</a>` : ''}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Scanrix Report – ${escHtml(scanId)}</title>
<style>
  body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; margin: 2rem; color: #1f2937; }
  h1 { color: #111827; }
  .summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 12px; border-bottom: 2px solid #d1d5db; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:hover td { background: #f9fafb; }
</style>
</head>
<body>
<h1>Scanrix Vulnerability Report</h1>
<p><strong>Scan ID:</strong> ${escHtml(scanId)}</p>
<div class="summary">
  <h2 style="margin-top:0">Summary</h2>
  <p>Total findings: <strong>${summary.total}</strong></p>
  <div>
    ${Object.entries(summary.by_severity).map(([s, c]) => badge(s, c)).join('')}
  </div>
</div>
<h2>Findings</h2>
<table>
  <thead>
    <tr>
      <th>Severity</th><th>Tool</th><th>Title</th>
      <th>Target URL</th><th>Category</th><th>CVE</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;
  }
}

function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
