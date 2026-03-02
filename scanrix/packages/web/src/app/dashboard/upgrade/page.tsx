'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../lib/api';

interface Plan {
  key: 'starter' | 'pro' | 'enterprise';
  name: string;
  price: string;
  scans: string;
  profiles: string[];
  features: string[];
}

const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: '$29/mo',
    scans: '20 scans/month',
    profiles: ['QUICK', 'STANDARD'],
    features: ['Full finding details', 'Evidence & requests', '2 concurrent scans', 'Email reports'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$99/mo',
    scans: '100 scans/month',
    profiles: ['QUICK', 'STANDARD', 'DEEP'],
    features: ['Everything in Starter', 'DEEP scans (nikto + testssl)', '5 concurrent scans', 'Artifact downloads', 'Priority support'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    scans: 'Unlimited scans',
    profiles: ['QUICK', 'STANDARD', 'DEEP'],
    features: ['Everything in Pro', 'Custom concurrency', 'Dedicated support', 'SSO', 'SLA'],
  },
];

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function startCheckout(plan: 'starter' | 'pro' | 'enterprise') {
    if (plan === 'enterprise') {
      window.open('mailto:sales@scanrix.io?subject=Enterprise%20inquiry', '_blank');
      return;
    }
    setError('');
    setLoading(plan);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError('Please sign in first'); return; }

      const { url } = await api.billing.checkout(token, plan) as { url: string };
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', textAlign: 'center', marginBottom: '0.5rem' }}>
        Upgrade Scanrix
      </h1>
      <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '2.5rem' }}>
        Unlock full finding details, deeper scans, and higher limits.
      </p>

      {error && <p style={errStyle}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {PLANS.map((p) => (
          <div key={p.key} style={{
            ...card,
            border: p.key === 'pro' ? '2px solid #2563eb' : '1px solid #e5e7eb',
          }}>
            {p.key === 'pro' && (
              <div style={{ background: '#2563eb', color: '#fff', textAlign: 'center', padding: '0.25rem', borderRadius: '8px 8px 0 0', fontSize: '0.75rem', fontWeight: 700, margin: '-1.5rem -1.5rem 1rem' }}>
                MOST POPULAR
              </div>
            )}
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem' }}>{p.name}</h2>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', margin: '0.5rem 0' }}>{p.price}</div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>{p.scans}</div>

            <ul style={{ margin: '0 0 1.5rem', padding: '0 0 0 1.25rem', listStyle: 'disc', color: '#374151', fontSize: '0.875rem', lineHeight: 1.7 }}>
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.5rem' }}>SCAN PROFILES</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {p.profiles.map((pr) => (
                  <span key={pr} style={{ padding: '0.2rem 0.6rem', background: '#eff6ff', color: '#2563eb', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>{pr}</span>
                ))}
              </div>
            </div>

            <button
              onClick={() => startCheckout(p.key)}
              disabled={loading === p.key}
              style={{
                ...btnStyle,
                background: p.key === 'pro' ? '#2563eb' : '#111827',
                width: '100%',
              }}
            >
              {loading === p.key ? 'Redirecting…' : p.key === 'enterprise' ? 'Contact Sales' : `Upgrade to ${p.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '1.5rem' };
const btnStyle: React.CSSProperties = { padding: '0.625rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' };
const errStyle: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.5rem', textAlign: 'center' };
