-- Nexus CRM public launch interest registration, isolated from private CRM D1.
-- Marketing leads are never stored in GitHub or the public demo browser.
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  company TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL,
  interest_note TEXT NOT NULL DEFAULT '',
  receipt_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Closed')),
  consent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status,created_at DESC);
CREATE TABLE IF NOT EXISTS submission_limits (
  rate_key TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
