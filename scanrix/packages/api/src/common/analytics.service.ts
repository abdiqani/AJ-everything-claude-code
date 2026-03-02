import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';

export type AnalyticsEvent =
  | 'scan.created'
  | 'scan.completed'
  | 'scan.failed'
  | 'domain.verified'
  | 'domain.failed'
  | 'user.signed_up'
  | 'billing.checkout_started'
  | 'billing.subscribed'
  | 'billing.cancelled';

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly client: PostHog | null;

  constructor() {
    const key = process.env.POSTHOG_API_KEY;
    if (!key) {
      this.logger.warn('POSTHOG_API_KEY not set — analytics disabled');
      this.client = null;
      return;
    }
    this.client = new PostHog(key, {
      host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
      flushAt: 20,
      flushInterval: 10_000,
    });
  }

  track(userId: string, event: AnalyticsEvent, properties?: Record<string, unknown>): void {
    if (!this.client) return;
    try {
      this.client.capture({ distinctId: userId, event, properties });
    } catch (err) {
      this.logger.warn(`Analytics capture failed: ${(err as Error).message}`);
    }
  }

  identify(userId: string, traits: Record<string, unknown>): void {
    if (!this.client) return;
    try {
      this.client.identify({ distinctId: userId, properties: traits });
    } catch (err) {
      this.logger.warn(`Analytics identify failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}
