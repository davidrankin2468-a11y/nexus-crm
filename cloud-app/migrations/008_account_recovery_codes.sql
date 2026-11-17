-- Migration 008: one-time owner recovery codes, stored as secure SHA-256 digests.
-- User must generate and privately retain codes. No email delivery.
CREATE TABLE IF NOT EXISTS account_recovery_codes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL CHECK(length(code_hash)=64),
 created_at INTEGER NOT NULL,
 used_at INTEGER,
 PRIMARY KEY(user_id,code_hash)
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_active ON account_recovery_codes(user_id,used_at);
