# Nexus POS + CRM — Vercel preview readiness (development only)

This file documents the **final deployment gate**. Do **not** merge pull request #1 into `main`, promote a deployment, enable charges, or migrate production data without explicit owner approval.

## Current pre-deployment checklist — verified November 18, 2026

**Scope:** prepare the software, sandbox, and development database **before the final Vercel preview acceptance step**. Production release is a separate approval and is not authorized.

**Status key:** `[x]` completed/verified, `[ ]` not yet completed. A completed *foundation* is not the same as a tested commercial product.

| Checked | Work item | Current verified outcome / next action |
| --- | --- | --- |
| [x] | Five-tab CRM + POS source | Finance includes the POS workflows; original CRM source preserved. |
| [x] | GitHub branch and review | `feature/nexus-pos-crm-foundation`, draft PR #1, no merge to `main`. |
| [x] | Automated testing | `Nexus POS checks` and `Vercel POS backend checks` passed on the source commit before this checklist edit. They are not substitutes for a live browser test. |
| [x] | Development POS databases | Cloudflare D1 staging tested using fictional records; Supabase development POS schema has RLS. No production POS migration was applied. |
| [x] | Fictional company records | Two QA company records exist in Supabase development, each linked to its own confirmed test user with owner role. |
| [x] | Vercel POS code and mobile page | Secure invite-only development page `/pos-secure`, authenticated API routes, company authorization, inventory audit and unpaid receipt source implemented. Not yet verified live at the current PR commit. |
| [x] | Vercel non-secret environment settings | `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` set for **Preview** and this feature branch only. |
| [x] | License/subscription *database foundation* | Development license-plan, company-license and audit tables exist, RLS is enabled, user reads are revoked; no active licenses/plans or subscription processing. |
| [x] | Square sandbox groundwork and mocked payment contracts | HMAC/input validation, 45-character idempotency limits, payment payload, decline/pending outcomes and amount/location checks passed automated tests. No real provider transaction. See [Square test report](SQUARE_SANDBOX_TEST_REPORT.md). |
| [x] | Approved development Auth accounts | **Verified.** Supabase development has **2 confirmed Auth accounts**. Live password sign-in is still untested. |
| [x] | Two company owner memberships | **Verified.** The 2 confirmed test accounts each have an **owner** membership in a different fictional QA company. |
| [x] | Supabase database RLS/tenant isolation | **Test passed:** simulated sessions for A and B each saw their own company and temporary product only; attempts to read the other company returned 0 rows. Simulated employee read had 0 protected products. All test inserts and employee-role changes were rolled back. |
| [ ] | Live browser/API tenant isolation | Still pending: password login, API credential test, cross-company product/sale/receipt requests, token expiry, and employee denial at the deployed host. Database-level tests do not prove this full flow. |
| [x] | Supabase privileged server credential *configuration* | Vercel variable `SUPABASE_SERVICE_ROLE_KEY` exists as **Sensitive**, scoped only to **Preview** on this development branch. **Its secret value and actual backend connectivity remain untested**; no preview redeploy triggered. |
| [x] | Square Sandbox developer app/test location | **Confirmed by owner screenshots:** developer app and Default Test Account location exist. Full Location ID is clipped and must be copied directly. |
| [ ] | Square Sandbox credentials for backend | **Blocked — owner action:** add protected `SQUARE_SANDBOX_ACCESS_TOKEN` and `SQUARE_SANDBOX_LOCATION_ID` to Vercel **Preview** (this branch only). Sandbox mode variable is already configured. No key values were retrieved. |
| [ ] | Full Square payment integration | Offline mock contracts pass; live provider calls, signature-verified webhook receiver, durable event deduplication, settlement reconciliation, failed-payment handling and safe refunds remain unimplemented. No real or sandbox charges run. |
| [ ] | Subscriptions and commercial license enforcement | Not implemented. Design plan catalog, monthly vs one-time entitlements, activation/expiry, company provisioning, webhook reconciliation, revocation and isolation. The database alone does not grant a working license. |
| [ ] | Tax/receipt/accounting readiness | No calculated sales tax, compliant finalized receipts, or production financial reconciliation yet. Pilot receipts explicitly say **pending/unpaid**. |
| [ ] | Operational/security release audit | MFA, authentication abuse limits, restore test, access monitoring, privacy/support policies, accessibility, mobile testing and payment safety review still needed. |
| [ ] | Updated Cloudflare preview verified | The Cloudflare preview for the latest prior commit was **queued**, not confirmed successful. Older preview deployments exist; verify the deployed SHA before claiming it includes new changes. |
| [ ] | Final Vercel *preview* deployment & browser acceptance | **Keep last.** Earlier Vercel previews exist, but none verified against the current PR head. After other gates, confirm preview SHA, sign-in, tenant isolation, unpaid checkout, prints, mobile UX, auth failure modes and no card charges. |
| [ ] | Commercial production launch | Not authorized. Requires successful preview testing, payment/tax readiness, separate production controls and explicit owner approval. |

### Square sandbox test report — November 18, 2026
- [Full report with test outcomes and credential blockers](SQUARE_SANDBOX_TEST_REPORT.md).
- Developer Sandbox application, test account and location exist (from owner's Square Console screenshots); full Location ID not captured.
- Sandbox-only payment construction, HMAC, decline/error, amount/location mismatch and retry-key tests pass in GitHub; no outbound Square API calls.
- Vercel Preview config now includes `SQUARE_ENVIRONMENT=sandbox`. Square token and location ID are not configured yet.
- Square `CreatePayment` idempotency length corrected to 45 characters.
- **Not complete**: authenticated sandbox provider requests, real provider-side deduplication, durable webhook reconciliation, refund flows, recurring licenses, hosted callback delivery.

### Verification — database tenant isolation test, November 18, 2026

Executed read-only Supabase RLS checks under the database role `authenticated` with each confirmed test account's JWT subject simulated. For product-level checks, generated *fictional* company-specific test rows inside explicit SQL transactions, switched to `authenticated`, checked visibility, then issued `ROLLBACK`. Also temporarily changed an existing owner membership to `employee` **within a rollback-only transaction** to verify POS product denial.

- User A: Company A visible, Company B hidden; own temporary product visible (1), other company's product hidden (0).
- User B: Company B visible, Company A hidden; own temporary product visible (1), other company's product hidden (0).
- Simulated employee: company membership visible, protected POS product rows invisible (0).
- Verification after rollback: **0 leftover temporary products, 2 unchanged owner memberships, 0 employees, 0 sales**.
- GitHub regression suites already passed; database RLS pass **does not** validate user password login, the private server key's value, receipt/sale IDOR checks through the deployed API or real Square payment flows.
- The landscape test account still uses a domain resembling `@gamil.com` as of this check; correct it from the Auth dashboard if intended to be `@gmail.com`.

### Latest observed deployment and account notes
- GitHub PR: [Nexus POS + CRM #1](https://github.com/davidrankin2468-a11y/nexus-crm/pull/1). Draft, mergeable, production branch unchanged.
- Vercel has older automatic preview deployments marked `READY`; this **does not mean the current development commit was deployed or that the POS backend is configured**.
- Vercel project `nexus-crm-ikol` now has **3 scoped Preview variables**: Supabase URL, publishable key and a Sensitive `SUPABASE_SERVICE_ROLE_KEY`. This only verifies configuration metadata; correctness of the protected secret cannot be checked until a server connection test. No production variable remains for that key.
- Supabase development counts verified: **2 confirmed Auth users, 2 fictional QA companies, 2 owner memberships**; 0 license plans, 0 licenses, 0 license events. The second test account's email may contain a typo in the domain. Owner should check it in the Authentication panel rather than changing `auth.users` via SQL.
- Cloudflare `nexus-crm-secure` latest development deployment was **queued**. Continue to use a previously *successful* preview for observational tests until a newer commit is confirmed deployed.
- Alerts: existing **Nexus POS Blocker Alerts** watch checks for new or materially changed blockers; do not repeat unresolved unchanged problems.

### User action needed before authenticated live testing
1. **Completed:** Two confirmed development Auth accounts exist and have separate company owner memberships. Review the second account's email spelling in Supabase Authentication and confirm credentials through a real sign-in after the preview is deployed. Do not share passwords in chat.
2. **Configured; backend value not yet validated:** Sensitive `SUPABASE_SERVICE_ROLE_KEY` is present in Vercel Preview on the development branch. Do not reveal or paste it into chat. Verify server connectivity on the final preview.
3. **Sandbox developer app/location exist.** Configure protected `SQUARE_SANDBOX_ACCESS_TOKEN` and complete `SQUARE_SANDBOX_LOCATION_ID` on the feature Preview branch; do not reveal either in chat. `SQUARE_ENVIRONMENT=sandbox` is already present. Webhook URL/signature await the reachable preview.

## Intended architecture
- Source: `davidrankin2468-a11y/nexus-crm`, branch `feature/nexus-pos-crm-foundation`.
- Final preview host: Vercel project `nexus-crm-ikol`, team `nexus-e992`; no production target.
- Secure browser pilot: `/pos-secure`. Existing fictional-data public `/pos` demo stays separate.
- Backend: `/api/pos/*` Vercel serverless functions.
- Database/Auth: *development* Supabase project `xmjelakwxnewqalqzktm`, with RLS on all `nexus_*` tables.
- The existing Cloudflare Pages/D1 preview remains available for test comparison. Its sessions and D1 tables are **not** interchangeable with Supabase accounts.

## Code already prepared
- Invite-only Supabase Auth email/password login. No public signup.
- Approved owner/admin company selection; each subsequent API request verifies membership again.
- Company-scoped inventory, pending/unpaid sales, and itemized read-only receipts.
- Supabase atomic create-product/opening-stock RPC, and atomic POS sale/stock/audit RPC.
- Session-scoped checkout retry reference; no duplicate sale if a response is lost.
- No card collection, payment settlement, sales tax computation, real refunds, or recurring subscriptions.
- Mobile-friendly POS page. Browser holds the short-lived access token in memory, not in persistent storage.

## Pre-deployment blockers requiring owner/provider setup

### 1. Supabase private server credential (mandatory)
In Vercel **nexus-crm-ikol > Settings > Environment Variables**, set `SUPABASE_SERVICE_ROLE_KEY` to the **Supabase development project's backend service-role/secret key**, target **Preview** only and scoped to `feature/nexus-pos-crm-foundation`. Use an **encrypted or sensitive** variable, never a public/client variable.

Do not paste the value into ChatGPT, a GitHub issue, source code, or a demo HTML page.

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are already populated in Vercel for this preview branch. Confirm they still point to the development project before deploy. New `sb_secret_*` keys go in the `SUPABASE_SERVICE_ROLE_KEY` variable even though the variable has a legacy name; the server sends new keys in the `apikey` header, not as a JWT.

### 2. Two development Auth accounts and company memberships — COMPLETED; browser tests pending
Two confirmed Supabase development Auth accounts were assigned **owner** membership to **different fictional QA companies**. Assignments were read back from the database and independently verified; no passwords were accessed or committed to GitHub.

**Still required:** test both passwords on a live secure preview, verify the accounts cannot view each other's products or receipts, and check that a third employee-role account has no privileged POS access. Review the second test user's email spelling in the Supabase Auth dashboard; do not directly edit Auth system tables.

### 3. Preview deployment limit/availability
Previously seen Vercel blockers: `build-rate-limit` and API deployment limit HTTP 402. When cleared and blockers 1–2 are resolved, deploy **preview only** from this feature branch and verify the deployment SHA equals the PR head.

## Automated tests that must pass
- GitHub `Nexus POS checks`: Cloudflare D1 schema, API security, checkout retries, company-isolated SQLite transactions and rollbacks.
- GitHub `Vercel POS backend checks`: Vercel API syntax, auth, company member filtering, Supabase RPC calls, receipt isolation, secure browser source syntax.
- Supabase development RLS grants: anonymous cannot read POS inventory; ordinary users cannot directly run service RPCs; service role can.

## First live Vercel preview smoke test
After the final **preview** deployment (not production):
1. `GET /api/pos/status` returns 200 and `configured` (no credentials in its response).
2. `GET /api/pos/products` without bearer token returns 401.
3. `/pos-secure` opens on phone, preserves the **Sign in to Nexus CRM** heading, and invites only approved accounts.
4. User A signs in; sees company A, adds a fictional product with opening stock, and checks the inventory movement ledger.
5. User B signs in; sees company B only and cannot access company A's product, sale, or receipt IDs.
6. User A records an unpaid sale; verifies stock decreases once, receipt shows line items, and total is unpaid.
7. Retry the same idempotency key; verify same sale ID and unchanged stock.
8. Test insufficient stock, invalid amounts, duplicate SKU, cross-origin POST, employee denial, token expiration, mobile form fields, and printable receipt.
9. Verify no payment charge and no customer production data changed.

## New development preparation (November 18, 2026)

- Added two **fictional** companies directly to the development Supabase `nexus_companies` table. These companies do not have user memberships, so live login cannot be verified yet. Never insert fake identities directly into `auth.users`.
- Applied `supabase/sql/nexus_license_development_foundation.sql` to the development project only. This adds a private license plan catalog, company-scoped license records, and unique/idempotent license-event audit records. New plans default `enabled = false`, new licenses default `pending`, and anonymous/authenticated clients cannot directly query any of these tables.
- Added **isolated Square sandbox preparation** in `lib/nexus-square-sandbox.js` with exact raw-body webhook HMAC-SHA256 verification and a disabled-payments status endpoint `/api/square/sandbox-status`. There is no payment creation/refund endpoint and no live webhook receiver yet; both need real sandbox credentials, secure backend mapping, reconciliation, and live host testing.
- GitHub tests include `tests/test_square_sandbox.mjs` and check that no production payment API URL is used.
- Payment provider source: [Square sandbox payments](https://developer.squareup.com/docs/devtools/sandbox/payments), [webhook signature verification](https://developer.squareup.com/docs/webhooks/step3validate).

### Additional owner-only tasks
1. **Completed:** Two approved development Auth users are connected to separate fictional companies as owners. The second test email address may contain a typo. Verify password sign-in before live testing and do not use real customer records.
2. Enter the development project's private Supabase service-role/secret key directly into Vercel's encrypted **Preview** branch-scoped `SUPABASE_SERVICE_ROLE_KEY`. Do not paste secrets into ChatGPT, GitHub, or source.
3. **Sandbox application is created.** `SQUARE_ENVIRONMENT=sandbox` is configured. Add `SQUARE_SANDBOX_ACCESS_TOKEN` and the complete `SQUARE_SANDBOX_LOCATION_ID` privately to Vercel Preview on this branch. Add the webhook signing key and exact HTTPS URL only after the hosted callback is prepared. Do not use production tokens.
4. Do not enable real payments or deploy the Vercel preview until pre-deploy security checks and all owner-only configuration are complete.

## After staging acceptance, before commercial launch
- Square **sandbox** only; connect/test webhooks, payment intent status, settlement reconciliation, partial/full refunds, disputes, PCI-safe tokenization, and tax rules in target jurisdictions.
- Subscription/license entitlements and automated company provisioning, separate from the owner's private Command Center.
- Secure login policy (MFA), credential rate limits, backup/restore, monitoring, incident response, and privacy policies.
- Independent audit and explicit owner approval before **production**.

## Links
- Draft pull request: https://github.com/davidrankin2468-a11y/nexus-crm/pull/1
- Cloudflare staging project: `nexus-crm-secure`
- Vercel preview project: `nexus-crm-ikol`
