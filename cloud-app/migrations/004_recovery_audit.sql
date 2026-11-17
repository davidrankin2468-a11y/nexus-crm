-- Migration 004 — Nexus CRM cloud recovery and security (additive, no existing records changed).
-- In-app snapshots live in the same D1 database; independent disaster recovery relies on D1 Time Travel.
-- Never include credentials, login sessions, personal account data, or tokens in snapshots.
CREATE TABLE IF NOT EXISTS backup_snapshots (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version=1),
 note TEXT NOT NULL DEFAULT '',
 counts_json TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_backups_tenant_created ON backup_snapshots(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS security_audit (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 category TEXT NOT NULL,
 action TEXT NOT NULL,
 resource_id TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_audit_tenant_created ON security_audit(tenant_id,created_at DESC);
