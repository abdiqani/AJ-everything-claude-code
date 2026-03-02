'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const link = (href: string, label: string): React.ReactNode => (
    <Link href={href} style={{
      padding: '0.5rem 1rem',
      borderRadius: 6,
      textDecoration: 'none',
      color: pathname.startsWith(href) ? '#2563eb' : '#374151',
      fontWeight: pathname.startsWith(href) ? 600 : 400,
      background: pathname.startsWith(href) ? '#eff6ff' : 'transparent',
    }}>{label}</Link>
  );

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#111827', marginRight: '1rem' }}>Scanrix</span>
      {link('/dashboard/scans', 'Scans')}
      {link('/dashboard/domains', 'Domains')}
      <div style={{ flex: 1 }} />
      <button onClick={signOut} style={{ padding: '0.4rem 0.9rem', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#374151' }}>
        Sign out
      </button>
    </nav>
  );
}
