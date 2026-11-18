# Nexus POS + CRM — Vercel preview readiness (development only)

This file documents the **final deployment gate**. Do **not** merge pull request #1 into `main`, promote a deployment, enable charges, or migrate production data without explicit owner approval.

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

### 2. Two development Auth accounts and company memberships (mandatory)
In **Supabase development project > Authentication > Users**, create two approved fictional testing accounts. Use test emails and no real customer data. Verify email/password Auth works. Create two *development* `nexus_companies` and `nexus_company_members` records; assign each account to a different company as owner/admin. Do this from trusted Supabase admin tools, not from the web client. Never use fake user IDs that bypass `auth.users` foreign keys.

Confirm a third employee membership cannot access POS. Test account passwords must not go into GitHub.

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

## After staging acceptance, before commercial launch
- Square **sandbox** only; connect/test webhooks, payment intent status, settlement reconciliation, partial/full refunds, disputes, PCI-safe tokenization, and tax rules in target jurisdictions.
- Subscription/license entitlements and automated company provisioning, separate from the owner's private Command Center.
- Secure login policy (MFA), credential rate limits, backup/restore, monitoring, incident response, and privacy policies.
- Independent audit and explicit owner approval before **production**.

## Links
- Draft pull request: https://github.com/davidrankin2468-a11y/nexus-crm/pull/1
- Cloudflare staging project: `nexus-crm-secure`
- Vercel preview project: `nexus-crm-ikol`
