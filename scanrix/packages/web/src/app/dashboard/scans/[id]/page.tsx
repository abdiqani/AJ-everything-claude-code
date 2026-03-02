'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { api } from '../../../../lib/api';
import Link from 'next/link';

const SEV_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb', info: '#6b7280',
};

interface Finding {
  id: string; tool: string; title: string; severity: string;
  category?: string; targetUrl: string; evidence?: any;
  cve?: string; cwe?: string; recommendation?: string;
}

interface Scan {
  id: string; targetUrl: string; scanProfile: string; status: string;
  startedAt?: string; completedAt?: string; createdAt: string;
}

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [report, setReport] = useState<any>(null);
  const [token, setToken] = useState('');
  const [plan, setPlan] = useState('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token ?? '';
      setToken(t);
      if (!t) return;

      const [s, f, r] = await Promise.allSettled([
        api.scans.get(t, id),
        api.scans.findings(t, id),
        api.scans.report(t, id),
      ]);

      if (s.status === 'fulfilled') setScan(s.value as Scan);
      if (f.status === 'fulfilled') setFindings(f.value as Finding[]);
      if (r.status === 'fulfilled') setReport(r.value);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (!scan) return <p>Scan not found.</p>;

  const summary = report?.summary;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard/scans" style={{ color: '#2563eb', textDecoration: 'none' }}>← Back to Scans</Link>
      </div>

      <div style={card}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 1rem' }}>Scan Detail</h1>
        <div style={grid}>
          <InfoRow label="Target" value={scan.targetUrl} mono />
          <InfoRow label="Profile" value={scan.scanProfile} />
          <InfoRow label="Status" value={scan.status} />
          <InfoRow label="Created" value={new Date(scan.createdAt).toLocaleString()} />
          {scan.completedAt && <InfoRow label="Completed" value={new Date(scan.completedAt).toLocaleString()} />}
        </div>
      </div>

      {summary && (
        <div style={{ ...card, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Summary</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {Object.entries(summary.by_severity ?? {}).map(([sev, count]) => (
              <div key={sev} style={{ background: SEV_COLOR[sev] ?? '#6b7280', color: '#fff', padding: '0.4rem 0.9rem', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem' }}>
                {sev.toUpperCase()}: {count as number}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...card, marginTop: '1.5rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
          Findings ({findings.length})
          {plan === 'free' && (
            <span style={{ marginLeft: '1rem', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.6rem', borderRadius: 4 }}>
              Upgrade to see full details
            </span>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Severity', 'Tool', 'Title', 'Category', 'CVE/CWE', 'Target URL'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.625rem 1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {findings.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                {scan.status === 'RUNNING' || scan.status === 'QUEUED' ? 'Scan in progress…' : 'No findings.'}
              </td></tr>
            )}
            {findings.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>
                  <span style={{ color: SEV_COLOR[f.severity] ?? '#111', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>{f.severity}</span>
                </td>
                <td style={tdStyle}>{f.tool}</td>
                <td style={tdStyle}>{f.title}</td>
                <td style={tdStyle}>{f.category ?? '—'}</td>
                <td style={tdStyle}>
                  {f.cve ? <a href={`https://nvd.nist.gov/vuln/detail/${f.cve}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{f.cve}</a>
                    : f.cwe ?? '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{f.targetUrl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</dt>
      <dd style={{ margin: '0.25rem 0 0', fontFamily: mono ? 'monospace' : undefined }}>{value}</dd>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.5rem' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' };
const tdStyle: React.CSSProperties = { padding: '0.625rem 1rem' };
