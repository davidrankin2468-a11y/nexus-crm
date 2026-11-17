-- Migration 010: opt-in TOTP MFA and short-lived password-first challenges.
-- MFA secrets are AES-256-GCM encrypted at rest with a Cloudflare Pages secret.
-- Existing owner accounts remain unchanged and are not locked out.
CREATE TABLE IF NOT EXISTS user_mfa (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret_cipher_hex TEXT NOT NULL CHECK(length(secret_cipher_hex)=72),
 secret_iv_hex TEXT NOT NULL CHECK(length(secret_iv_hex)=24),
 created_at INTEGER NOT NULL,
 pending_until INTEGER,
 enabled_at INTEGER,
 last_used_step INTEGER NOT NULL DEFAULT -1,
 CHECK((pending_until IS NULL) <> (enabled_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_user_mfa_enabled ON user_mfa(enabled_at);
CREATE TABLE IF NOT EXISTS mfa_login_challenges (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 CHECK(expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user ON mfa_login_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_expiry ON mfa_login_challenges(expires_at);
