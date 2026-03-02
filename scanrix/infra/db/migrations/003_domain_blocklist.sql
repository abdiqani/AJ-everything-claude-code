-- Migration 003: global domain blocklist for admin use
CREATE TABLE IF NOT EXISTS domain_blocklist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain       TEXT NOT NULL UNIQUE,
  reason       TEXT,
  blocked_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domain_blocklist_domain ON domain_blocklist(domain);

-- RLS: only service role can access
ALTER TABLE domain_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocklist_service_only" ON domain_blocklist
  USING (false) WITH CHECK (false);
