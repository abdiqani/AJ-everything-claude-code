import { Nav } from '../../components/Nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <Nav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
