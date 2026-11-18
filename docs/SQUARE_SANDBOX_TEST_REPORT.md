# Square Sandbox integration — test report

**Date:** 2026-11-18  
**Project:** Nexus POS + CRM (development only)  
**GitHub branch:** `feature/nexus-pos-crm-foundation`  
**Vercel project:** `nexus-crm-ikol` — **Preview branch only**  
**Payments:** Disabled. **No sandbox charges have been submitted**. No production deployment or charges. With owner permission, the misplaced **Vercel Production** copy of `SQUARE_SANDBOX_LOCATION_ID` had its value replaced with `DISABLED`; it still exists as a variable and must be deleted in the Vercel UI.

## Additional tests — November 18, 2026

- Created a new **read-only authenticated** Square Sandbox Locations connectivity endpoint, `GET /api/square/sandbox-connectivity`. It requires current Supabase Auth and **owner/admin** company membership and cannot create payments, refunds or subscriptions. The endpoint returns only a safe connection status, never secrets or merchant data.
- Added `tests/test_square_connectivity.mjs`: verifies fixed Sandbox URL `https://connect.squareupsandbox.com/v2/locations`, Square API version `2026-09-16`, token/location success, wrong/inactive locations, 401 failures, malformed and timeout behavior, no Production requests, anonymous/employee denial, and safe owner response.
- Updated the GitHub `Vercel POS backend checks` workflow to run these tests. Latest code tests passed at commit `d4d9ef5968490d2d8508c707f853afa4f4ec9645`.
- `SQUARE_SANDBOX_ACCESS_TOKEN` and `SQUARE_SANDBOX_LOCATION_ID` are now scoped to Vercel **Preview**, along with `SQUARE_ENVIRONMENT=sandbox`. Values remain secret and have not been validated against the live provider.
- **A real Square Sandbox API connection is NOT confirmed**: the current route must run on a deployed authenticated Preview instance after final readiness approval, and the current latest PR version has not been verified at that host. A mock response is not a substitute for a real provider response.
- No automatic deployment was initiated by this work, although existing GitHub integration may create Preview deployments on pushes.

## Subsequent cleanup and database tests — November 18, 2026

- With explicit owner approval, the accidental Vercel **Production**-scoped `SQUARE_SANDBOX_LOCATION_ID` value was overwritten with the literal `DISABLED`. The **Production variable record still exists**: Vercel's connected tools allow edits but currently provide no delete-environment-variable action. The owner must delete **only** that Production entry from Vercel Settings > Environment Variables, preserving the separate correct Preview entry. There is no active Square Production API integration.
- Applied development-only migration `supabase/sql/nexus_square_sandbox_payment_state.sql` to Supabase project `xmjelakwxnewqalqzktm`. It adds tenant-bound payment attempts and webhook event IDs, unique payment idempotency keys, unique provider event IDs, and composite company/transaction foreign keys. Both tables have RLS enabled and are unreadable to ordinary users or anonymous clients.
- Ran **seven rollback-only database acceptance checks** against fictional QA data: same-company payment attempt, same-company webhook event, duplicate idempotency rejection, duplicate webhook event rejection, cross-company sale foreign-key rejection, cross-company webhook foreign-key rejection, and non-USD currency rejection. **All seven passed.**
- Verified after transaction rollback that the development database contains **zero** test sales, sandbox payment attempts and webhook events.
- Both GitHub workflows passed on the migration commit `a4e98803d683e36a94b73d7cca50c4ef4a463d82`.
- Supabase advisory scan: informational `rls_enabled_no_policy` warnings for deliberately private server-only tables; also a warning that leaked-password protection is not enabled in Supabase Auth (review before production).
- Actual read-only Square Sandbox API connectivity and payment/refund APIs **remain unverified** without a running authenticated Preview instance. Never claim a mocked test proves a provider connection.

## Evidence and results

| Check | Result | Evidence and scope |
| --- | --- | --- |
| Square developer application created | CONFIRMED BY OWNER SCREENSHOT | Square Developer Credentials page displayed a Sandbox Application ID and a masked Sandbox Access Token. It was not copied into this repository or chat. |
| Square Sandbox test account exists | CONFIRMED BY OWNER SCREENSHOT | Square Developer > Sandbox test accounts shows Default Test Account (USA). |
| Square Sandbox location exists | CONFIRMED BY OWNER SCREENSHOT | Square Developer > Locations, Sandbox tab, Default Test Account selected, one location row present. The full Location ID is not readable from the screenshot; do **not** guess it. |
| Sandbox-only target URL | PASS — source check | `https://connect.squareupsandbox.com` is the only defined Square origin in the sandbox helper. No payment network calls are implemented in the existing public API. |
| Webhook HMAC-SHA256 verification | PASS — unit tests | Valid signature accepted; changed body, URL, non-HTTPS URL, malformed signature and missing data rejected. No live webhook subscription is configured. |
| Input validation | PASS — unit tests | Rejects non-USD, invalid/negative/non-integer amounts, card number and CVV posted as raw fields. |
| Payment idempotency key length | PASS — updated unit tests | Max 45 chars, matching Square CreatePayment. Request payload builders produce deterministic test retries. **Real provider-side dedup remains untested**. |
| Payment payload | PASS — mocked contract tests | Checks `source_id`, `idempotency_key`, `amount_money` in USD cents, `location_id`, `reference_id`. This builder performs no HTTP requests. |
| Completed payment inspection | PASS — mocked contract tests | Rejects mismatched amount/location and refuses to mark a sale paid; successful synthetic provider response requires later reconciliation. |
| Decline/pending/error behavior | PASS — mocked contract tests | 400 declines and non-completed payments are not treated as completed. |
| GitHub checks | PASS | Both `Nexus POS checks` and `Vercel POS backend checks` passed for commit `d4d9ef5968490d2d8508c707f853afa4f4ec9645` including new read-only connectivity mocks. |
| Vercel Square sandbox mode | CONFIGURED | `SQUARE_ENVIRONMENT=sandbox` set in Vercel Preview scoped to `feature/nexus-pos-crm-foundation`. Production had an unintended sandbox Location ID variable; its value was replaced with `DISABLED`, but the record requires manual deletion. |
| Actual Square sandbox API request | **PENDING** | Token and Location ID are present as **Sensitive** Vercel Preview variables, scoped to the feature branch. Actual value validity remains untested because no current preview connectivity call was made. |
| Real webhook delivery | **NOT YET POSSIBLE** | Requires a hosted reachable HTTPS endpoint, webhook subscription/signature key, an event persistence/deduplication handler and replay-safe reconciliation. Final hosted checks wait until Vercel preview acceptance. |
| Live refunds/subscriptions/OAuth multi-seller | NOT IMPLEMENTED/TESTED | Separate scope: Square sandbox refund endpoint, monthly subscription integration, test seller OAuth and independent company settlement accounts. |

## Owner-only blockers to unblock live sandbox testing

1. **Complete — configuration only:** `SQUARE_SANDBOX_LOCATION_ID` exists as a Sensitive Preview variable scoped to the feature branch. The full value was not revealed or verified.
2. **Complete — configuration only:** `SQUARE_SANDBOX_ACCESS_TOKEN` exists as a Sensitive Preview variable scoped to the feature branch. Never paste or expose its value.
3. **Later, for real webhook testing**, create a Sandbox webhook subscription, and set `SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY` and `SQUARE_SANDBOX_WEBHOOK_URL` with the *exact* public HTTPS callback URL. Wait to choose the URL until the final reachable preview has been prepared.
4. **Cleanup:** The accidental Production-targeted Square Location ID was **overwritten to the literal `DISABLED`** with explicit owner permission. This does not delete the variable. Delete the unused Production entry through Vercel's Environment Variables menu; do not modify its correctly scoped Preview counterpart. Never enter live Square tokens or banking information for these tests.

## Work remaining before the final Vercel preview

- Wire a sandbox-only server payment handler that reads amount and company/location server-side and rejects arbitrary client price/payment input, backed by verified authenticated user/company membership.
- Add a durable database mapping between POS sales and Square payment IDs/transactions with unique event IDs and retry/reconciliation state; reserve payment status as unpaid until verified.
- Connect authentic Square API calls for sandbox success/decline/idempotency and sandbox refunds. Run tests for duplicate events, failures, wrong merchant, replay, and mismatched totals.
- Implement webhook raw-body validation and event deduplication before changing any sale or license state. Hosted callback tests require the final HTTPS preview.
- Keep Square one-time business software billing separate from each customer's POS payment account; commercial onboarding eventually requires per-company Square OAuth.
- Keep GitHub draft PR #1 open. No production deployment or Square Production API calls are authorized. The one approved Vercel Production setting cleanup is recorded above.

## Official Square references

- Sandbox overview: https://developer.squareup.com/docs/devtools/sandbox/overview
- Locations and sandbox tests: https://developer.squareup.com/docs/devtools/sandbox/testing
- CreatePayment API: https://developer.squareup.com/reference/square/payments-api/create-payment
- Webhook signature verification: https://developer.squareup.com/docs/webhooks/step3validate
