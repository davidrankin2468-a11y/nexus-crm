-- Migration 007: per-company staff invitations (pilot only).
-- Additive; existing company records and owner account remain unchanged.
CREATE TABLE IF NOT EXISTS staff_invitations (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 email TEXT NOT NULL COLLATE NOCASE,
 role TEXT NOT NULL CHECK(role IN ('admin','employee')),
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
CREATE INDEX IF NOT EXISTS idx_staff_invites_tenant ON staff_invitations(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON staff_invitations(tenant_id,email,created_at DESC);
