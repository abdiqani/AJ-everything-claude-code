-- ============================================================
-- Scanrix – Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────
-- ORGANISATIONS
-- ────────────────────────────────────────────
CREATE TABLE orgs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free','starter','pro','enterprise')),
  scans_used    INTEGER NOT NULL DEFAULT 0,
  scans_limit   INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- USER ↔ ORG
-- Supabase Auth manages auth.users; we store extra profile here.
-- ────────────────────────────────────────────
CREATE TABLE user_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- DOMAINS  (ownership verification)
-- ────────────────────────────────────────────
CREATE TABLE domains (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  root_domain        TEXT NOT NULL,
  verification_state TEXT NOT NULL DEFAULT 'UNVERIFIED'
                     CHECK (verification_state IN
                       ('UNVERIFIED','PENDING','VERIFIED','EXPIRED','FAILED')),
  verification_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  verified_at        TIMESTAMPTZ,
  last_checked_at    TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, root_domain)
);

CREATE INDEX idx_domains_org_id ON domains(org_id);
CREATE INDEX idx_domains_state  ON domains(verification_state);

-- ────────────────────────────────────────────
-- SCANS
-- ────────────────────────────────────────────
CREATE TABLE scans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  target_url    TEXT NOT NULL,
  target_host   TEXT NOT NULL,
  scan_profile  TEXT NOT NULL DEFAULT 'QUICK'
                CHECK (scan_profile IN ('QUICK','STANDARD','DEEP')),
  status        TEXT NOT NULL DEFAULT 'QUEUED'
                CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scans_org_id ON scans(org_id);
CREATE INDEX idx_scans_status  ON scans(status);

-- ────────────────────────────────────────────
-- FINDINGS  (normalized from scanner output)
-- ────────────────────────────────────────────
CREATE TABLE findings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id      UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  tool         TEXT NOT NULL CHECK (tool IN ('httpx','nuclei','zap','nikto','testssl')),
  title        TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info','low','medium','high','critical')),
  confidence   TEXT NOT NULL DEFAULT 'med'
               CHECK (confidence IN ('low','med','high')),
  category     TEXT,           -- xss, sqli, misconfig, auth, tls, cve, etc.
  target_url   TEXT NOT NULL,
  evidence     JSONB,          -- sanitized snippet
  request      TEXT,           -- gated by plan
  response     TEXT,           -- gated by plan
  cwe          TEXT,
  cve          TEXT,
  recommendation TEXT,
  references   JSONB,
  raw          JSONB,          -- original tool output row
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- dedup key
  UNIQUE (scan_id, tool, category, target_url, COALESCE(cve,''), title)
);

CREATE INDEX idx_findings_scan_id  ON findings(scan_id);
CREATE INDEX idx_findings_severity ON findings(severity);

-- ────────────────────────────────────────────
-- SCAN ARTIFACTS  (object storage references)
-- ────────────────────────────────────────────
CREATE TABLE scan_artifacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id      UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  tool         TEXT,
  artifact_key TEXT NOT NULL,   -- object storage key
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_scan_id ON scan_artifacts(scan_id);

-- ────────────────────────────────────────────
-- REPORTS
-- ────────────────────────────────────────────
CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id      UUID NOT NULL UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
  html_key     TEXT,   -- object storage key for HTML report
  json_key     TEXT,   -- object storage key for JSON report
  summary      JSONB,  -- { total, by_severity: {info,low,medium,high,critical} }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- AUDIT LOG
-- ────────────────────────────────────────────
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  org_id     UUID REFERENCES orgs(id),
  user_id    UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  target     TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org_id ON audit_log(org_id);
CREATE INDEX idx_audit_user_id ON audit_log(user_id);

-- ────────────────────────────────────────────
-- updated_at trigger
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON orgs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────
-- RLS: Row Level Security (Supabase-style)
-- ────────────────────────────────────────────
ALTER TABLE orgs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_artifacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports          ENABLE ROW LEVEL SECURITY;

-- Helper: get caller's org_id
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT org_id FROM user_profiles WHERE id = auth.uid();
$$;

-- Orgs: members see their own org
CREATE POLICY "orgs_own" ON orgs FOR ALL USING (id = current_org_id());

-- Domains: org-scoped
CREATE POLICY "domains_own" ON domains FOR ALL USING (org_id = current_org_id());

-- Scans: org-scoped
CREATE POLICY "scans_own" ON scans FOR ALL USING (org_id = current_org_id());

-- Findings: via scan ownership
CREATE POLICY "findings_own" ON findings FOR SELECT
  USING (scan_id IN (SELECT id FROM scans WHERE org_id = current_org_id()));

-- Artifacts: via scan ownership
CREATE POLICY "artifacts_own" ON scan_artifacts FOR SELECT
  USING (scan_id IN (SELECT id FROM scans WHERE org_id = current_org_id()));

-- Reports: via scan ownership
CREATE POLICY "reports_own" ON reports FOR SELECT
  USING (scan_id IN (SELECT id FROM scans WHERE org_id = current_org_id()));
