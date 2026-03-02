import * as dns from 'dns/promises';
import * as ipaddr from 'ipaddr.js';

/**
 * SSRF Protection — validate that a target URL is safe to scan:
 *  1. Parse + normalize the URL
 *  2. Block private/loopback/link-local IP ranges
 *  3. Resolve hostname and validate the resolved IP is public
 */
export class SsrfGuard {
  private static readonly BLOCKED_RANGES = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8',
    '::1/128',
    'fc00::/7',
    'fe80::/10',
    '169.254.0.0/16',  // link-local
    '100.64.0.0/10',   // shared address space
    '0.0.0.0/8',
    '240.0.0.0/4',     // reserved
    '224.0.0.0/4',     // multicast
  ];

  /** Returns normalized URL string or throws if blocked */
  static async validate(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
      // Ensure scheme
      const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      url = new URL(withScheme);
    } catch {
      throw new Error(`Invalid URL: ${rawUrl}`);
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }

    // Remove fragment (never sent to server)
    url.hash = '';

    const hostname = url.hostname.toLowerCase();

    // Block localhost explicitly
    if (['localhost', 'localhost.localdomain'].includes(hostname)) {
      throw new Error('Scanning localhost is not allowed');
    }

    // If hostname looks like an IP, check immediately
    if (ipaddr.isValid(hostname)) {
      SsrfGuard.assertPublicIp(hostname);
      return url;
    }

    // Resolve and check all A/AAAA records
    let addresses: string[] = [];
    try {
      const [v4, v6] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      if (v4.status === 'fulfilled') addresses.push(...v4.value);
      if (v6.status === 'fulfilled') addresses.push(...v6.value);
    } catch {
      throw new Error(`DNS resolution failed for ${hostname}`);
    }

    if (addresses.length === 0) {
      throw new Error(`Could not resolve hostname: ${hostname}`);
    }

    for (const ip of addresses) {
      SsrfGuard.assertPublicIp(ip);
    }

    return url;
  }

  private static assertPublicIp(ip: string): void {
    let addr: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      addr = ipaddr.parse(ip);
    } catch {
      throw new Error(`Invalid IP address: ${ip}`);
    }

    for (const range of SsrfGuard.BLOCKED_RANGES) {
      const [rangeAddr, bits] = ipaddr.parseCIDR(range);
      if (addr.kind() === rangeAddr.kind() && addr.match([rangeAddr, bits])) {
        throw new Error(`Target IP ${ip} is in a blocked private range`);
      }
    }
  }
}
