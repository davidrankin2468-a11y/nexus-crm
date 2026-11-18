-- Staging: prevent a license audit event from referencing another company's entitlement.
-- No active licenses or payment actions are created.
CREATE TRIGGER IF NOT EXISTS nexus_license_event_tenant_guard_insert
BEFORE INSERT ON nexus_license_events
WHEN NOT EXISTS(
 SELECT 1 FROM nexus_tenant_licenses
 WHERE id=NEW.license_id AND tenant_id=NEW.tenant_id
)
BEGIN SELECT RAISE(ABORT,'License event belongs to another company'); END;
CREATE TRIGGER IF NOT EXISTS nexus_license_event_tenant_guard_update
BEFORE UPDATE OF tenant_id,license_id ON nexus_license_events
WHEN NOT EXISTS(
 SELECT 1 FROM nexus_tenant_licenses
 WHERE id=NEW.license_id AND tenant_id=NEW.tenant_id
)
BEGIN SELECT RAISE(ABORT,'License event belongs to another company'); END;
