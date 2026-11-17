# Step 3: Isolated CRM license staging — verified prerequisites

Checked 2026-11-17 via Cloudflare D1 and Pages APIs.

## Verified state
- Production Pages project: `nexus-crm-secure`, production branch `main`.
- Production Pages `DB` binding: `nexus_crm_secure` (786eb65a-fce5-48b3-9a1d-4accab097b78).
- Separate license-only D1: `nexus_crm_license_staging` (9f71ec2e-5317-4aa6-ac42-adfd6002d1f9).
- Production D1 has CRM tables for users, sessions, tenants, customers, jobs, invoices and more, but NO license tables yet.
- License staging D1 has five license tables and only a stub `tenants` table, not the CRM tables.
- Therefore DO NOT change the existing Pages preview `DB` binding to the license-only staging D1. Doing so would make authenticated CRM routes fail.
- Do not run migration 006 against production until backup, review and rollout approval.
- License engine is not enforced; no customers should be blocked.

## Safe implementation sequence
1. Create a separate **full CRM staging D1**, using the version-controlled base CRM schema and migrations, without copying customer personal data.
2. Apply `006_license_manager.sql` on full CRM staging; verify foreign keys, plans, entitlements and schema.
3. Provision a dedicated preview Pages project or isolated preview binding, with `DB` pointing only to full CRM staging. Do not alter production `DB` or production deployment config.
4. Deploy the license feature branch and run authenticated smoke tests on /api/health, /api/auth/me (or actual auth route), /api/license/me, and /api/platform/licenses. Confirm tenant isolation and operator authorization. Pilot mode must remain read-only/non-enforcing.
5. Run `node cloud-app/license-engine.test.mjs` in a Node environment, plus integration tests. Fix issues before production migration.
6. Back up production D1 and review the migration before any production rollout. Square remains disconnected until a signed webhook and idempotency tests are ready.

## Notes
The two D1 databases cannot be treated as interchangeable. A successful Pages build does not verify database compatibility or working API routes.
