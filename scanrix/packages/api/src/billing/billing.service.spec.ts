/**
 * Unit tests for BillingService.
 *
 * Stripe mock strategy:
 *   jest.mock() is hoisted by Jest to before any import statements, which means
 *   top-level const declarations are in the temporal dead zone at hoist time.
 *   To work around this we declare a module-level `stripeMocks` object whose
 *   properties are assigned jest.fn() values, then the jest.mock() factory
 *   produces an instance that delegates every call to those shared handles.
 *   This lets individual tests configure return values via stripeMocks.X.mockXxx().
 *
 *   The factory returns a plain constructor function so that `new Stripe(...)` in
 *   billing.service.ts succeeds. The `default` property is set on the constructor
 *   to satisfy the CommonJS interop pattern used by ts-jest.
 */

// ── Env vars — set before any module is required ──────────────────────────────
process.env.STRIPE_SECRET_KEY    = 'sk_test_placeholder';
process.env.STRIPE_PRICE_STARTER = 'price_starter_test';
process.env.STRIPE_PRICE_PRO     = 'price_pro_test';
// STRIPE_PRICE_ENTERPRISE is intentionally left unset so the "no price" test works

// ── Shared stripe mock handles ────────────────────────────────────────────────
// These must be declared BEFORE jest.mock() so they are in scope inside the
// test body. Jest hoisting only moves the jest.mock() call, not these consts.
const stripeMocks = {
  customersCreate:        jest.fn(),
  checkoutSessionsCreate: jest.fn(),
  webhooksConstructEvent: jest.fn(),
};

// ── Stripe module mock ────────────────────────────────────────────────────────
// The factory is self-contained; it cannot reference the outer `stripeMocks`
// directly because of hoisting. Instead, it builds an instance that forwards
// calls via a closure-captured reference to the global `stripeMocks` object.
// At runtime in Node.js, global variables ARE accessible from within the factory
// because the factory closure captures the module scope, not just the lexical
// position — Jest's hoist moves the call expression, not the closure environment.
jest.mock('stripe', () => {
  // stripeMocks is accessible here because Jest hoist moves only the call site;
  // the variable is still declared in the same module scope and will be
  // initialized by the time the mock factory is invoked (during require()).
  const instance = {
    customers: {
      create: (...args: unknown[]) => (global as any).__stripeMocks.customersCreate(...args),
    },
    checkout: {
      sessions: {
        create: (...args: unknown[]) => (global as any).__stripeMocks.checkoutSessionsCreate(...args),
      },
    },
    webhooks: {
      constructEvent: (...args: unknown[]) =>
        (global as any).__stripeMocks.webhooksConstructEvent(...args),
    },
  };
  const ctor = jest.fn().mockImplementation(() => instance);
  (ctor as any).default = ctor;
  return ctor;
});

// Publish stripeMocks on global so the jest.mock factory can reach it
(global as any).__stripeMocks = stripeMocks;

// ── Imports ───────────────────────────────────────────────────────────────────
import { Test }             from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BillingService }   from './billing.service';
import { DATABASE_POOL }    from '../common/database.module';
import { AuditService }     from '../common/audit.service';

// ── Constants shared across tests ────────────────────────────────────────────
const STARTER_PRICE = 'price_starter_test';

// ── Mock objects ──────────────────────────────────────────────────────────────
const mockDb    = { query: jest.fn() };
const mockAudit = { log: jest.fn() };

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSubscriptionEvent(
  type: string,
  customerId: string,
  priceId: string,
  status = 'active',
  subId  = 'sub_123',
) {
  return {
    id:   `evt_${type}_${subId}`,
    type,
    data: {
      object: {
        id:       subId,
        customer: customerId,
        status,
        items: { data: [{ price: { id: priceId } }] },
      },
    },
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAudit.log.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: DATABASE_POOL, useValue: mockDb },
        { provide: AuditService,  useValue: mockAudit },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  // ── createCheckoutSession ──────────────────────────────────────────────────
  describe('createCheckoutSession()', () => {
    const baseOpts = {
      orgId:      'org_abc',
      userId:     'user_xyz',
      userEmail:  'user@example.com',
      plan:       'starter' as const,
      successUrl: 'https://app.example.com/success',
      cancelUrl:  'https://app.example.com/cancel',
    };

    it('creates a new Stripe customer when none exists, persists it, and returns checkout URL', async () => {
      // Arrange
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] })
        .mockResolvedValueOnce({ rows: [] });

      stripeMocks.customersCreate.mockResolvedValue({ id: 'cus_new_001' });
      stripeMocks.checkoutSessionsCreate.mockResolvedValue({
        id:  'cs_live_001',
        url: 'https://checkout.stripe.com/pay/cs_live_001',
      });

      // Act
      const result = await service.createCheckoutSession(baseOpts);

      // Assert — customer created with correct email and metadata
      expect(stripeMocks.customersCreate).toHaveBeenCalledWith({
        email:    baseOpts.userEmail,
        metadata: { org_id: baseOpts.orgId, user_id: baseOpts.userId },
      });

      // Assert — customer id persisted to the org row
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orgs SET stripe_customer_id'),
        ['cus_new_001', baseOpts.orgId],
      );

      // Assert — checkout session created with the new customer
      expect(stripeMocks.checkoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new_001' }),
      );

      // Assert — checkout URL returned
      expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_live_001' });
    });

    it('reuses the existing stripe_customer_id without creating a new customer', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_existing_999' }],
      });
      stripeMocks.checkoutSessionsCreate.mockResolvedValue({
        id:  'cs_live_002',
        url: 'https://checkout.stripe.com/pay/cs_live_002',
      });

      // Act
      const result = await service.createCheckoutSession(baseOpts);

      // Assert — no new customer was created
      expect(stripeMocks.customersCreate).not.toHaveBeenCalled();

      // Assert — checkout session used the pre-existing customer id
      expect(stripeMocks.checkoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing_999' }),
      );

      expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_live_002' });
    });

    it('throws BadRequestException when the plan has no configured Stripe price', async () => {
      // Arrange — 'enterprise' price env var was never set in this suite
      const opts = { ...baseOpts, plan: 'enterprise' as const };

      // Act & Assert
      await expect(service.createCheckoutSession(opts))
        .rejects.toBeInstanceOf(BadRequestException);

      // No DB or Stripe calls should have been made
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(stripeMocks.customersCreate).not.toHaveBeenCalled();
    });

    it('passes correct line_items, mode, and metadata to the checkout session', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_abc' }],
      });
      stripeMocks.checkoutSessionsCreate.mockResolvedValue({
        id:  'cs_live_003',
        url: 'https://checkout.stripe.com/pay/cs_live_003',
      });

      // Act
      await service.createCheckoutSession(baseOpts);

      // Assert
      expect(stripeMocks.checkoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode:       'subscription',
          line_items: [{ price: STARTER_PRICE, quantity: 1 }],
          metadata:   { org_id: baseOpts.orgId, plan: 'starter' },
        }),
      );
    });

    it('records a billing.checkout audit entry after a successful session', async () => {
      // Arrange
      mockDb.query.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_abc' }],
      });
      stripeMocks.checkoutSessionsCreate.mockResolvedValue({
        id: 'cs_x', url: 'https://stripe.com/x',
      });

      // Act
      await service.createCheckoutSession(baseOpts);

      // Assert
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId:  baseOpts.orgId,
          userId: baseOpts.userId,
          action: 'billing.checkout',
          target: 'starter',
        }),
      );
    });
  });

  // ── handleWebhook ──────────────────────────────────────────────────────────
  describe('handleWebhook()', () => {
    const rawBody = '{"id":"evt_001"}';
    const sig     = 'stripe-sig-header';
    const secret  = 'whsec_test';

    beforeEach(() => {
      process.env.STRIPE_WEBHOOK_SECRET = secret;
    });

    afterEach(() => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it('returns early without processing when STRIPE_WEBHOOK_SECRET is not set', async () => {
      // Arrange
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert — no Stripe or DB calls
      expect(stripeMocks.webhooksConstructEvent).not.toHaveBeenCalled();
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('skips processing when the stripe_event_id has already been recorded (idempotency)', async () => {
      // Arrange
      const event = makeSubscriptionEvent(
        'customer.subscription.created', 'cus_idempotent', STARTER_PRICE,
      );
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      // SELECT returns existing row → event was already processed
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'sub_evt_existing' }] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert — only the duplicate-check SELECT was executed
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM subscription_events'),
        [event.id],
      );
    });

    it('updates org plan to "starter" on customer.subscription.created', async () => {
      // Arrange
      const event = makeSubscriptionEvent(
        'customer.subscription.created', 'cus_org_001', STARTER_PRICE, 'active', 'sub_new_001',
      );
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })              // SELECT — not seen
        .mockResolvedValueOnce({ rows: [{ id: 'org_001' }] }) // UPDATE orgs
        .mockResolvedValueOnce({ rows: [] });             // INSERT subscription_events

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert — UPDATE called with correct plan, status, subscription id, customer id
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE orgs SET plan');
      expect(updateCall[1]).toEqual(
        expect.arrayContaining(['starter', 'active', 'sub_new_001', 'cus_org_001']),
      );

      // Assert — audit entry written
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_001', action: 'billing.subscribed', target: 'starter' }),
      );

      // Assert — event recorded in idempotency ledger
      const insertCall = mockDb.query.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO subscription_events');
      expect(insertCall[1]).toContain(event.id);
    });

    it('resets org plan to "free" and status to "cancelled" on customer.subscription.deleted', async () => {
      // Arrange
      const event = {
        id:   'evt_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id:       'sub_cancelled',
            customer: 'cus_cancelled_001',
            status:   'canceled',
            items:    { data: [] },
          },
        },
      };
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'org_cancelled' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert — UPDATE sets plan = 'free' and subscription_status = 'cancelled'
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[0]).toContain("plan = 'free'");
      expect(updateCall[0]).toContain("subscription_status = 'cancelled'");
      expect(updateCall[1]).toEqual(['cus_cancelled_001']);

      // Assert — audit entry
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org_cancelled', action: 'billing.cancelled' }),
      );
    });

    it('throws BadRequestException when the webhook signature is invalid', async () => {
      // Arrange
      stripeMocks.webhooksConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      // Act & Assert
      await expect(service.handleWebhook(rawBody, 'bad-sig'))
        .rejects.toBeInstanceOf(BadRequestException);

      // No DB mutations attempted
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('still inserts a subscription_event row for unhandled event types', async () => {
      // Arrange
      const event = {
        id:   'evt_pi_succeeded',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_abc' } },
      };
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert — INSERT still executed for audit trail
      const insertCall = mockDb.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO subscription_events');
      expect(insertCall[1]).toContain('evt_pi_succeeded');
      expect(insertCall[1]).toContain('payment_intent.succeeded');
    });

    it('maps "trialing" subscription status correctly', async () => {
      // Arrange
      const event = makeSubscriptionEvent(
        'customer.subscription.updated', 'cus_trial', STARTER_PRICE, 'trialing', 'sub_trial',
      );
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'org_trial' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[1]).toContain('trialing');
    });

    it('maps "past_due" subscription status correctly', async () => {
      // Arrange
      const event = makeSubscriptionEvent(
        'customer.subscription.updated', 'cus_pastdue', STARTER_PRICE, 'past_due', 'sub_pd',
      );
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'org_pastdue' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[1]).toContain('past_due');
    });

    it('maps unknown subscription statuses to "inactive"', async () => {
      // Arrange
      const event = makeSubscriptionEvent(
        'customer.subscription.updated', 'cus_inc', STARTER_PRICE, 'incomplete', 'sub_inc',
      );
      stripeMocks.webhooksConstructEvent.mockReturnValue(event);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'org_inc' }] })
        .mockResolvedValueOnce({ rows: [] });

      // Act
      await service.handleWebhook(rawBody, sig);

      // Assert
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[1]).toContain('inactive');
    });
  });
});
