# Nexus CRM + POS — customer readiness before payment activation

**Reviewed November 19, 2026 (America/Chicago).**  
**Release decision: NOT YET CUSTOMER-PRODUCTION READY.**  
**Scope:** `feature/nexus-pos-crm-foundation`; isolated Cloudflare Worker `nexus-crm-pos-integrated-preview`; development/staging D1. No real customer charges or subscription enrollments.

## November 20, 2026: fictional company and staff email pilot readiness

**Completed:** Deployed a separate, private staff invitation test to integrated Cloudflare preview version `65172179-1e24-45cc-ab0d-c2b5e18ef437`, while retaining **`EMAIL_DELIVERY_MODE=disabled`** and the existing protected `RESEND_API_KEY`. The new `EMAIL_STAFF_PILOT_ENABLED=true` configuration authorizes **only** the owner of a `Nexus Email Pilot QA …` company created through the original Gmail-owner pilot. The invited staff recipient is server-derived as a fresh Gmail plus-alias of the original platform operator; callers cannot select a recipient. A valid company-owner password, CSRF, one-use invitation token, 30-minute test throttle, and maximum three pending test staff invitations are enforced. Failed provider attempts revoke their invitations.

**Automated end-to-end security tests:** Operator sends a fictional company invitation, owner redeems it, the pilot owner sends a staff invitation, an employee redeems it, and the test verifies role restrictions (no Finance or platform controls), replay rejection, no cross-company records, and no token leakage in the HTTP response. [Complete regression suite passed](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44746058348). [Live Cloudflare smoke rerun passed after deployment](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44746058226). Staging and independent recovered D1 both reported `quick_check=ok`; original midnight backups untouched.

**Human acceptance remains open:** No fictional company invitation had been sent or accepted on the live staging database as of this check (0 active company-pilot invitations, 0 activated Gmail-pilot companies, 0 pilot-staff invitations). First, the platform operator must sign in to [Nexus preview](https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/) and select **Management → Companies → Business Email Lab → Email a pilot company invitation to my Gmail**. Upon receipt, use its one-time link in a private browser tab and activate the fictional owner. Then, as that owner, select **Management → Team Access → Email a test staff invitation to my Gmail** and activate an employee. Never paste an invitation link or password into chat.

**POS data check:** Staging D1 currently contains four Square Sandbox attempt records (three marked `reconciled`, one `prepared`), six sales (three `completed`, three `voided`), three completed payment events, and **zero** refund records. These are staging records, not independent proof of a live Square Sandbox refund. Completing a provider-verified sandbox payment/refund and webhook replay test remains an explicit commercial release blocker. No production charges enabled.

## November 20, 2026: scheduled encrypted backup independent restore — PASSED

The real 12:00 AM Central R2 archive was decrypted, SHA-256 and AES-GCM authenticated, and restored into a separate Cloudflare D1 database. Independently verified **35 tables, 37 indexes, 12 triggers, 104 archived records, database quick_check=ok, and zero foreign-key violations**. The verified private recovery database was retained for audit; all temporary restore Workers, the Queue and failed test D1 were cleaned up. The original backup Worker, its five bindings, private subdomain setting, and exact midnight cron pair were restored unchanged. No real customer payment capabilities were activated.

See [complete actual R2 recovery PASS report](R2_ACTUAL_ARCHIVE_RESTORE_DRILL_2026-11-20.md). This clears the **actual scheduled-backup restore drill** gate; independent encryption-key escrow and routine recovery rehearsals still remain for commercial operations.

## November 20, 2026: customer-onboarding readiness update

**Verified today**
- `nexussoftwareusa.com` registered and verified for Resend, with Cloudflare Email Routing successfully receiving business email in the owner's Gmail.
- The restricted Resend sender self-test from `notifications@nexussoftwareusa.com` **arrived in the owner's Gmail Inbox** (owner-supplied screenshot, 12:50 AM Central). Actual delivery is verified for this specific self-test, not for invitations to external customers.
- Added a separate, operator-only company invitation pilot route `POST /api/platform/email-invite-pilot` and button in **Management → Companies → Business Email Lab**. It sends a fictional new company invitation exclusively to a unique `+nexus-test-` alias of the authenticated platform operator's own Gmail. The recipient is determined server-side; callers cannot choose another recipient. It requires operator login, CSRF, account password and the existing 30-minute outbound test rate limit.
- For the test route only, the mailer uses a temporary configured Resend environment. **`EMAIL_DELIVERY_MODE=disabled` remains in force for normal customer and staff email.** This is not a public signup flow and creates no paid subscription.
- Automated tests verify the Gmail alias restriction, invitation token only in outbound email (not API response), separate tenant creation, one-time redemption, replay denial, and no access to platform-only company lists. Full [CRM/POS security and integration workflow](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44733102573) and [Cloudflare integrated live smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44733102515) **passed** on the deployed preview source. Previous F2 fault-injection tests also passed.
- Cloudflare staging D1 `PRAGMA quick_check` is `ok`. First scheduled encrypted R2 snapshot is present at `snapshots/v1/2026/11/20/...` (56,379 bytes; created around midnight Central). The backup Worker attempts an encrypted object readback at creation. **Independent restoration of this exact encrypted scheduled archive PASSED** in a clean isolated D1 recovery database on November 20, 2026: 35 tables, 37 indexes, 12 triggers, 104 rows, AES-GCM/SHA-256 checks, `PRAGMA quick_check=ok`, and zero foreign-key violations.
- All preexisting Cloudflare Worker bindings inherited, `RESEND_API_KEY` protected, and R2 midnight backup schedules unchanged.

**Owner's next acceptance step**
1. In the private [integrated preview](https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/), sign in as the platform operator, open **Management → Companies → Business Email Lab**, and use **Email a pilot company invitation to my Gmail** with the Nexus CRM account password.
2. Confirm Gmail receives that invitation addressed to a newly generated plus alias. Open the one-time link in a **private/incognito** browser tab, choose a new test account password, activate the fictional company, and verify it has no records or platform-operator privileges.
3. Report any failure. Only when this manual step passes can the email invitation customer-facing release gate advance. Full staff invitation UAT and real recipient ownership controls remain to be completed separately.

**Remaining commercial blockers:** real authenticated live browser/mobile UAT for two companies; Square Sandbox provider charge, verified webhook and refund flows per authorized merchant (no production charges); subscriptions/tenant entitlements; privacy/terms/refund/tax/support and incident policies; independent security review; owner launch approval. Existing Vercel/Supabase data remains separate from the Cloudflare/D1 private pilot.

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
| Backup readiness | Verified R2 manual encrypted export and fictional isolated restore | **PASS**: first midnight scheduled encrypted R2 archive was independently restored and checked (35 tables / 104 rows); independent key escrow and continuing operational drills remain open |
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

**Next practical work:** verified email invitation/onboarding next, alongside ongoing backup monitoring and independent key escrow. Both payment pathways can be implemented and tested in isolation while these gates are addressed, but remain incapable of charging real customers until the owner gives a separate approval.
