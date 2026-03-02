'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { api } from '../../../lib/api';

const STATE_COLOR: Record<string, string> = {
  VERIFIED: '#16a34a', UNVERIFIED: '#6b7280', PENDING: '#d97706', FAILED: '#dc2626', EXPIRED: '#ea580c',
};

interface Domain {
  id: string;
  rootDomain: string;
  verificationState: string;
  verificationToken: string;
  verifiedAt?: string;
  createdAt: string;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [token, setToken] = useState('');
  const [rootDomain, setRootDomain] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token ?? '';
      setToken(t);
      if (t) api.domains.list(t).then((r: any) => setDomains(r));
    });
  }, []);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const d: any = await api.domains.add(token, rootDomain);
      setDomains(prev => [d, ...prev]);
      setRootDomain('');
      setExpanded(d.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerVerify(id: string) {
    try {
      const d: any = await api.domains.verify(token, id);
      setDomains(prev => prev.map(x => x.id === id ? d : x));
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Domain Verification</h1>

      <div style={card}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Add Domain</h2>
        {error && <p style={errStyle}>{error}</p>}
        <form onSubmit={addDomain} style={{ display: 'flex', gap: '0.75rem' }}>
          <input style={{ flex: 1, ...inputStyle }} type="text"
            placeholder="example.com" value={rootDomain}
            onChange={e => setRootDomain(e.target.value)} required />
          <button style={btnStyle} type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {domains.length === 0 && (
          <div style={{ ...card, color: '#9ca3af', textAlign: 'center' }}>
            No domains added yet. Add a domain to start scanning.
          </div>
        )}
        {domains.map(d => (
          <div key={d.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{d.rootDomain}</span>
                <span style={{ marginLeft: '0.75rem', color: STATE_COLOR[d.verificationState] ?? '#111', fontWeight: 600, fontSize: '0.8rem' }}>
                  {d.verificationState}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} style={outlineBtn}>
                  {expanded === d.id ? 'Hide' : 'Instructions'}
                </button>
                <button onClick={() => triggerVerify(d.id)} style={btnStyle}>
                  Check Verification
                </button>
              </div>
            </div>

            {expanded === d.id && (
              <div style={{ marginTop: '1rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', fontSize: '0.875rem' }}>
                <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>Choose one verification method:</p>

                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 500 }}>1. DNS TXT Record (recommended)</p>
                  <p style={{ margin: '0 0 0.5rem', color: '#6b7280' }}>Add this TXT record to your DNS:</p>
                  <code style={codeStyle}>scanrix-verification={d.verificationToken}</code>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 500 }}>2. HTTP File</p>
                  <p style={{ margin: '0 0 0.5rem', color: '#6b7280' }}>Host a file at:</p>
                  <code style={codeStyle}>https://{d.rootDomain}/.well-known/scanrix-verification.txt</code>
                  <p style={{ margin: '0.5rem 0 0.25rem', color: '#6b7280' }}>File contents:</p>
                  <code style={codeStyle}>{d.verificationToken}</code>
                </div>

                <div>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 500 }}>3. HTML Meta Tag</p>
                  <p style={{ margin: '0 0 0.5rem', color: '#6b7280' }}>Add to your homepage &lt;head&gt;:</p>
                  <code style={codeStyle}>{`<meta name="scanrix-verification" content="${d.verificationToken}">`}</code>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.5rem' };
const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.875rem' };
const btnStyle: React.CSSProperties = { padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' };
const outlineBtn: React.CSSProperties = { ...btnStyle, background: 'transparent', border: '1px solid #d1d5db', color: '#374151' };
const errStyle: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.875rem', marginBottom: '0.75rem' };
const codeStyle: React.CSSProperties = { display: 'block', background: '#1f2937', color: '#f9fafb', padding: '0.5rem 0.75rem', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' };
