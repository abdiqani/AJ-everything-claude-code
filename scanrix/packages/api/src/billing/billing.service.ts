import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { DATABASE_POOL } from '../common/database.module';
import { AuditService } from '../common/audit.service';

const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter:    process.env.STRIPE_PRICE_STARTER,
  pro:        process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

const PRICE_TO_PLAN: Record<string, string> = {};
// Built at runtime from env vars
for (const [plan, priceId] of Object.entries(PLAN_PRICE_IDS)) {
  if (priceId) PRICE_TO_PLAN[priceId] = plan;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    private readonly audit: AuditService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn('STRIPE_SECRET_KEY not set — billing disabled');
    }
    this.stripe = new Stripe(key ?? 'sk_test_placeholder', {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Create or retrieve a Stripe customer for the org, then open a
   * Checkout session for the requested plan.
   */
  async createCheckoutSession(opts: {
    orgId: string;
    userId: string;
    userEmail: string;
    plan: 'starter' | 'pro' | 'enterprise';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    const priceId = PLAN_PRICE_IDS[opts.plan];
    if (!priceId) {
      throw new BadRequestException(`No Stripe price configured for plan: ${opts.plan}`);
    }

    // Fetch or create Stripe customer
    const { rows } = await this.db.query(
      'SELECT stripe_customer_id FROM orgs WHERE id = $1',
      [opts.orgId],
    );
    let customerId: string | undefined = rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: opts.userEmail,
        metadata: { org_id: opts.orgId, user_id: opts.userId },
      });
      customerId = customer.id;
      await this.db.query(
        'UPDATE orgs SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, opts.orgId],
      );
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: { org_id: opts.orgId, plan: opts.plan },
      allow_promotion_codes: true,
    });

    await this.audit.log({
      orgId: opts.orgId,
      userId: opts.userId,
      action: 'billing.checkout',
      target: opts.plan,
      metadata: { sessionId: session.id },
    });

    return { url: session.url! };
  }

  /** Process a Stripe webhook event — idempotent via stripe_event_id dedup */
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping webhook');
      return;
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(`Stripe webhook signature invalid: ${(err as Error).message}`);
    }

    // Idempotency: skip already-processed events
    const { rows: existing } = await this.db.query(
      'SELECT id FROM subscription_events WHERE stripe_event_id = $1',
      [event.id],
    );
    if (existing.length > 0) return;

    await this.processEvent(event);
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    let orgId: string | undefined;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id;
        const plan = PRICE_TO_PLAN[priceId] ?? 'free';
        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : 'inactive';

        const { rows } = await this.db.query(
          `UPDATE orgs SET plan = $1, subscription_status = $2,
                           stripe_subscription_id = $3,
                           scans_limit = (SELECT scans_per_month FROM plan_limits WHERE plan = $1)
           WHERE stripe_customer_id = $4
           RETURNING id`,
          [plan, status, sub.id, sub.customer as string],
        );
        orgId = rows[0]?.id;
        if (orgId) {
          await this.audit.log({ orgId, action: 'billing.subscribed', target: plan });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { rows } = await this.db.query(
          `UPDATE orgs SET plan = 'free', subscription_status = 'cancelled',
                           stripe_subscription_id = NULL,
                           scans_limit = 1
           WHERE stripe_customer_id = $1
           RETURNING id`,
          [sub.customer as string],
        );
        orgId = rows[0]?.id;
        if (orgId) {
          await this.audit.log({ orgId, action: 'billing.cancelled' });
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    // Record event (idempotency ledger)
    await this.db.query(
      `INSERT INTO subscription_events (org_id, stripe_event_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [orgId ?? null, event.id, event.type, JSON.stringify(event.data.object)],
    );
  }
}
