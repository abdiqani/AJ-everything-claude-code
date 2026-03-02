-- Migration 004: enforce user blocking via DB column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS blocked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_blocked ON user_profiles(blocked_at)
  WHERE blocked_at IS NOT NULL;
