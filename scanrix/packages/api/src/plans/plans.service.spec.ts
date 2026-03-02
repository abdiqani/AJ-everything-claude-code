import { Test } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { DATABASE_POOL } from '../common/database.module';
import { ForbiddenException } from '@nestjs/common';

const mockDb = {
  query: jest.fn(),
};

describe('PlansService', () => {
  let service: PlansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: DATABASE_POOL, useValue: mockDb },
      ],
    }).compile();
    service = module.get(PlansService);
  });

  describe('assertScanAllowed()', () => {
    it('allows QUICK scan on free plan with 0 scans used', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '0' }] });
      await expect(service.assertScanAllowed('org1', 'free', 'QUICK')).resolves.not.toThrow();
    });

    it('throws when free plan limit (1) is reached', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '1' }] });
      await expect(service.assertScanAllowed('org1', 'free', 'QUICK'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when free plan tries STANDARD profile', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '0' }] });
      await expect(service.assertScanAllowed('org1', 'free', 'STANDARD'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when free plan tries DEEP profile', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '0' }] });
      await expect(service.assertScanAllowed('org1', 'free', 'DEEP'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows STANDARD scan on starter plan', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '5' }] });
      await expect(service.assertScanAllowed('org1', 'starter', 'STANDARD')).resolves.not.toThrow();
    });

    it('blocks DEEP scan on starter plan', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '0' }] });
      await expect(service.assertScanAllowed('org1', 'starter', 'DEEP'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows all profiles on pro plan', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ cnt: '10' }] });
      for (const profile of ['QUICK', 'STANDARD', 'DEEP'] as const) {
        await expect(service.assertScanAllowed('org1', 'pro', profile)).resolves.not.toThrow();
      }
    });
  });

  describe('getLimits()', () => {
    it('returns free limits for unknown plan', () => {
      const limits = service.getLimits('unknown');
      expect(limits.scansPerMonth).toBe(1);
    });

    it('returns pro limits correctly', () => {
      const limits = service.getLimits('pro');
      expect(limits.scansPerMonth).toBe(100);
      expect(limits.profiles).toContain('DEEP');
    });
  });
});
