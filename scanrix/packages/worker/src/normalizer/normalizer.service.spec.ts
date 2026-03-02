import { NormalizerService } from './normalizer.service';

// Mock pg Pool
const mockDb = { query: jest.fn() };

describe('NormalizerService', () => {
  let service: NormalizerService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [] });
    service = new NormalizerService(mockDb as any);
  });

  describe('normalizeHttpx()', () => {
    it('converts httpx line to info finding', async () => {
      await service.ingest('scan1', 'httpx', {
        lines: [{ url: 'https://example.com', 'status-code': 200, title: 'Example', technologies: ['nginx'] }],
      });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO findings'),
        expect.arrayContaining(['scan1', 'httpx', expect.stringContaining('HTTP 200'), 'info']),
      );
    });
  });

  describe('normalizeNuclei()', () => {
    it('maps severity correctly', async () => {
      const nucleiLine = {
        'template-id': 'cve-2021-44228',
        info: { name: 'Log4Shell', severity: 'critical', tags: ['cve'], classification: { cve_id: ['CVE-2021-44228'], cwe_id: ['CWE-502'] } },
        matched: 'https://example.com/api',
        host: 'example.com',
      };
      await service.ingest('scan1', 'nuclei', { lines: [nucleiLine] });
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe('critical');  // severity
      expect(callArgs[10]).toBe('CVE-2021-44228');  // cve
    });

    it('defaults severity to info for unknown', async () => {
      await service.ingest('scan1', 'nuclei', {
        lines: [{ 'template-id': 'test', info: { name: 'Test', severity: 'unknown' }, host: 'example.com' }],
      });
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe('info');
    });
  });

  describe('normalizeZap()', () => {
    it('maps riskcode 3 → high', async () => {
      const alert = { riskcode: '3', confidence: '3', name: 'XSS', uri: 'https://example.com', pluginid: '40012' };
      await service.ingest('scan1', 'zap', { alerts: [alert], rawJson: {} });
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe('high');
      expect(callArgs[4]).toBe('high');
    });

    it('maps riskcode 0 → info', async () => {
      const alert = { riskcode: '0', confidence: '0', name: 'Info', uri: 'https://example.com' };
      await service.ingest('scan1', 'zap', { alerts: [alert] });
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe('info');
    });
  });

  describe('normalizeNikto()', () => {
    it('produces low severity findings', async () => {
      await service.ingest('scan1', 'nikto', {
        vulnerabilities: [{ msg: 'Server leaks info', url: '/server', OSVDB: '0' }],
      });
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe('low');
    });
  });

  describe('normalizeTestssl()', () => {
    it('filters out OK severity', async () => {
      await service.ingest('scan1', 'testssl', {
        findings: [{ id: 'tls1', finding: 'TLS 1.0 offered', severity: 'MEDIUM', ip: '93.184.216.34' }],
      });
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('skips OK findings', async () => {
      await service.ingest('scan1', 'testssl', {
        findings: [{ id: 'tls3', finding: 'TLS 1.3 offered', severity: 'OK', ip: '93.184.216.34' }],
      });
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});
