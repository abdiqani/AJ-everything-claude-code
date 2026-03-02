import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Scanrix – Vulnerability Scanning',
  description: 'URL-based vulnerability scanning SaaS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f9fafb', color: '#111827' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
