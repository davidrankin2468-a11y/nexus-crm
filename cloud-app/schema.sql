-- Nexus CRM secure cloud alpha — 2026-11-16
-- All business data is scoped by tenant_id. Never use the public demo's browser storage for real data.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','employee')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE TABLE IF NOT EXISTS bootstrap_tokens (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  rate_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_started INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL CHECK(length(name)>0),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title)>0),
  status TEXT NOT NULL CHECK(status IN ('Planned','Scheduled','In Progress','On Hold','Completed','Cancelled')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents>=0),
  scheduled_date TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(tenant_id, customer_id) REFERENCES customers(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id,created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(tenant_id,customer_id);
