-- Migration 009: owner-controlled deactivation for invited staff.
-- Existing accounts remain active: disabled_at defaults to NULL.
ALTER TABLE users ADD COLUMN disabled_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON users(tenant_id,disabled_at);
