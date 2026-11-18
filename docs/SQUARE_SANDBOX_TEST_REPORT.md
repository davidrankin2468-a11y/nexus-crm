# Square Sandbox integration — test report

**Date:** 2026-11-18  
**Project:** Nexus POS + CRM (development only)  
**GitHub branch:** `feature/nexus-pos-crm-foundation`  
**Vercel project:** `nexus-crm-ikol` — **Preview branch only**  
**Payments:** Disabled. **No sandbox charges have been submitted**. Production is untouched.

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
| GitHub checks | PASS | Both `Nexus POS checks` and `Vercel POS backend checks` passed for code commit `8e40c4cf8e6ba9a797e849e41dae27d26ccba9b3`. |
| Vercel Square sandbox mode | CONFIGURED | `SQUARE_ENVIRONMENT=sandbox` set in the Vercel Preview environment, scoped to `feature/nexus-pos-crm-foundation`. No Production setting. |
| Actual Square sandbox API request | **BLOCKED** | Sandbox Access Token and full Location ID have not been securely supplied to Vercel. Cannot claim a verified Square API connection. |
| Real webhook delivery | **NOT YET POSSIBLE** | Requires a hosted reachable HTTPS endpoint, webhook subscription/signature key, an event persistence/deduplication handler and replay-safe reconciliation. Final hosted checks wait until Vercel preview acceptance. |
| Live refunds/subscriptions/OAuth multi-seller | NOT IMPLEMENTED/TESTED | Separate scope: Square sandbox refund endpoint, monthly subscription integration, test seller OAuth and independent company settlement accounts. |

## Owner-only blockers to unblock live sandbox testing

1. **Copy the full Sandbox Location ID directly from the Square Locations page** (use its copy option if available). The mobile screenshot shows only a clipped ID. In **Vercel > nexus-crm-ikol > Settings > Environment Variables**, create `SQUARE_SANDBOX_LOCATION_ID` with the complete copied ID, **Preview only**, branch `feature/nexus-pos-crm-foundation`.
2. **Copy the Sandbox Access Token privately from Square Developer > Credentials** into a protected, **Sensitive** Vercel **Preview** variable named `SQUARE_SANDBOX_ACCESS_TOKEN`, same branch. Do **not** put it in screenshots, ChatGPT, GitHub, URLs or logs.
3. **Later, for real webhook testing**, create a Sandbox webhook subscription, and set `SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY` and `SQUARE_SANDBOX_WEBHOOK_URL` with the *exact* public HTTPS callback URL. Wait to choose the URL until the final reachable preview has been prepared.
4. **Do not** enter production Square access tokens or connect a real seller banking/settlement account for sandbox testing.

## Work remaining before the final Vercel preview

- Wire a sandbox-only server payment handler that reads amount and company/location server-side and rejects arbitrary client price/payment input, backed by verified authenticated user/company membership.
- Add a durable database mapping between POS sales and Square payment IDs/transactions with unique event IDs and retry/reconciliation state; reserve payment status as unpaid until verified.
- Connect authentic Square API calls for sandbox success/decline/idempotency and sandbox refunds. Run tests for duplicate events, failures, wrong merchant, replay, and mismatched totals.
- Implement webhook raw-body validation and event deduplication before changing any sale or license state. Hosted callback tests require the final HTTPS preview.
- Keep Square one-time business software billing separate from each customer's POS payment account; commercial onboarding eventually requires per-company Square OAuth.
- Keep GitHub draft PR #1 open; leave all production software, Square Production, and Vercel production settings untouched.

## Official Square references

- Sandbox overview: https://developer.squareup.com/docs/devtools/sandbox/overview
- Locations and sandbox tests: https://developer.squareup.com/docs/devtools/sandbox/testing
- CreatePayment API: https://developer.squareup.com/reference/square/payments-api/create-payment
- Webhook signature verification: https://developer.squareup.com/docs/webhooks/step3validate
