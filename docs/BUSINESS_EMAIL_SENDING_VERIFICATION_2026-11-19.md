# Nexus Software Solutions — transactional business email verification

**Checked:** November 19, 2026, America/Chicago.  
**State:** DOMAIN REGISTERED AND VERIFIED IN RESEND; CRM OUTBOUND PROVIDER CREDENTIALS NOT CONNECTED. No real outbound send has been performed; customer onboarding remains a private test pilot.

## First outbound self-test rejected — safe diagnostics deployed, November 20, 2026

- Owner reported the first self-test returned a generic failure from Resend. **The original provider HTTP status/body was not captured by our API**, so there is no confirmed root cause. Resend domain verified and API secret is present, but these do not prove API key correctness or domain permission.
- Deployed new Worker version `6f503493-4b3f-4fe2-a9fe-3e68afd6b5ba` with allowlisted error messages for Resend HTTP statuses: **401** invalid key; **403** sending domain/permission mismatch; **400/422** message validation; **429** rate limit; **5xx** provider outage; and connection failures. The implementation does not print arbitrary Resend response bodies or credential values.
- Failed provider self-tests now enforce a **2-minute** retry window instead of the 30-minute successful-send cooldown. The previous *failed* test's one staging-only throttle row was shortened to 2 minutes; no customer or business records changed. Owner account password, CSRF, operator role checks, self-recipient restriction, and customer delivery lock remain in effect.
- The updated [CRM/POS test suite](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44688063084) passed, as did rerun [live Cloudflare smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44687962264). Database `PRAGMA quick_check=ok`, all 13 Worker bindings preserved, and the midnight backup schedules unchanged.
- **Next:** Owner may inspect their failed request at [Resend API Logs](https://resend.com/logs) for the exact provider code, or wait at least 2 minutes from the revised cooldown and repeat **Management → Companies → Business Email Lab → Send one test to my email**. Do not share the API key or tokens in screenshots. Report the category shown and whether mail reaches Gmail. Do **not** enable real customer email or payments.

## Outbound API key connected and one-recipient self-test deployed — November 20, 2026

- **Cloudflare Secret confirmed:** `RESEND_API_KEY` is present as a secret on the *integrated preview Worker*, not in source or chat. The secret's value was neither retrieved nor displayed.
- **Dedicated owner-only self-test:** Added `POST /api/platform/email-self-test`, which requires authenticated platform operator access, valid CSRF, owner password confirmation and at most **one attempt per 30 minutes** enforced by staging D1 migration `016_email_self_test_limits.sql`. The recipient is taken directly from the signed-in operator's account email. The request cannot specify another recipient. The test message includes no invitation link/token and cannot provision customer accounts.
- **No customer email enabled:** `EMAIL_DELIVERY_MODE=disabled` remains unchanged; a separate `EMAIL_SELF_TEST_ENABLED=true` flag enables only that one self-test route. `RESEND_FROM=notifications@nexussoftwareusa.com`, `RESEND_SENDER_DOMAIN_VERIFIED=true`, and the preview's existing `PUBLIC_APP_ORIGIN` were preserved.
- **Frontend:** A password-confirmed **Send one test to my email** form is present in the operator-only **Management → Companies → Business Email Lab**. Successful submission reports **provider accepted** only; receipt to Gmail must be independently confirmed by the owner. No send has been initiated by this deployment.
- **Release checks:** [CRM/POS security tests](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44686104272) and rerun [live preview smoke checks](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44686104299) passed. Existing twelve bindings, seven Worker modules, staging database records, and midnight backup schedules were retained. Cloudflare D1 integrity check returned `ok`.
- **Next action:** Owner signs in to [private pilot CRM](https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/), opens **Management → Companies → Business Email Lab**, enters current CRM password, and sends a single self-test. Gmail inbox or Spam arrival and sender authentication still need owner confirmation. Do not enable external customer invitations or real payments as part of this test.

## Cloudflare outbound sender pre-configuration — November 19, 2026

The owner requested full Resend integration; the connected tools cannot create Resend credentials, because Resend is not a connected application. The user must create a Sending-access API key from the Resend dashboard and enter it directly in the Cloudflare Worker as a protected secret. Do not paste the key into chat or source control.

The integrated Cloudflare Worker `nexus-crm-pos-integrated-preview` was updated to version `fade22a0-af50-48c5-ba00-cfc008608a71` with all 7 existing bindings **strictly inherited** and four new non-secret text bindings:

- `EMAIL_DELIVERY_MODE=disabled` (intentionally fail-closed, even if the key is later saved)
- `RESEND_FROM=notifications@nexussoftwareusa.com`
- `RESEND_SENDER_DOMAIN_VERIFIED=true` (based on user-supplied Resend verified screenshot, not an independent Resend API check)
- `PUBLIC_APP_ORIGIN=https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev` (private pilot's current HTTPS origin; not a new commercial public domain)

The Worker contains **no `RESEND_API_KEY` binding**. Cloudflare deployment succeeded; staging D1 `PRAGMA quick_check=ok`, existing private Gmail forwarding `ready`, and original midnight backup schedules `0 5 * * *` / `0 6 * * *` UTC preserved.

**Next safe handoff:** Owner opens https://resend.com/api-keys, creates a Sending-access key scoped to `nexussoftwareusa.com`, copies it privately, and pastes it into the Cloudflare Worker settings **Variables and Secrets → Add → Secret**, name `RESEND_API_KEY`; after they confirm saving it, verify the key exists without reading its value, then enable `EMAIL_DELIVERY_MODE=resend` **only for a controlled self-test**, confirm actual inbox arrival, and leave commercial invitation requirements off until an explicit customer-release approval. Provider acceptance is not proof of email delivery.

## Resend domain verified — owner confirmation, November 19, 2026

- The owner supplied a screenshot of the Resend domain dashboard showing `nexussoftwareusa.com` status **Verified**, `Resend Forge` **Ready**, and the event **Domain verified: Your domain is ready to send emails**.
- Cloudflare DNS already contains the Resend sending CNAME and DKIM records. Cloudflare inbound routing to Gmail remains separate.
- **Important:** The CRM's Cloudflare Worker still has no `RESEND_API_KEY`, `EMAIL_DELIVERY_MODE`, `RESEND_FROM`, `RESEND_SENDER_DOMAIN_VERIFIED`, or `PUBLIC_APP_ORIGIN` binding configured. Business email sending from Nexus CRM is therefore **NOT yet live**.
- Next required action: owner creates a scoped Resend sending API key in Resend and installs it directly as a protected secret in the Cloudflare Worker settings (never in chat, source code, or logs). Following that, configure sender and HTTPS origin, deploy without disturbing existing bindings, and test to a mailbox the owner controls. Do not enable public onboarding or real payments.
- The user's screenshot establishes provider dashboard readiness, **not successful message delivery**, endpoint authentication, email ownership confirmation, or production approval.

## Latest domain and preview status — November 19, 2026, Central time

- **Domain registered and active:** `NexusSoftwareUSA.com` is in the connected Cloudflare Registrar account; registration expires November 19, 2027 (America/Chicago). Auto-renew is currently enabled.
- **Incoming mail tested:** `contact@NexusSoftwareUSA.com` and `support@NexusSoftwareUSA.com` are enabled Cloudflare Email Routing aliases forwarding to the owner's verified Gmail destination. The owner confirmed a successful delivered test to contact@.
- **Resend sending domain:** CNAME records `send.nexussoftwareusa.com` and `rsend.nexussoftwareusa.com` and DKIM TXT `resend._domainkey.nexussoftwareusa.com` are present in Cloudflare DNS. **This is not proof Resend accepted the domain:** the latest user screenshot shows Resend pending its own checks.
- **Business Email Lab live:** private operator-only, no-send preview in the existing Management → Companies CRM tab; does not create customer invites or expose secrets. Latest offline [CRM/POS tests](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44683492842) and rerun [live Cloudflare smoke](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44683492862) passed after preview deployment.
- **No changes to payment gates or midnight backups.** The backed-up Worker cron remains unchanged. No Resend API key or verified production sender has been installed.

## Evidence gathered

- The connected Cloudflare account's **GET /zones returned an empty array**. That does **not** prove the proposed domain is unowned: DNS may be at another registrar/provider.
- The currently deployed Cloudflare Worker `nexus-crm-pos-integrated-preview` has seven existing bindings (D1 DB, MFA and existing sandbox secrets) but no `RESEND_API_KEY` or `RESEND_FROM` configuration. Do **not** log or paste keys.
- `cloud-app/functions/api/invitation-mailer.js` and the invitation APIs support **opt-in transactional sending** only when all provider settings are present. They otherwise reject email-mode invitations before creating records. A provider rejection revokes the newly created invitation.
- The current app cannot prove recipient inbox delivery or email control; Resend returning an API message ID is only *provider acceptance*.

## Step 1 — confirm domain ownership and DNS provider

- Previously proposed business domain: `NexusSoftwareUSA.com`. **Ownership and current registrar are unknown.**
- Ask the owner whether this domain has already been registered, and where DNS is hosted. **Do not purchase or transfer a domain without explicit owner approval.**
- If DNS is outside Cloudflare, we can use the existing DNS host. Domain transfer is not required solely for email.

## Step 2 — connect transactional sender

- Resend is the provider already supported by the code. Create or connect a Resend team account: https://resend.com .
- Add the owned domain (or a transactional sending subdomain, such as `mail.NexusSoftwareUSA.com`) in Resend Domains.
- Use **exactly** the domain-verification DNS records shown in the connected Resend account. Do **not** invent SPF, DKIM, MX or verification tokens. Inspect existing MX/SPF/DMARC before altering DNS so personal/business mail continues working.
- Confirm Resend shows the **sending** capability as verified. Review SPF, DKIM, DMARC alignment; sender should be a branded address such as `notifications@NexusSoftwareUSA.com` on a verified sending domain.
- A verified *sending* identity is distinct from an inbox to receive support replies. Configure a monitored reply-to/support mailbox separately.
- The **Resend free transactional tier** listed at https://resend.com/pricing is $0/month for up to 3,000 emails/month, 100/day and 3 domains (subject to provider changes). Domain registration and mailbox hosting are separate costs if applicable.

## Step 3 — protected Cloudflare settings

Only after domain provider verification:
- `RESEND_API_KEY`: secret binding, write-only, provision securely in Cloudflare; **never share in chat or source control**.
- `EMAIL_DELIVERY_MODE`: text setting `resend`.
- `RESEND_FROM`: address belonging to verified sending domain.
- `RESEND_SENDER_DOMAIN_VERIFIED`: `true` only **after independent provider and DNS verification**.
- `PUBLIC_APP_ORIGIN`: canonical HTTPS origin for invitation links, no path/query; must be owner approved. Current Workers preview is for QA, not customer use.
- Keep `REQUIRE_VERIFIED_INVITATION_EMAIL` **off** until owner acceptance and real test delivery; when enabled, it blocks legacy manual links at redemption.
- Do not overwrite existing D1, MFA, Square sandbox, or backup keys.

## Step 4 — actual end-to-end verification (not yet performed)

1. Verify provider sending status and DNS SPF, DKIM, DMARC, including alignment in headers from a received message.
2. Using only a mailbox owned/authorized by the operator, trigger one **fictional company** invitation with `deliveryMode:"email"`. Check provider response without exposing link/token in logs.
3. Confirm the message physically arrives in the destination inbox; check spam and sender authentication headers. Resend provider acceptance alone is insufficient.
4. Open the link in a private/incognito window. Confirm one-time activation, authenticated account scoped to the newly created fictional tenant, no access to any other company, and replay denied.
5. Test staff invitation, expired or revoked invite, wrong recipient (the invite is a bearer token; sharing it may still allow takeover), sender outage and mail rejection.
6. Confirm delivery failure returns a non-sensitive error, revokes the invitation and does not activate a company.
7. Review owner MFA enrollment, password recovery and account lifecycle, then obtain a separate owner signoff before commercial onboarding.

## Remaining caveat — ownership binding

An emailed bearer invitation link does **not** itself prove the person who clicks it controls the addressed email if the link was shared or forwarded. Stronger production onboarding should use a recipient-bound verification challenge or provider-managed email ownership verification in addition to link possession. Do not describe the current invite flow as independently verifying mailbox control.

**Release decision:** NOT VERIFIED. No live payment, open signup or real customer email is enabled by this guide.
