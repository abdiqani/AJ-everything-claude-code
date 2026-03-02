-- ============================================================
-- Scanrix – Stripe Billing Schema
-- ============================================================

-- Add Stripe fields to orgs
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive','trialing','active','past_due','cancelled'));

-- Subscription events ledger (immutable audit trail)
CREATE TABLE subscription_events (
  id              BIGSERIAL PRIMARY KEY,
  org_id          UUID REFERENCES orgs(id),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_org_id ON subscription_events(org_id);

-- Plan → limits mapping (source of truth for plan checks)
CREATE TABLE plan_limits (
  plan              TEXT PRIMARY KEY,
  scans_per_month   INTEGER NOT NULL,
  profiles_allowed  TEXT[]  NOT NULL,
  concurrency       INTEGER NOT NULL
);

INSERT INTO plan_limits (plan, scans_per_month, profiles_allowed, concurrency) VALUES
  ('free',       1,    ARRAY['QUICK'],                     1),
  ('starter',    20,   ARRAY['QUICK','STANDARD'],          2),
  ('pro',        100,  ARRAY['QUICK','STANDARD','DEEP'],   5),
  ('enterprise', 9999, ARRAY['QUICK','STANDARD','DEEP'],  20)
ON CONFLICT (plan) DO NOTHING;
