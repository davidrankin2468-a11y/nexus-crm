# Nexus CRM + POS — customer readiness before payment activation

**Reviewed November 19, 2026 (America/Chicago).**  
**Release decision: NOT YET CUSTOMER-PRODUCTION READY.**  
**Scope:** `feature/nexus-pos-crm-foundation`; isolated Cloudflare Worker `nexus-crm-pos-integrated-preview`; development/staging D1. No real customer charges or subscription enrollments.

## Owner-approved sequence

1. **Customer experience before payments.** Finish and verify company invitations, true email ownership/activation, owner-admin-employee roles, account recovery, accessible desktop/mobile workflow, company data isolation, and full CRM/POS usability. This phase stays invite-only and test-data-only.
2. **Production operations without charging.** Verify first scheduled encrypted R2 snapshot, restore the **actual** encrypted archive into a clean isolated database and document the procedure, preserve a recovery key in independent access-controlled storage, test secrets/rotations, monitoring, support/incident workflow, data retention/deletion/export, account deactivation, and rollback.
3. **Payment lanes in parallel but not active.** Connect and verify two distinct Square merchant integrations: Nexus Software Solutions' software subscriptions/licenses, and each customer company's POS receipts through that company's authorized Square merchant. Do not reuse merchant tokens or routing across companies.
4. **Final release approval.** Validate authorized Sandbox provider transactions, tax/receipt/refund behavior, subscriptions and entitlements, legal policies, actual owner UAT and qualified security review. Publish prices and enable live transactions only after a separate explicit owner approval.

## Latest onboarding progress — Nov 19, 2026

- **Transactional email foundation implemented** in `cloud-app/functions/api/invitation-mailer.js`; uses provider-verified sender, protected `RESEND_API_KEY`, strict HTTPS origin and private single-use URL fragments. No provider secret is stored in the repository.
- **Owner and staff invitations support opt-in `deliveryMode:"email"`** behind configuration gates. When sender credentials are absent the API returns 503 **before creating an invitation**. If a configured provider rejects delivery, the newly issued invitation is revoked. On successful provider acceptance, the HTTP response omits the invitation token. Existing password-protected manual pilot invitations still work.
- **Production manual invitations can be disabled** by setting `REQUIRE_VERIFIED_INVITATION_EMAIL="true"` after the sending service and domain are verified. Do **not** enable it in the current pilot until delivery works. The current preview has **no connected email-sending provider** and does not send customer email.
- **Tests added** for HTML escaping, strict HTTPS/no-open-redirect link formation, staff-versus-company invitation routing, fake provider acceptance/failure, owner-only issuing, no raw token in delivered-email API responses, revoked provider-failure invitations, and rejection when email service is not configured. CI uses fake network transport and fictional data.
- **Cloudflare integrated staging Worker updated** with optional mailer module and all seven original secret/database bindings retained. No real customer activation or payments were enabled.
- **Passing verification:** [full POS and CRM regression](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44662309052) and [live Cloudflare smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44662308882).
- **Still blocked on owner/vendor configuration:** Verified transactional sender domain and provider account/API key. A provider accepting a message for delivery is **not** proof the email reached the mailbox; run real delivery and link-acceptance UAT after setup.

## Evening hardening — Nov 19, 2026

- Added **additive, non-destructive** database migration `015_invitation_delivery_provenance.sql` on staging D1, adding `delivery_mode` (`manual` or `email`) to company and staff invitations, defaulting older links to `manual`. No active invitations existed when applied and no business records were edited.
- When `REQUIRE_VERIFIED_INVITATION_EMAIL="true"` is later configured, **legacy manual company and staff invitations are refused at redemption**, even if they were generated before verified-email onboarding was enforced. This closes a bypass of the earlier create-only policy. Pilot mode remains unchanged while the flag is not enabled.
- Added isolated regression cases verifying old manual invitations cannot be redeemed under the strict commercial flag, that attempted redemptions leave the invitation unredeemed, and that previously tested opt-in email invites record their delivery method. All test data is fictional.
- Staged and deployed the compatible seven-module Cloudflare CRM+POS preview Worker, preserving all seven existing bindings including MFA and Square sandbox secrets. Staging D1 `PRAGMA quick_check` returned `ok` with no foreign-key violations.
- Latest [CRM/POS security regressions](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44668705345) and [read-only live Cloudflare smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44668705301) **passed**.
- Midnight backup Worker and schedule are **unchanged** (`0 5 * * *` and `0 6 * * *` UTC, guarded to one midnight America/Chicago execution). The first daily automatic encrypted snapshot is **not yet verified**.
- **Not a claim of verified recipient ownership:** Email sender/domain still not connected. Provider acceptance alone is not proof of delivery to or control of the mailbox. Do not enable strict commercial onboarding until these checks and owner acceptance have passed.

## Customer-facing gate — evidence and remaining checks

| Gate | Current evidence | Decision |
| --- | --- | --- |
| CRM dashboard, customers, jobs, operations, estimates, invoices | Existing in-memory tests and staging UI | **Automated regression passed**; latest real-user multi-browser UAT still required |
| POS product catalog, stock, sale replay/void, CRM association | Integrated SQLite regression, POS tests, live smoke | **Automated regression passed**; completed paid checkout not yet approved |
| Cross-company data isolation | Auth/session API tests, POS relational integrity, two-company fixtures and previous manual owner checks | **Passed within test scope**; repeat authenticated live company A/B UAT on final customer build |
| Login, MFA, recovery | Existing tests and owner manual tests | **Passed within test scope**; enforce/verify paying-owner MFA, email ownership and recovery before public signup |
| New company self-service/onboarding | Invitation APIs exist but no verified outbound email or proof-of-control acceptance flow | **BLOCKED** until email sender and onboarding UAT verified |
| Licensing | Draft $49/$99/$149 plans only, billing disabled | **BLOCKED**: subscriptions, entitlement enforcement, renewals, cancellation |
| Backup readiness | Verified R2 manual encrypted export and fictional isolated restore | **PARTIAL**: first midnight scheduled object and exact real-archive isolated restore still unverified |
| Privacy/support/deletion | Policies and support workflow not published and reviewed | **BLOCKED** for commercial launch |
| Custom domains, responsive UI/accessibility | Staging preview and prior mobile smoke | **PARTIAL**: owner domain and complete mobile/accessibility UAT required |
| Square production payment | Disabled in live preview, Sandbox regressions pass | **BLOCKED** intentionally; do not enable before full customer/business release |

## Strict release controls

- **No automatic or silent conversion** from pilot to production; all customer payments, subscriptions, customer-company onboarding, marketing launch and real-data import remain off.
- Distinguish **Nexus seller account** (software subscription revenue) from **tenant company seller accounts** (POS sales revenue). Each company authorizes its own Square seller connection via OAuth with encrypted token storage.
- Never put real payment card details or API keys into Nexus forms, GitHub files, logs or chat. Use provider-approved tokenization and protected runtime secrets.
- Maintain a single authoritative production database and independently tested tenant isolation. The Vercel/Supabase development backend is not automatically synced with Cloudflare/D1.
- Preserve existing Nexus CRM/POS records and all MFA and backup encryption keys. No destructive restore against active databases.
- Payment readiness helpers under `lib/nexus-dual-payment-release.js` are **non-executable safety scaffolding**; `liveChargesEnabled` and `subscriptionBillingEnabled` remain `false` even when all checklist booleans are supplied. Test: `tests/test_customer_payment_launch_gates.mjs`.
- A passing CI run is not proof of end-to-end merchant connectivity, email delivery, qualified penetration testing, real settlement, customer consent, or legal compliance.

## How to verify

- [Integrated POS + CRM regression workflow](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/pos-checks.yml)
- [Live staging smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/workflows/cloudflare-live-preview.yml)
- [Customer payment segregation and fail-closed tests](../tests/test_customer_payment_launch_gates.mjs)
- [Launch gate checklist](CLOUDFLARE_COMMERCIAL_RELEASE_GATE.md)

**Next practical work:** verified email invitation/onboarding first, then full real-backup restore/monitoring. Both payment pathways can be implemented and tested in isolation while these gates are addressed, but remain incapable of charging real customers until the owner gives a separate approval.
