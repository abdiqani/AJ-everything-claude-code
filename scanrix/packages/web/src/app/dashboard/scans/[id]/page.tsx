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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const t = data.session?.access_token ?? '';
      setToken(t);
      if (!t) return;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, orgs(plan)')
        .single();
      if (profile) setPlan((profile as any).orgs?.plan ?? 'free');

      const [s, f, r, a] = await Promise.allSettled([
        api.scans.get(t, id),
        api.scans.findings(t, id),
        api.scans.report(t, id),
        api.scans.artifacts(t, id),
      ]);

      if (s.status === 'fulfilled') setScan(s.value as Scan);
      if (f.status === 'fulfilled') setFindings(f.value as Finding[]);
      if (r.status === 'fulfilled') setReport(r.value);
      if (a.status === 'fulfilled') setArtifacts(a.value as any[]);
      setLoading(false);
    });
  }, [id]);

  async function downloadReport(format: 'html' | 'json') {
    setDownloading(format);
    try {
      const res = await api.scans.reportDownload(token, id, format) as { url: string };
      window.open(res.url, '_blank');
    } finally {
      setDownloading(null);
    }
  }

  async function downloadArtifact(key: string) {
    setDownloading(key);
    try {
      const res = await api.scans.artifactDownload(token, id, key) as { url: string };
      window.open(res.url, '_blank');
    } finally {
      setDownloading(null);
    }
  }

  function toggleRow(findingId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(findingId) ? next.delete(findingId) : next.add(findingId);
      return next;
    });
  }

  const isPaid = plan !== 'free';

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

      {scan.status === 'COMPLETED' && (
        <div style={{ ...card, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Downloads</h2>
          {isPaid ? (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button onClick={() => downloadReport('html')} disabled={downloading === 'html'} style={dlBtn}>
                {downloading === 'html' ? 'Downloading…' : 'Download HTML Report'}
              </button>
              <button onClick={() => downloadReport('json')} disabled={downloading === 'json'} style={dlBtn}>
                {downloading === 'json' ? 'Downloading…' : 'Download JSON Report'}
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
              <Link href="/dashboard/upgrade" style={{ color: '#2563eb' }}>Upgrade</Link> to download reports.
            </p>
          )}
        </div>
      )}

      {scan.status === 'COMPLETED' && artifacts.length > 0 && (
        <div style={{ ...card, marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Artifacts</h2>
          {isPaid ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {artifacts.map((a: any) => (
                <li key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <span style={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{a.key}</span>
                  <button onClick={() => downloadArtifact(a.key)} disabled={downloading === a.key} style={dlBtn}>
                    {downloading === a.key ? '…' : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
              <Link href="/dashboard/upgrade" style={{ color: '#2563eb' }}>Upgrade</Link> to access raw artifacts.
            </p>
          )}
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
              {['', 'Severity', 'Tool', 'Title', 'Category', 'CVE/CWE', 'Target URL'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.625rem 1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {findings.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                {scan.status === 'RUNNING' || scan.status === 'QUEUED' ? 'Scan in progress…' : 'No findings.'}
              </td></tr>
            )}
            {findings.map(f => (
              <FindingRow key={f.id} finding={f} isPaid={isPaid} expanded={expandedRows.has(f.id)} onToggle={() => toggleRow(f.id)} />
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

function FindingRow({ finding: f, isPaid, expanded, onToggle }: {
  finding: Finding; isPaid: boolean; expanded: boolean; onToggle: () => void;
}) {
  return (
    <>
      <tr style={{ borderBottom: expanded ? 'none' : '1px solid #f3f4f6' }}>
        <td style={{ ...tdStyle, width: '2rem' }}>
          {isPaid ? (
            <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '0.875rem', padding: 0 }}>
              {expanded ? '▲' : '▼'}
            </button>
          ) : (
            <Link href="/dashboard/upgrade" style={{ fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap' }}>Upgrade →</Link>
          )}
        </td>
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
      {expanded && isPaid && (
        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
          <td colSpan={7} style={{ padding: '1rem 1.5rem', background: '#f9fafb' }}>
            {f.evidence && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem', color: '#374151' }}>Evidence</div>
                <pre style={{ margin: 0, padding: '0.75rem', background: '#f3f4f6', borderRadius: 6, fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(f.evidence, null, 2)}
                </pre>
              </div>
            )}
            {f.recommendation && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem', color: '#374151' }}>Recommendation</div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>{f.recommendation}</p>
              </div>
            )}
            {(f.evidence?.request || f.evidence?.response) && (
              <div>
                {f.evidence?.request && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem', color: '#374151' }}>Request</div>
                    <pre style={{ margin: 0, padding: '0.75rem', background: '#f3f4f6', borderRadius: 6, fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{f.evidence.request}</pre>
                  </div>
                )}
                {f.evidence?.response && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem', color: '#374151' }}>Response</div>
                    <pre style={{ margin: 0, padding: '0.75rem', background: '#f3f4f6', borderRadius: 6, fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{f.evidence.response}</pre>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.5rem' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' };
const tdStyle: React.CSSProperties = { padding: '0.625rem 1rem' };
const dlBtn: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 };
