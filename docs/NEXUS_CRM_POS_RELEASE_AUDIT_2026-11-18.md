# Nexus CRM + POS — Development and release audit

**Updated:** November 18, 2026 (America/Chicago)  
**Status:** **INTEGRATED DEVELOPMENT PILOT — NOT COMMERCIAL PRODUCTION APPROVED**  
**Branch:** `feature/nexus-pos-crm-foundation`  
**Draft PR:** https://github.com/davidrankin2468-a11y/nexus-crm/pull/1  
**Isolated Cloudflare preview:** https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/  
**Cloudflare staging D1:** `156852c4-c056-408f-84b2-1d305c94993e`  
**Vercel project retained:** `nexus-crm-ikol` (separate Supabase development architecture)

## Delivered and tested

1. **Original Nexus CRM retained:** five navigation tabs — Dashboard, Customers, Operations, Finance, Management — with POS inside Finance rather than a separately sold or separately authenticated checkout app. Dashboard has an Open POS shortcut.
2. **Existing Cloudflare CRM authentication reused:** POS routes use the same `__Host-nexuscrm` secure session cookie, tenant derived from the user session, owner/admin authorization and origin + CSRF checks for mutations. Employee/anonymous access denied in isolated tests.
3. **POS operations:** company-specific inventory, unpaid sales, pending retry keys, company-scoped customer association, sales reports, and explicit pending/unpaid wording. No Square or real card charge is executed.
4. **CRM customer association:** POS checkout optionally links a real customer from the user's CRM; API checks that the customer belongs to the session tenant. Staging D1 migration `011_pos_customer_tenant_integrity.sql` also guards inserts and updates against cross-company references.
5. **Safe unpaid checkout cancellation:** owner/admin can void a pending sale; migration `013_pos_void_pending_stock.sql` atomically restores reserved quantities only on the first pending-to-voided transition. Repeat requests are idempotent. This is **not** a card refund.
6. **Licensing groundwork:** `012_license_catalog_staging.sql` creates unpublished **draft** monthly CRM plans at $49, $99, $149, with company license and event audit tables. `014_license_event_tenant_guard.sql` prevents cross-tenant license-event references. Licensing screen is read-only. No licenses activated or subscriptions created.
7. **Encrypted POS data export:** company owner only can download products, sales, sale items, inventory movements, refunds, and event records. Browser encrypts with PBKDF2-SHA256 + AES-256-GCM; the separate passphrase never leaves the device. The existing encrypted backup verification page supports CRM and POS export formats. **POS import and combined restore remain unimplemented.** CRM's existing snapshots continue to cover the original seven CRM business tables.
8. **Test protection:** GitHub suites cover authentication, tenant access, company customer binding, stock decrement, duplicate retry, stock constraints, unpaid sale void and idempotency, license-event deduplication, draft-only license plans, and owner-only POS export. SQLite integration uses in-memory fictional data, not live customers.
9. **Cloudflare live smoke:** read-only external GitHub Actions test at `.github/workflows/cloudflare-live-preview.yml` checks the hosted preview, D1 health, anonymous access denial, disabled payments, five-tab UI, license UI, POS export access denial and **exact Git blob hash match** for the three shipped CRM/POS code files. This guards against a stale manual Worker snapshot.
10. **Deployment isolation:** dedicated Cloudflare Worker `nexus-crm-pos-integrated-preview` is enabled on workers.dev with staging-only D1. Original Cloudflare Pages project/production D1, Vercel project/variables, Square Production and customer data were not changed.

## Verified database state (development only)

- Staging D1: **1** test Auth account, **3** tenant records, **0** POS sales, **0** POS products, **0** tenant licenses, **0** published plans, **3** proposed unpublished monthly plans.
- Staging D1 customer guard, void trigger and licensing event guard have been applied without customer-data mutations.
- Supabase development database separately contains tenant isolation and Square Sandbox payment/event schemas. That Supabase database is **not automatically synchronized** with Cloudflare D1.
- Cloudflare source Worker includes **no Square merchant token** and no enabled card-processing endpoint.

## Commercial-release blockers — not completed

| Priority | Area | Required result / existing blocker |
| --- | --- | --- |
| P0 | **Actual owner and two-company browser sign-in** | Test real interactive sign-ins, session expiry, account recovery, owner/admin/employee roles, cross-company requests and mobile layouts against the latest preview with authorized test users. Only anonymous hosted smoke and in-memory authenticated tests passed. |
| P0 | **Merchant Square integration** | Commercial POS customers must connect their **own** Square merchant account via secure OAuth. The Nexus Software Solutions seller account is separate, for software subscriptions/licenses. Per-tenant OAuth token encryption, revocation, merchant/location matching and provider-side settlement have not been implemented or verified. |
| P0 | **Payment and refund certification** | Validate Square Sandbox CreatePayment, tokenized cards, provider idempotency, failed/declined/pending statuses, raw signed webhooks, durable event deduplication, reconciliation, full/partial refunds and chargebacks. Current Square tests are mocks and read-only preflight construction; **no real Sandbox API payment or refund has been run**. |
| P0 | **One authoritative backend** | Existing private CRM runs on Cloudflare D1; Vercel feature branch uses separate Supabase development schema/login. Do **not** point both at live customers or imply they share records. Choose a canonical database and execute a reviewed migration/sync plan before advertising a Vercel clone of the same data. |
| P0 | **Tax, compliant receipt and accounting workflows** | Determine sales tax by jurisdiction and software/POS product type, refund and tax adjustment rules, finalized receipts, audit trails, financial reconciliation and reporting. Current checkout disallows client tax and records sales as **pending/unpaid**. |
| P0 | **Operational security** | Preview MFA secret must be set as a protected environment secret without copying the production MFA secret. Test Auth, rate limits, session revocation, security monitoring and vendor OAuth scopes. Obtain independent review for commercial launch. |
| P1 | **Backup and restore** | Finish safe combined CRM+POS encrypted restore and test a full disaster recovery procedure. POS encrypted export is downloadable/locally verifiable but not automatically importable. Maintain independent offline backups and documented retention. |
| P1 | **Billing and licensing enforcement** | Publish owner-approved plan names/prices and any one-time offer, connect Square seller billing and entitlement issuance to verified provider events, handle past-due/renewals/cancellation/license revocation and tamper resistance. Draft database/management UI does not activate commercial licensing. |
| P1 | **Customer onboarding and operations** | Custom company branding, industry templates, support workflow, privacy/security notices, deployment rollback tests, backups and maintenance, payment policies, accessibility testing and user acceptance. |
| P1 | **Vercel deployment** | `nexus-crm-ikol` is still rate limited (GitHub status `Deployment rate limited — retry in 24 hours` on November 18, 2026). Latest source not verified as a running Vercel preview; Square/Supabase Preview env presence does not prove credential values or backend correctness. |
| P1 | **Supabase security advisory** | Development Auth has leaked-password protection disabled. Review https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection before any Supabase production login. Deliberate server-only RLS tables with no client policies are informational advisories, not automatically exploitable. |

## Production guardrails

- **Do not** merge draft PR #1 into `main`, deploy to production, activate a license, charge a real customer or migrate the production CRM D1 without separate release approval and documented tests.
- Preserve **one private Nexus Command Center** for Nexus Software Solutions; customer tenants receive only the purchased software, not personal headquarters access.
- Never copy sensitive Square or Supabase keys into source code, test logs, chat, browser bundles or public repos. Use scoped secret variables in the intended hosting environment only.
- Staging Cloudflare Worker updates are **manual snapshots** of the GitHub feature branch, not automatically promoted from `nexus-crm-secure` Pages. Live blob-hash test flags any mismatch.
- All observed trial sales and subscriptions remain disabled by default. Security/regulatory and end-to-end acceptance remain necessary before commercial use.

## Reproducible test links

- [POS unit and SQLite integration checks](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/pos-checks.yml)
- [Vercel POS sandbox mock checks](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/vercel-pos-checks.yml)
- [Live Cloudflare CRM+POS smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/cloudflare-live-preview.yml)
- [Square pre-deployment report](SQUARE_SANDBOX_TEST_REPORT.md)
- [Vercel preview readiness checklist](VERCEL_POS_PREVIEW_READINESS.md)
