# Nexus Software Solutions — transactional business email verification

**Checked:** November 19, 2026, America/Chicago.  
**State:** BLOCKED ON OWNED DOMAIN / VERIFIED PROVIDER. No actual send has been performed; customer onboarding must remain a private test pilot.

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
