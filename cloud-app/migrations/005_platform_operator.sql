-- Migration 005: platform-level permissions separate from tenant owner status.
-- Only existing Nexus Software Solutions platform operator can access early-access leads.
CREATE TABLE IF NOT EXISTS platform_operators (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO platform_operators(user_id,created_at)
 SELECT id,CAST(strftime('%s','now') AS INTEGER)
 FROM users WHERE role='owner' ORDER BY created_at LIMIT 1;
