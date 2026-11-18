-- DEV/STAGING ONLY. Proposed prices are NOT an offer or an active billing plan.
-- No purchase is processed; a license cannot activate without future verified billing reconciliation.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS nexus_license_plan_catalog (
 code TEXT PRIMARY KEY CHECK(length(code) BETWEEN 3 AND 50),
 label TEXT NOT NULL CHECK(length(label) BETWEEN 2 AND 100),
 price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 billing_period TEXT NOT NULL CHECK(billing_period IN ('monthly','one_time')),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO nexus_license_plan_catalog(code,label,price_cents,currency,billing_period,published,created_at)
VALUES
('crm_starter_monthly_draft','CRM Starter — draft',4900,'USD','monthly',0,0),
('crm_growth_monthly_draft','CRM Growth — draft',9900,'USD','monthly',0,0),
('crm_pro_monthly_draft','CRM Pro — draft',14900,'USD','monthly',0,0);
CREATE TABLE IF NOT EXISTS nexus_tenant_licenses (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
 plan_code TEXT NOT NULL REFERENCES nexus_license_plan_catalog(code),
 status TEXT NOT NULL CHECK(status IN ('pending','trial','active','past_due','suspended','expired','cancelled')),
 provider TEXT CHECK(provider IS NULL OR provider='square'),
 provider_subscription_id TEXT UNIQUE,
 activated_at INTEGER,
 expires_at INTEGER,
 updated_at INTEGER NOT NULL,
 CHECK(status NOT IN ('active','trial') OR activated_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_nexus_tenant_licenses_state ON nexus_tenant_licenses(status,expires_at);
CREATE TABLE IF NOT EXISTS nexus_license_events (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 license_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider='square'),
 provider_event_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
 recorded_at INTEGER NOT NULL,
 UNIQUE(provider,provider_event_id),
 FOREIGN KEY(license_id) REFERENCES nexus_tenant_licenses(id)
);
CREATE INDEX IF NOT EXISTS idx_nexus_license_events_tenant ON nexus_license_events(tenant_id,recorded_at);
-- No company license is activated or created by this migration.
