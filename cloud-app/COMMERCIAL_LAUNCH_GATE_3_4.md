# Nexus CRM 3.4 — Security Release & Commercial Launch Gate

**Updated:** November 16, 2026 (America/Chicago)  
**Live private pilot:** https://nexus-crm-secure.pages.dev/  
**Passing regression run:** https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44018729663  
**Preserved pre-upgrade backup branch:** `backup-before-mfa-launch-controls-3-4`

## Released and verified

- **Encrypted authenticator-app MFA (TOTP):** An owner, Admin or Employee can enroll under their existing Account Security screen, using a time-based authenticator app. The owner uses **Management → Security**; a staff member uses **My Account**. Staff permission checks remain server-side.
- **MFA secret handling:** A random 20-byte secret is stored as AES-256-GCM ciphertext with a random IV and authenticated per-user context. The independent 32-byte `MFA_MASTER_KEY` is configured as a **secret Cloudflare Pages production environment variable**, not in GitHub or the user database. No real user is automatically enrolled.
- **Password + second-factor sign-in:** Password validation for an MFA-enrolled account returns a short-lived challenge **without a session cookie**. An authenticator code is then required to issue the session.
- **Anti-replay:** Codes are limited to six digits, checked with ±1 time step, and cannot reuse a previously consumed time step. MFA challenges expire after five minutes and are single use. Verification attempts are rate-limited.
- **Enrollment and account recovery:** Activating MFA revokes other sessions. Existing one-time recovery codes may be used to reset a forgotten password; this also disables lost MFA and invalidates pending MFA challenges and all sessions. Each recovery code is consumed upon use. The owner must securely save recovery codes in advance.
- **Browser security headers:** Hardened static and JSON endpoints with anti-framing, HSTS, content sniffing controls, same-origin response isolation and restrictive Content Security Policy.
- **Automated regressions:** **16/16 GitHub Actions test groups passed** with Node.js and isolated in-memory SQLite, including two fictitious companies, role permissions, cross-company data and backups, invoices and payments, invitation expiry and replay, MFA enrollment and login, token replay, and lost-authenticator recovery.
- **Live mobile smoke checks:** **11/11 at 390px** and **11/11 at 320px** passed for MFA UI, the private API version, access controls and no page overflow.
- **Cloudflare Pages:** Latest deployment successful. D1 and Leads bindings intact. Existing record counts unchanged (1 company, 1 owner account, 2 customers, 2 jobs, 1 estimate, 1 invoice, 1 payment). **0 active MFA enrollments and 0 MFA login challenges**, so the existing account's current sign-in is unaffected.

## How to activate authenticator protection — owner

1. Open https://nexus-crm-secure.pages.dev/ and sign in using the existing owner login.
2. Open **Management → Security**. First, generate and securely save the **eight one-time recovery codes** if you have not already done so. Never publish or send these codes to support.
3. Open **Enable authenticator protection**, confirm the account password and generate a setup key.
4. In a compatible authenticator app, add a time-based account and manually enter the private setup key. An Android phone is sufficient; a laptop is not required.
5. Enter the current six-digit authenticator code in Nexus CRM to complete enrollment.
6. On subsequent fresh logins, enter password and then the authenticator code. Codes expire approximately every 30 seconds.
7. If the authenticator is lost, use **Use a saved recovery code** at sign-in to reset the password; recovery also disables the lost MFA seed so a new authenticator can be enrolled.

**Do not activate MFA until recovery codes are saved securely.** This is still a controlled pilot, not a commercial security certification.

## Important remaining blockers — not completed

| Commercial launch requirement | Current status | Action needed |
| --- | --- | --- |
| Independent, automated, encrypted off-site backups and independent restore drill | **Blocked** | R2 is **not enabled** in the Cloudflare account. Cloudflare API returned `403 Please enable R2 through the Cloudflare Dashboard`. Account owner must activate R2 and review any billing requirements; then configure an isolated private bucket, binding and scheduled/verified restore workflow |
| Card payments, recurring subscriptions and one-time license purchases | **Not connected** | Connect and verify **one** business payment account (recommended Stripe) and agree on actual product prices and refund/cancellation terms. Do not take payments through CRM's bookkeeping payment fields |
| Verified email ownership and transaction emails | **Not connected** | Domain plus DNS and a verified outbound mail service are required for invitation verification and secure provider-managed recovery |
| Owned product domain | **Not purchased/configured** | Owner selects and purchases the available domain; connect it to Cloudflare Pages and verify HTTPS/DNS |
| Production account onboarding and customer-data policy | **Not cleared** | Signed-in live/staging account isolation drills, MFA/recovery reviews, support/abuse policies and independent professional security review |
| Legal, tax and sales setup | **Owner/business approval required** | Review and approve legal entity, merchant bank details, privacy policy, subscriptions/terms, taxes, retention, data export/deletion and customer support responsibilities |

The above blockers are dependencies, not missing buttons that can safely be activated without the owner's provider configuration and business approvals. No domain, paid subscription, billing account, mail sender or R2 service was purchased or enabled in this release.

## What this release does not claim

- This is **not a professional penetration test**, compliance audit, or guarantee that every bug has been found.
- Cloudflare Browser Rendering tests used temporary fictional browser state and **did not log into production as a second company**.
- Automated integration tests used an **isolated in-memory database** with actual API logic, not real customer credentials.
- MFA is **optional enrollment** and is not yet a mandatory onboarding policy for future paying customers.
- Production off-site backups are not available; manually encrypted downloadable exports and same-database recovery snapshots are available, but are **not a substitute** for independent automated disaster recovery.
- Neither a real subscription checkout nor a verified email sender has been activated. Continue using fictional records in the pilot and public demo.

## Safety and continuity

Preserve the five main CRM tabs (Dashboard, Customers, Operations, Finance, Management). Do not remove features or modify the owner's existing customer records. Use the isolated GitHub regression workflow on every deployment; keep the saved backup branch available for rollback. Ensure the `MFA_MASTER_KEY` Cloudflare secret is securely preserved during platform changes—losing it makes existing encrypted authenticator seeds inaccessible and requires recovery.
