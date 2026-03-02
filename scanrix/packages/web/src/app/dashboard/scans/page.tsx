'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../lib/api';
import Link from 'next/link';

const SEV_COLOR: Record<string, string> = {
  QUEUED: '#6b7280', RUNNING: '#2563eb', COMPLETED: '#16a34a', FAILED: '#dc2626', CANCELLED: '#9ca3af',
};
const PROFILES = ['QUICK', 'STANDARD', 'DEEP'];

interface Scan { id: string; targetUrl: string; scanProfile: string; status: string; createdAt: string; }

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [token, setToken] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [profile, setProfile] = useState('QUICK');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token ?? '';
      setToken(t);
      if (t) api.scans.list(t).then((r: any) => setScans(r));
    });
  }, []);

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const scan: any = await api.scans.create(token, targetUrl, profile);
      setScans((prev) => [scan, ...prev]);
      setTargetUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Scans</h1>

      {/* New Scan Form */}
      <div style={card}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New Scan</h2>
        {error && <p style={errStyle}>{error}</p>}
        <form onSubmit={submitScan} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            style={{ flex: 1, minWidth: 260, ...inputStyle }}
            type="url" placeholder="https://example.com"
            value={targetUrl} onChange={e => setTargetUrl(e.target.value)} required
          />
          <select style={inputStyle} value={profile} onChange={e => setProfile(e.target.value)}>
            {PROFILES.map(p => <option key={p}>{p}</option>)}
          </select>
          <button style={btnStyle} type="submit" disabled={submitting}>
            {submitting ? 'Queuing…' : 'Start Scan'}
          </button>
        </form>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Free plan: QUICK scans only. <a href="#" style={{ color: '#2563eb' }}>Upgrade for STANDARD/DEEP.</a>
        </p>
      </div>

      {/* Scans Table */}
      <div style={{ ...card, marginTop: '1.5rem', padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Target URL', 'Profile', 'Status', 'Created', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No scans yet. Submit your first scan above.</td></tr>
            )}
            {scans.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.targetUrl}</span></td>
                <td style={tdStyle}>{s.scanProfile}</td>
                <td style={tdStyle}>
                  <span style={{ color: SEV_COLOR[s.status] ?? '#111', fontWeight: 600 }}>{s.status}</span>
                </td>
                <td style={tdStyle}>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={tdStyle}>
                  <Link href={`/dashboard/scans/${s.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.5rem' };
const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem' };
const btnStyle: React.CSSProperties = { padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1rem' };
const errStyle: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.875rem', marginBottom: '0.75rem' };
