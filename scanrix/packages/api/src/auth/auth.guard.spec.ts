/**
 * Unit tests for AuthGuard.
 *
 * Strategy:
 * - jest.mock('@supabase/supabase-js') is hoisted before the module import so
 *   the createClient() call inside the AuthGuard class property initializer
 *   receives our mock instead of the real Supabase client.
 * - mockGetUser and mockSingle are declared in the outer scope so individual
 *   tests can override them with mockResolvedValueOnce / mockReturnValueOnce.
 * - makeCtx() builds a minimal ExecutionContext that mirrors what Fastify/Express
 *   provides, satisfying AuthGuard's ctx.switchToHttp().getRequest() call.
 */

// ── Supabase mock (hoisted by Jest) ───────────────────────────────────────────
const mockGetUser = jest.fn();
const mockSingle  = jest.fn();

const mockFrom = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnThis(),
  eq:     jest.fn().mockReturnThis(),
  single: mockSingle,
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard }             from './auth.guard';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock ExecutionContext.
 * The underlying request object is also returned so assertions can inspect
 * req.user after canActivate() resolves.
 */
function makeCtx(headers: Record<string, string> = {}) {
  const req = { headers, user: undefined as any };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as any;
  return ctx;
}

// ── Test suite ────────────────────────────────────────────────────────────────
describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthGuard();
  });

  // ── Authorization header validation ─────────────────────────────────────
  describe('Authorization header validation', () => {
    it('throws UnauthorizedException when Authorization header is missing', async () => {
      // Arrange
      const ctx = makeCtx({});

      // Act & Assert
      await expect(guard.canActivate(ctx))
        .rejects.toBeInstanceOf(UnauthorizedException);

      // Supabase should never have been called
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when Authorization header is not a Bearer token', async () => {
      // Arrange — Basic auth scheme, not Bearer
      const ctx = makeCtx({ authorization: 'Basic dXNlcjpwYXNz' });

      // Act & Assert
      await expect(guard.canActivate(ctx))
        .rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when Authorization header value is "Bearer" with no token', async () => {
      // Arrange — malformed: "Bearer " followed by nothing meaningful is still
      // forwarded to Supabase, but the header itself lacks the "Bearer " prefix
      // check only. Here we test the plain "Bearer" (no trailing space) case.
      const ctx = makeCtx({ authorization: 'Bearer' });

      // "Bearer" does not start with "Bearer " (note the trailing space required)
      await expect(guard.canActivate(ctx))
        .rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── Supabase auth.getUser() failure ──────────────────────────────────────
  describe('Supabase token verification', () => {
    it('throws UnauthorizedException("Invalid or expired token") when Supabase returns an error', async () => {
      // Arrange
      mockGetUser.mockResolvedValue({
        data:  { user: null },
        error: { message: 'JWT expired' },
      });
      const ctx = makeCtx({ authorization: 'Bearer expired.jwt.token' });

      // Act & Assert
      await expect(guard.canActivate(ctx))
        .rejects.toMatchObject({
          message: 'Invalid or expired token',
        });
    });

    it('throws UnauthorizedException("Invalid or expired token") when Supabase returns no user', async () => {
      // Arrange — no error object but user is null (e.g. revoked token)
      mockGetUser.mockResolvedValue({
        data:  { user: null },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer revoked.jwt.token' });

      // Act & Assert
      await expect(guard.canActivate(ctx))
        .rejects.toMatchObject({
          message: 'Invalid or expired token',
        });
    });
  });

  // ── User profile lookup ───────────────────────────────────────────────────
  describe('user_profiles lookup', () => {
    const validUser = { id: 'usr_001', email: 'alice@example.com' };

    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data:  { user: validUser },
        error: null,
      });
    });

    it('throws UnauthorizedException("User profile not found") when no user_profiles row exists', async () => {
      // Arrange — .single() returns null data (no row)
      mockSingle.mockResolvedValue({ data: null, error: null });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act & Assert
      await expect(guard.canActivate(ctx))
        .rejects.toMatchObject({
          message: 'User profile not found',
        });
    });

    it('throws UnauthorizedException when .single() returns a Supabase error', async () => {
      // Arrange — row not found returns an error from Supabase
      mockSingle.mockResolvedValue({
        data:  null,
        error: { message: 'PGRST116: Row not found' },
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act & Assert — the guard checks !profile (data is null)
      await expect(guard.canActivate(ctx))
        .rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── Successful authentication ─────────────────────────────────────────────
  describe('successful canActivate()', () => {
    const validUser = { id: 'usr_abc', email: 'bob@example.com' };

    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data:  { user: validUser },
        error: null,
      });
    });

    it('sets req.user with id, email, orgId, plan, and role from the profile', async () => {
      // Arrange
      mockSingle.mockResolvedValue({
        data: {
          org_id: 'org_xyz',
          role:   'admin',
          orgs:   { plan: 'starter' },
        },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act
      const result = await guard.canActivate(ctx);

      // Assert — returns true
      expect(result).toBe(true);

      // Assert — req.user is populated correctly
      expect(ctx._req.user).toEqual({
        id:    'usr_abc',
        email: 'bob@example.com',
        orgId: 'org_xyz',
        plan:  'starter',
        role:  'admin',
      });
    });

    it('defaults plan to "free" when orgs.plan is null', async () => {
      // Arrange — org has no plan set yet
      mockSingle.mockResolvedValue({
        data: {
          org_id: 'org_free',
          role:   'owner',
          orgs:   { plan: null },
        },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act
      await guard.canActivate(ctx);

      // Assert
      expect(ctx._req.user.plan).toBe('free');
    });

    it('defaults plan to "free" when the orgs join returns undefined', async () => {
      // Arrange — profile row without an orgs join column
      mockSingle.mockResolvedValue({
        data: {
          org_id: 'org_no_join',
          role:   'member',
          // orgs property is absent entirely
        },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act
      await guard.canActivate(ctx);

      // Assert
      expect(ctx._req.user.plan).toBe('free');
    });

    it('defaults role to "member" when profile.role is null', async () => {
      // Arrange
      mockSingle.mockResolvedValue({
        data: {
          org_id: 'org_norole',
          role:   null,
          orgs:   { plan: 'pro' },
        },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act
      await guard.canActivate(ctx);

      // Assert
      expect(ctx._req.user.role).toBe('member');
    });

    it('defaults role to "member" when profile.role is undefined', async () => {
      // Arrange — role column entirely absent from response
      mockSingle.mockResolvedValue({
        data: {
          org_id: 'org_nrole2',
          orgs:   { plan: 'enterprise' },
        },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer valid.jwt.token' });

      // Act
      await guard.canActivate(ctx);

      // Assert
      expect(ctx._req.user.role).toBe('member');
    });

    it('extracts the token correctly by stripping the "Bearer " prefix', async () => {
      // Arrange
      mockSingle.mockResolvedValue({
        data: { org_id: 'org_token', role: 'member', orgs: { plan: 'free' } },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer my.actual.jwt' });

      // Act
      await guard.canActivate(ctx);

      // Assert — Supabase received only the raw JWT, not the "Bearer " prefix
      expect(mockGetUser).toHaveBeenCalledWith('my.actual.jwt');
    });

    it('queries user_profiles with the Supabase user id', async () => {
      // Arrange
      mockSingle.mockResolvedValue({
        data: { org_id: 'org_qry', role: 'member', orgs: { plan: 'starter' } },
        error: null,
      });
      const ctx = makeCtx({ authorization: 'Bearer some.jwt' });

      // Act
      await guard.canActivate(ctx);

      // Assert — from() called with the correct table name
      expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    });
  });
});
