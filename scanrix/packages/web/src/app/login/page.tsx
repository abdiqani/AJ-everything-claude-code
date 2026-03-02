'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMagicSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard/scans');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email first'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h2>Check your email</h2>
          <p>We sent a login link to <strong>{email}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem' }}>
          {isSignup ? 'Create account' : 'Sign in'} to Scanrix
        </h1>
        {error && <p style={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input style={styles.input} type="email" value={email}
            onChange={e => setEmail(e.target.value)} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={password}
            onChange={e => setPassword(e.target.value)} required />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Loading…' : isSignup ? 'Sign up' : 'Sign in'}
          </button>
        </form>
        <button style={styles.linkBtn} onClick={handleMagicLink} disabled={loading}>
          Send magic link instead
        </button>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <button style={styles.textBtn} onClick={() => setIsSignup(!isSignup)}>
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '2rem', width: 380, boxShadow: '0 4px 16px rgba(0,0,0,0.07)' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  label: { fontSize: '0.875rem', fontWeight: 500, color: '#374151' },
  input: { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' },
  btn: { padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginTop: '0.5rem' },
  linkBtn: { marginTop: '0.75rem', padding: '0.5rem', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', width: '100%', color: '#374151' },
  textBtn: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontWeight: 500 },
  error: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.875rem' },
};
