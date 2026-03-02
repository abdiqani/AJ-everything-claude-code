'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../lib/api';
import Link from 'next/link';

const STATUS_COLOR: Record<string, string> = {
  QUEUED: '#6b7280', RUNNING: '#2563eb', COMPLETED: '#16a34a',
  FAILED: '#dc2626', CANCELLED: '#9ca3af',
};
const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const PROFILES = ['QUICK', 'STANDARD', 'DEEP'];

interface Scan {
  id: string; targetUrl: string; scanProfile: string;
  status: string; createdAt: string;
}

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [token, setToken] = useState('');
  const [plan, setPlan] = useState('free');
  const [targetUrl, setTargetUrl] = useState('');
  const [profile, setProfile] = useState('QUICK');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasActiveScans = scans.some((s) => ACTIVE_STATUSES.has(s.status));

  async function fetchScans(t: string) {
    try {
      const data = await api.scans.list(t) as Scan[];
      setScans(data);
    } catch { /* silent */ }
  }

  // Auto-poll while any scan is RUNNING/QUEUED
  useEffect(() => {
    if (!token) return;
    if (hasActiveScans) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => fetchScans(token), 5000);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [hasActiveScans, token]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token ?? '';
      setToken(t);
      if (!t) return;
      fetchScans(t);
      // Fetch plan from org
      supabase.from('user_profiles').select('orgs(plan)')
        .eq('id', data.session?.user.id ?? '').single()
        .then(({ data: p }) => { if (p) setPlan((p as any).orgs?.plan ?? 'free'); });
    });
  }, []);

  async function submitScan(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const scan = await api.scans.create(token, targetUrl, profile) as Scan;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Scans</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ background: plan === 'free' ? '#fef3c7' : '#dcfce7', color: plan === 'free' ? '#92400e' : '#166534', padding: '0.25rem 0.75rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
            {plan.toUpperCase()} PLAN
          </span>
          {plan === 'free' && (
            <Link href="/dashboard/upgrade" style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Upgrade →</Link>
          )}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New Scan</h2>
        {error && <p style={errStyle}>{error}</p>}
        <form onSubmit={submitScan} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input style={{ flex: 1, minWidth: 260, ...inputStyle }} type="url"
            placeholder="https://example.com" value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)} required />
          <select style={inputStyle} value={profile} onChange={e => setProfile(e.target.value)}>
            {PROFILES.map(p => (
              <option key={p} value={p} disabled={p !== 'QUICK' && plan === 'free'}>
                {p}{p !== 'QUICK' && plan === 'free' ? ' (upgrade required)' : ''}
              </option>
            ))}
          </select>
          <button style={btnStyle} type="submit" disabled={submitting}>
            {submitting ? 'Queuing…' : 'Start Scan'}
          </button>
        </form>
        {plan === 'free' && (
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Free plan: 1 QUICK scan/month.{' '}
            <Link href="/dashboard/upgrade" style={{ color: '#2563eb' }}>Upgrade</Link> for STANDARD/DEEP.
          </p>
        )}
      </div>

      {hasActiveScans && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.6rem 1rem', marginTop: '1rem', fontSize: '0.875rem', color: '#1d4ed8' }}>
          Scan in progress — auto-refreshing every 5s…
        </div>
      )}

      <div style={{ ...card, marginTop: '1rem', padding: 0, overflow: 'hidden' }}>
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
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                No scans yet. <Link href="/dashboard/domains" style={{ color: '#2563eb' }}>Add a domain</Link> first, then start your first scan.
              </td></tr>
            )}
            {scans.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.targetUrl}</span></td>
                <td style={tdStyle}>{s.scanProfile}</td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLOR[s.status] ?? '#111', fontWeight: 600 }}>
                    {s.status}{ACTIVE_STATUSES.has(s.status) ? ' ⟳' : ''}
                  </span>
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
