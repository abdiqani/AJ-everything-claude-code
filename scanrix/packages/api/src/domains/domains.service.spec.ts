import { Test } from '@nestjs/testing';
import { DomainsService } from './domains.service';
import { DATABASE_POOL } from '../common/database.module';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// Mock Node dns module
jest.mock('dns/promises', () => ({
  resolveTxt: jest.fn(),
}));
import * as dns from 'dns/promises';
const resolveTxt = dns.resolveTxt as jest.MockedFunction<typeof dns.resolveTxt>;

// Mock global fetch
global.fetch = jest.fn();

const mockDb = { query: jest.fn() };

describe('DomainsService', () => {
  let service: DomainsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: DATABASE_POOL, useValue: mockDb },
      ],
    }).compile();
    service = module.get(DomainsService);
  });

  describe('assertDomainVerified()', () => {
    it('passes when domain is VERIFIED', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ verification_state: 'VERIFIED' }] });
      await expect(service.assertDomainVerified('org1', 'example.com')).resolves.not.toThrow();
    });

    it('throws when domain is UNVERIFIED', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ verification_state: 'UNVERIFIED' }] });
      await expect(service.assertDomainVerified('org1', 'example.com'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when domain is not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await expect(service.assertDomainVerified('org1', 'example.com'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('checkVerification() — DNS TXT method', () => {
    const mockDomain = {
      id: 'dom1', orgId: 'org1', rootDomain: 'example.com',
      verificationState: 'PENDING' as const,
      verificationToken: 'abc123', verifiedAt: null, createdAt: new Date(),
    };

    beforeEach(() => {
      // getDomainById call
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDomain] })
        // UPDATE call
        .mockResolvedValue({ rows: [{ ...mockDomain, verificationState: 'VERIFIED' }] });
    });

    it('sets VERIFIED when DNS TXT record matches', async () => {
      resolveTxt.mockResolvedValue([['scanrix-verification=abc123']] as any);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('no http'));

      const result = await service.checkVerification('org1', 'dom1');
      expect(result.verificationState).toBe('VERIFIED');
    });

    it('sets FAILED when no method succeeds', async () => {
      resolveTxt.mockRejectedValue(new Error('NXDOMAIN'));
      (global.fetch as jest.Mock).mockRejectedValue(new Error('no http'));

      // Override update mock to return FAILED
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDomain] })
        .mockResolvedValue({ rows: [{ ...mockDomain, verificationState: 'FAILED' }] });

      const result = await service.checkVerification('org1', 'dom1');
      expect(result.verificationState).toBe('FAILED');
    });
  });
});
