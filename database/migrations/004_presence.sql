-- TymKeeper — Presence Migration
-- Run in pgAdmin Query Tool connected to tymkeeper database

-- Add last_seen column to users for login-based presence tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Index for fast presence lookups
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

-- Update all existing users to now (so they don't all show offline immediately)
UPDATE users SET last_seen = NOW() WHERE last_seen IS NULL;

SELECT 'Presence migration complete ✅' AS status;
