# Nexus CRM 3.1 — Mobile and performance optimization

**Deployed:** https://nexus-crm-secure.pages.dev  
**Upgrade scope:** Existing five-tab cloud alpha, including Management → Companies. No new subscriptions or paid services.

## Improvements

- Core CRM, Finance, owner recovery/security, platform sales inbox, and company onboarding data load **concurrently** after session authentication rather than in a long sequence. Core failures still block the app, but unrelated Finance/Management/Sales failures show their own errors instead of blocking another area.
- Outdated overlapping refreshes are ignored to avoid displaying stale company/session data.
- The five main tabs are arranged into a mobile-friendly grid at small screen widths, with minimum 46-pixel touch targets in the tested viewport.
- All tables have horizontally scrollable, keyboard-focusable containers and mobile swipe guidance.
- Invitation activation checks for an existing signed-in session first and warns users to open the invitation in a separate private/incognito session, avoiding accidental switching of the platform operator's session.
- Mobile form fields use 16px text to avoid Safari automatic zoom, with larger touch controls and compact panels.
- More helpful connection-error text appears when the browser is offline.
- The original account/company ID and database data were left intact; the existing invitation-only pilot rules remain unchanged.

## Verification

- GitHub pre-upgrade branch: `backup-before-multicompany-3-1-optimization`.
- Javascript syntax/runtime smoke checks passed for company management views and the parallel refresh code.
- Live Cloudflare Browser Rendering on a **390px** mobile viewport passed all eight checks: five main tabs, minimum 44px tap targets (measured 46px for each), company invitation form, copy-link control, accessible scrollable tables, no horizontal overflow, non-operator denial, and intact five-tab navigation.
- A follow-up 320px browser verification hit a Cloudflare rate limit and could **not** be confirmed in that run.
- A temporary QA file was removed from the public asset folder after testing.
- No actual customer invitation was created and no two-account authenticated tenant-isolation test was performed during optimization; complete those before enabling real customer data.

## Pilot limitations

Still **not commercially production-ready**. Do not onboard actual companies with sensitive business data until MFA, email verification/account recovery, multi-company penetration/isolation testing, independent backups/restore drills, and legal/billing work are completed.

---

# Nexus CRM 3.0 — Invitation-only multi-company pilot

**Working private alpha:** https://nexus-crm-secure.pages.dev  
**Public product website (share with prospects):** https://nexus-crm-showcase.pages.dev  
**Public fictional-data demo:** https://nexus-crm-preview.pages.dev

Version 3.0 establishes controlled **separate company accounts**. It does **not** turn on public registration, automated onboarding, production customer-data permissions, subscriptions or billing.

## What is now implemented

- Existing user/tenant sessions continue using the same secure HTTP-only cookies and logins.
- Nexus platform operator (existing company owner) sees **Management → Companies**. Other company owners do not.
- A platform operator can create an invitation by entering a new company name, invited owner's email and their own CRM password. The email must not already belong to a CRM account.
- A 256-bit random secret creates a **single-use link** that expires in **three days**. The database stores only its SHA-256 digest.
- The operator must copy and privately deliver that link themselves. **No email is sent automatically**.
- Clicking the link opens a company activation page. The invitee sees the assigned company/email and chooses a 14-character-or-longer password.
- Acceptance creates a new `tenants` record and a first `users` record with the **owner** role, using a single transactional D1 batch.
- The new account signs in using its email and password on the same private website. It has an independent, initially empty workspace for customers, jobs, employees, appointments, Finance and backups. Every business-table request uses the authenticated tenant ID; users cannot select a different tenant ID from the browser.
- The operator can inspect invitation status (Pending, Accepted, Expired, Revoked), revoke unused links with password re-verification and inspect company-level owner/contact and record counts. There is no API to impersonate or manage another company's records.
- Acceptance creates a tenant-scoped audit event; invitation issuance/revocation is audited through the existing action log.
- Five main navigation tabs remain **Dashboard / Customers / Operations / Finance / Management**.

## How to test safely on phone or computer

1. Sign in to https://nexus-crm-secure.pages.dev as the platform owner.
2. Open **Management → Companies**.
3. In **Invite a separate company**, use a fictional test company name and an email address you control **that does not already have a CRM account**. Confirm your owner password to generate the invitation.
4. Select **Copy invitation link**. The URL contains `/#invite=<64-character-secret>` as a URL fragment. Keep it private. The secret disappears from the address bar when opened.
5. Open the link on a **different browser, private/incognito tab, or different device**, so you don't accidentally switch your own platform-owner sign-in to the test company's account.
6. Choose a strong new company-owner password, confirm it and activate.
7. In the test account, verify the customer and job lists start empty. Add **fictional records only**, refresh, and confirm that records stay saved.
8. Sign out and sign back in with that test owner's email and password. Verify that **Management → Companies** and **Sales Leads** are not shown for that user.
9. Return to the platform owner's own sign-in and verify that the original company's customer and job records are unchanged.

Don't send an invitation link to a paying customer until the remaining security and production-readiness requirements below have been completed. The **public showcase and interactive demo** remain the correct shareable links.

## Security properties and limits

- No public unauthenticated company creation: only a platform-owner password-confirmed invitation can create a new tenant.
- Expiration/revocation is checked both before and inside the redemption transaction.
- Invitation IDs become the tenant IDs, preventing two simultaneous redemptions from creating duplicate companies. A successful redeem consumes the invitation.
- Global account email uniqueness is enforced by the users table. Login resolves the company from the authenticated user; the client cannot specify tenant scope.
- Login/signup throttling and same-origin checks are inherited from the secure alpha.
- Active invitation count limited to 25 for controlled testing.
- No invite link is persisted in browser localStorage and only the digest exists in D1. The plaintext invite is returned once at creation.
- **Limitations:** possession of an invite link is not the same as verifying the mailbox. Invite delivery is manual. No MFA, password reset email, staff user accounts, automated abuse monitoring, formal penetration testing, validated off-site restoration or complete security audit is implemented.
- An invitation can be redeemed from any device holding the link; keep links private and revoke unused ones when necessary.

## Implementation

- Schema migration: `migrations/006_company_invitations.sql`
- API routes:
  - `POST /api/invitations/preview` — publicly reachable with a valid secret only
  - `POST /api/invitations/accept` — creates the invited company owner once
  - `GET /api/platform/invitations` — platform operator only
  - `POST /api/platform/invitations` — platform operator with password re-verification
  - `POST /api/platform/invitations/:id/revoke` — platform operator with password re-verification
  - `GET /api/platform/companies` — platform operator only, metadata/counts
- The API and front-end stay in the existing `cloud-app` Pages project. No new paid hosting service, storage product or AI model was required.

## Validation performed

- Saved Git branch `backup-before-multicompany-3-0-2026-11-16` before making code changes.
- Ran the schema migration on the existing D1 database. Existing company/user/customer/job counts stayed unchanged.
- Parsed the updated API and browser JS for syntax errors.
- Static interface checks confirm that the new company-invite form, copy action, pending link and unauthorized-owner guard are present.
- Real D1 **EXPLAIN** checks for invitation issuance, guarded tenant/user insertion, invitation consumption, revocation and company-scoped queries all succeeded.
- **Not yet completed:** live authenticated two-company onboarding and full cross-tenant attack tests using separately signed-in browser accounts. These are required before production release.

## Next security/build milestones

1. Controlled QA using two separate test-company accounts, including cross-company ID tampering, CSRF, invitation expiration, concurrency, and replay scenarios.
2. Mailbox verification, recovery and MFA before real customer onboarding.
3. Employee/staff invitations with role permissions and per-company access checks.
4. Production backups outside the main D1 database, restore drill and incident-response process.
5. Legal, billing/licensing, monitoring and customer-support readiness.

**Do not commit invitation secrets, login passwords, production backup files or business data to the public GitHub repository.**
