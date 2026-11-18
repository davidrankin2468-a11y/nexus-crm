# Nexus CRM + POS — Preview deployment readiness

**Updated:** November 18, 2026  
**Release status:** Development pilot only; NOT commercially ready  
**Feature branch:** `feature/nexus-pos-crm-foundation`  
**Draft PR:** https://github.com/davidrankin2468-a11y/nexus-crm/pull/1

The **single canonical Nexus CRM customer workspace** currently runs on Cloudflare D1. The Vercel/Supabase development branch is an alternate preview, **not** a data-synchronized replacement. Do not merge to `main`, activate charges, or deploy customer-facing production from this checklist.

## Verified checks

| Check | Result | Evidence |
| --- | --- | --- |
| Original five main CRM tabs with POS inside Finance | PASS | Shared navigation, Dashboard POS shortcut and same CRM cookie; [integrated Cloudflare preview](https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/) |
| Cloudflare preview deployed with staging D1 | PASS | Dedicated Worker `nexus-crm-pos-integrated-preview` at 100%, D1 ID `156852c4-c056-408f-84b2-1d305c94993e`. Original live Pages/D1 production untouched |
| Latest deployed frontend and backend files matched source | PASS | [Read-only live smoke workflow](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44354467190) passed after replay, comparing Git blob hashes from the development branch |
| No anonymous data access | PASS (live smoke) | Actual preview denied anonymous CRM session, POS records, draft licensing and owner-only export; hosted API health passed. This is not a full authenticated penetration test |
| POS company/customer authorization | PASS (isolated tests) | Session-derived tenant, owner/admin roles, CSRF/origin checks, DB customer cross-tenant trigger `011_pos_customer_tenant_integrity.sql` |
| POS unpaid checkout and inventory constraints | PASS (isolated tests) | Company-scoped checkout, retry ID, stock reservation, tenant denial and safe invalid tax rejection. All receipts remain **pending/unpaid** |
| Void pending unpaid sale | PASS (isolated tests) | `013_pos_void_pending_stock.sql` ensures stock is restored once, no refund or charge |
| License catalog and tenant event isolation | PASS (staging foundation) | $49/$99/$149 draft monthly plans unpublished; `012_license_catalog_staging.sql` and `014_license_event_tenant_guard.sql`. No license activated |
| POS encrypted record export | PASS (implementation + isolated access tests) | Owner-only company-scoped export; AES-256-GCM encryption and local verification; manual POS import/recovery not implemented |
| GitHub automated regression suites | PASS on latest tested code | [POS checks](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/pos-checks.yml), [Vercel POS backend checks](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/vercel-pos-checks.yml) |
| Vercel Preview environment scoping | CONFIGURED (value not verified) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, Sensitive `SUPABASE_SERVICE_ROLE_KEY`, `SQUARE_ENVIRONMENT=sandbox`, Sensitive `SQUARE_SANDBOX_ACCESS_TOKEN`, Sensitive `SQUARE_SANDBOX_LOCATION_ID` all scoped to the feature Preview. No Square Production copy |
| Supabase development tenant RLS | PASS (rollback-only SQL) | Two confirmed test users and owner memberships, tenant isolation and Square event dedup constraints checked. Live browser/password authentication still untested |

## Remaining blockers — required for commercial production

- [ ] **Live two-company browser testing:** authenticated interactive login, customer/job/checkout flows, employee denial, cross-company access probes, expired sessions, recovery, desktop and mobile acceptance tests. Current hosted smoke is unauthenticated by design.
- [ ] **Square merchant OAuth:** each client company must use its own merchant settlement account; Nexus Software Solutions uses a separate seller connection for its CRM software subscriptions. Secure company OAuth tokens, revocation, location validation, and provider merchant identity are not implemented.
- [ ] **Real Square Sandbox API tests:** credential presence is not token validation. Test tokenized CreatePayment, provider deduplication, declined/pending outcomes, webhook signing and replay, verified settlement, partial/full refunds and chargebacks. No Sandbox payments or refunds have been issued through Nexus.
- [ ] **Real billing and licensing:** proposed plan table is read-only and unpublished. Finish one-time vs monthly entitlement rules, Square subscription reconciliation, invoices, expiry/suspension, provisioning, tenant-safe license activation, and owner-approved pricing.
- [ ] **Tax and finalized receipts:** current POS tax is intentionally zero/pending. Add jurisdiction-aware tax compliance, refunds/tax adjustments, final fiscal receipts, audit and accounting procedures before charging real customers.
- [ ] **Recovery and security:** POS encrypted export supports local verification, **not** import/restore. Test combined CRM+POS recovery, independent backups, all MFA scenarios, staged signing secret, authentication abuse limits and external security review. Supabase advisor also flags leaked-password protection disabled.
- [ ] **Unify deployment architecture:** Cloudflare D1 and Supabase have separate tenant data and login state. Make an approved single source of truth before saying Vercel and Cloudflare share the same customer records.
- [ ] **Vercel Preview acceptance:** `nexus-crm-ikol` still reports **Deployment rate limited — retry in 24 hours** as of November 18, 2026. Older Vercel builds do not contain the newest source. Wait for a confirmed current feature-branch Preview, then perform protected API and browser tests.
- [ ] **Commercial launch requirements:** legal/accounting/policy review, accessible workflows, support process, password/MFA operation, business bank/payment ownership, pricing approval and production release sign-off.

## Accurate current deployment links

- **Integrated development CRM + POS:** https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/
- **Original Cloudflare Pages live CRM (not altered here):** https://nexus-crm-secure.pages.dev/
- **Separate fictional POS demo (not the intended product):** https://nexus-pos-crm-demo-preview.davidrankin2468.workers.dev/pos
- **Vercel project settings:** https://vercel.com/nexus-e992/nexus-crm-ikol/settings/environment-variables

A Cloudflare Pages preview called `nexus-crm-secure` may remain queued, but the **dedicated integrated development Worker above is deployed and independently smoke-tested**. The Worker deployment is a manually uploaded snapshot, so the live Git blob-hash test must pass again after source changes.

For full evidence, rollback scope, known limitations and test links, see [Nexus CRM + POS release audit](NEXUS_CRM_POS_RELEASE_AUDIT_2026-11-18.md) and [Square Sandbox report](SQUARE_SANDBOX_TEST_REPORT.md).
