-- Apply once after a verified staging backup and before deploying API/UI.
ALTER TABLE jobs ADD COLUMN site_address TEXT NOT NULL DEFAULT '' CHECK(length(site_address)<=300);
ALTER TABLE jobs ADD COLUMN site_instructions TEXT NOT NULL DEFAULT '' CHECK(length(site_instructions)<=1500);
ALTER TABLE jobs ADD COLUMN crew_lead_id TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_crew_lead ON jobs(tenant_id,crew_lead_id);
