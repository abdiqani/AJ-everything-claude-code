import { SsrfGuard } from './ssrf-guard';

// Mock dns/promises to avoid real DNS lookups in tests
jest.mock('dns/promises', () => ({
  resolve4: jest.fn(),
  resolve6: jest.fn(),
}));

import * as dns from 'dns/promises';
const resolve4 = dns.resolve4 as jest.MockedFunction<typeof dns.resolve4>;
const resolve6 = dns.resolve6 as jest.MockedFunction<typeof dns.resolve6>;

describe('SsrfGuard.validate()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: resolve to a public IP
    resolve4.mockResolvedValue(['93.184.216.34'] as any);
    resolve6.mockRejectedValue(new Error('no AAAA'));
  });

  it('accepts a valid public HTTPS URL', async () => {
    const url = await SsrfGuard.validate('https://example.com/path?q=1');
    expect(url.hostname).toBe('example.com');
    expect(url.hash).toBe('');
  });

  it('adds https scheme when missing', async () => {
    const url = await SsrfGuard.validate('example.com');
    expect(url.protocol).toBe('https:');
  });

  it('removes URL fragment (#anchor)', async () => {
    const url = await SsrfGuard.validate('https://example.com/page#section');
    expect(url.hash).toBe('');
  });

  it('blocks localhost by name', async () => {
    await expect(SsrfGuard.validate('http://localhost/')).rejects.toThrow('localhost');
  });

  it('blocks 127.0.0.1 (loopback)', async () => {
    await expect(SsrfGuard.validate('http://127.0.0.1/')).rejects.toThrow('blocked');
  });

  it('blocks 10.x.x.x (RFC-1918)', async () => {
    await expect(SsrfGuard.validate('http://10.0.0.1/')).rejects.toThrow('blocked');
  });

  it('blocks 192.168.x.x (RFC-1918)', async () => {
    await expect(SsrfGuard.validate('http://192.168.1.1/')).rejects.toThrow('blocked');
  });

  it('blocks 172.16.x.x (RFC-1918)', async () => {
    await expect(SsrfGuard.validate('http://172.16.0.1/')).rejects.toThrow('blocked');
  });

  it('blocks 169.254.x.x (link-local)', async () => {
    await expect(SsrfGuard.validate('http://169.254.169.254/')).rejects.toThrow('blocked');
  });

  it('blocks when DNS resolves to private IP', async () => {
    resolve4.mockResolvedValue(['192.168.1.100'] as any);
    await expect(SsrfGuard.validate('https://evil-internal.example.com')).rejects.toThrow('blocked');
  });

  it('rejects non-HTTP protocols', async () => {
    await expect(SsrfGuard.validate('ftp://example.com')).rejects.toThrow('Only HTTP/HTTPS');
  });

  it('rejects completely invalid URLs', async () => {
    await expect(SsrfGuard.validate('not a url !!')).rejects.toThrow('Invalid URL');
  });
});
