-- Nexus License Manager 1.0 foundation. Additive migration; no automatic grants.
CREATE TABLE IF NOT EXISTS license_plans (
  code TEXT PRIMARY KEY CHECK(code IN ('starter','business','premium')),
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL CHECK(monthly_price_cents >= 0),
  max_users INTEGER,
  storage_bytes INTEGER NOT NULL CHECK(storage_bytes >= 0),
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO license_plans VALUES
 ('starter','Starter',4900,3,5368709120,unixepoch()),
 ('business','Business',9900,10,26843545600,unixepoch()),
 ('premium','Premium',14900,NULL,107374182400,unixepoch());
CREATE TABLE IF NOT EXISTS tenant_licenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  plan_code TEXT NOT NULL REFERENCES license_plans(code),
  status TEXT NOT NULL CHECK(status IN ('pending','active','past_due','grace','suspended','canceled','expired')),
  period_start INTEGER,
  period_end INTEGER,
  grace_until INTEGER,
  canceled_at INTEGER,
  export_until INTEGER,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK(provider IN ('manual','square')),
  provider_subscription_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(period_end IS NULL OR period_start IS NOT NULL),
  CHECK(period_end IS NULL OR period_end > period_start)
);
CREATE INDEX IF NOT EXISTS idx_tenant_licenses_tenant ON tenant_licenses(tenant_id,status,period_end);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_licenses_provider ON tenant_licenses(provider,provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS license_entitlements (
  plan_code TEXT NOT NULL REFERENCES license_plans(code),
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  PRIMARY KEY(plan_code,feature_key)
);
INSERT OR IGNORE INTO license_entitlements(plan_code,feature_key,enabled) VALUES
 ('starter','crm',1),('starter','projects',0),('starter','advanced_reports',0),('starter','automation',0),('starter','nexus_ai',0),
 ('business','crm',1),('business','projects',1),('business','advanced_reports',1),('business','automation',1),('business','nexus_ai',0),
 ('premium','crm',1),('premium','projects',1),('premium','advanced_reports',1),('premium','automation',1),('premium','nexus_ai',1);
CREATE TABLE IF NOT EXISTS license_events (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES tenant_licenses(id),
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  event_time INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_license_events_license ON license_events(license_id,event_time);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  provider TEXT NOT NULL CHECK(provider IN ('square')),
  event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  outcome TEXT NOT NULL DEFAULT 'received',
  PRIMARY KEY(provider,event_id)
);
-- The application must validate provider signatures and payment state before changing licenses.
-- No existing tenant is granted or denied access by this migration alone.
