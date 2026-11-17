-- Migration 003: cloud Finance alpha (non-destructive; no modifications to existing business tables).
-- Money is stored in integer cents. All financial records use tenant-scoped composite references.
CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  estimate_number TEXT NOT NULL,
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 700),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0 AND amount_cents <= 100000000000),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Accepted','Declined')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,estimate_number),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_estimates_tenant ON estimates(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL,
  estimate_id TEXT,
  invoice_number TEXT NOT NULL,
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 700),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 100000000000),
  due_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,invoice_number),
  UNIQUE(tenant_id,estimate_id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,estimate_id) REFERENCES estimates(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id,created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(tenant_id,due_date);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  invoice_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 100000000000),
  paid_date TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('Cash','Check','Bank transfer','Card (external)','Other')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,invoice_id) REFERENCES invoices(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(tenant_id,invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(tenant_id,paid_date);
