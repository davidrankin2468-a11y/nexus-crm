# Nexus CRM + POS — Square Sandbox D1 reconciliation milestone
**Branch:** `feature/nexus-pos-crm-foundation`  
**Cloudflare staging Worker:** `nexus-crm-pos-integrated-preview`  
**Live preview:** https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/  
**Deployed Worker version:** `87df01e2-e4e6-48b0-b82c-06bcc433235f`  
**Scope:** Test data and fake Square Sandbox payments only. No production payments.

## Source of truth for reconciliation

- `cloudflare/square-d1-reconciliation.js` — server-side sale preparation, fake Sandbox-only submission, fresh provider verification, and atomic company-scoped reconciliation.
- `cloudflare/migrations/0001_square_sandbox_attempts.sql` — payment attempts and uniqueness.
- `cloudflare/migrations/0002_square_sandbox_reconciliation.sql` — receipt and attempt guards.
- `cloudflare/migrations/0003_square_sandbox_submission_reconcile.sql` — reconciliation after fake Sandbox submission.
- `cloudflare/migrations/0004_square_sandbox_inflight_sale_guards.sql` — blocks voiding in-flight sale and unverified completion.
- `tests/cloudflare-square-reconciliation.test.mjs` — fake source, environment gating, provider verification, timeout, redirect and malformed input tests.
- `tests/test_cloudflare_square_reconciliation_d1.py` — SQLite transaction, tenant isolation, duplicate receipt and rollback tests.

## Worker integration

The staging Worker was updated directly via the Cloudflare API (five modules preserved). To keep the update durable, **sync these changes into the normal Worker deployment source before enabling automated deploys**:

1. Include `square-d1-reconciliation.js` in the Worker bundle.
2. In `pos-api.js`, import `handleSquareSandboxAttempt` from `./square-d1-reconciliation.js`.
3. After existing cookie authentication, owner/admin role checks, same-origin POST check and `X-Nexus-CSRF` enforcement, route:
   - `POST /api/pos/square/sandbox-prepare`
   - `POST /api/pos/square/sandbox-submit`
   - `POST /api/pos/square/sandbox-reconcile`
   - `GET /api/pos/square/sandbox-attempts`

   to `handleSquareSandboxAttempt({path,method,db,env,tenant,body:method==="POST"?await bodyOf(request):{}})`.
4. Keep the existing `GET /api/pos/square/sandbox-connectivity`, `DB` binding, CRM session handling and all four Square secrets unchanged.
5. In `assets.js` app source, Finance → POS → Reports now includes **Prepare Sandbox**, a table of attempts, **Run fake payment**, and a manual verification/reconciliation form. All authenticated writes use the existing same-origin API wrapper with CSRF header.
6. Do not replace the deployed Worker with an older source snapshot, or these changes can be lost.

## Controlled fake payment behavior

- Preparation reads the price, company and sale status from D1; it accepts no browser supplied payment amount.
- The **Run fake payment** UI requires an explicit confirmation. The server uses only Square's documented test value `cnon:card-nonce-ok` and `https://connect.squareupsandbox.com` (never production).
- The payment attempt is claimed before the external request; ambiguous outcomes are marked **unknown** and **must not be resubmitted** automatically.
- After provider response, an independent GET checks the configured merchant via Sandbox Locations API and the exact completed payment, sale reference, amount, currency and location.
- D1 batch atomically inserts one unique payment event, marks that tenant's sale completed and marks the matching attempt reconciled. Triggers prevent duplicate events and partial receipt updates.
- In-flight, unknown and completed-unreconciled attempts block voiding and inventory restocking.
- No real payment cards, card details or production tokens are handled.

## Tested, and what remains

**Passed:** Cloudflare D1 migrations 0001–0004 applied; Cloudflare, Nexus POS and Vercel POS GitHub Actions passed at the final migration test commit. The Worker uploaded successfully; readback showed the D1 binding, four Square secrets, five modules and UI routes. Cloudflare Browser Run opened the preview successfully; anonymous API checks return 401.

**Pending authenticated live Sandbox transaction:** The staging D1 database still has zero sales, zero payment attempts and zero payment events. A signed-in Owner/Admin must create a fictional POS product/sale and use Finance → POS → Reports → Prepare Sandbox → Run fake payment to verify Square's payment-create permission and a real Sandbox reconciliation. This operation creates a **fake Square Sandbox transaction**, never a real charge. Its outcome has not been observed. Do not claim full end-to-end success before that test.

**Future commercial work:** Per-company OAuth settlement accounts, webhook subscription and signature verification, refunds, real billing and production activation are separate milestones. None is enabled here.
