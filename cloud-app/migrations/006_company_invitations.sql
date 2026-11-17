-- Migration 006: invitation-only onboarding of separate companies.
-- No existing tenants, users, or business records are modified.
-- The owner invitation is a bearer credential: store only its SHA-256 digest.
CREATE TABLE IF NOT EXISTS company_invitations (
 id TEXT PRIMARY KEY,
 company_name TEXT NOT NULL CHECK(length(company_name) BETWEEN 1 AND 150),
 owner_email TEXT NOT NULL COLLATE NOCASE,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 redeemed_at INTEGER,
 revoked_at INTEGER,
 redeemed_user_id TEXT REFERENCES users(id),
 CHECK(expires_at > created_at),
 CHECK(redeemed_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_company_invites_created ON company_invitations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invites_email ON company_invitations(owner_email,created_at DESC);
