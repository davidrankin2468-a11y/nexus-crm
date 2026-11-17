# Nexus CRM — Security and Functional QA Report

**Audited:** November 16, 2026 (America/Chicago)  
**Private Cloudflare Pages:** https://nexus-crm-secure.pages.dev/  
**Repository:** https://github.com/davidrankin2468-a11y/nexus-crm  
**Final passing GitHub Actions run:** https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44016525440

## Outcome

**PASS within the tested scope; NOT a certification of production security or a guarantee of zero bugs.**

One real backend authorization defect was discovered and corrected:
- Admin and Employee roles passed the early `permitted()` check for their own password and recovery-code routes, but a later blanket owner-only `/api/security/` guard incorrectly rejected these operations.
- Updated the guard to allow a staff member to change their **own** password, generate their **own** recovery codes and check their own remaining codes, while preserving owner-only restrictions for tenant-level security logs, session summary, business backups and other privileged endpoints.
- Verified the corrected behavior in the isolated API integration suite for **both Admin and Employee** roles.

## Continuous automated tests

New, reusable files:
- `cloud-app/tests/security.test.mjs`
- `.github/workflows/crm-security.yml`

The GitHub Action runs on API, migration, test and frontend changes and checks:
- Frontend JavaScript syntax
- API JavaScript syntax
- **14 / 14 passing isolated integration test groups** using Node.js and an ephemeral in-memory SQLite database; no live Cloudflare D1 records or credentials are used

Test groups cover:
1. Public health/status behavior, authentication and initial setup
2. Request origin and CSRF protection
3. Tenant A customers and jobs
4. Platform-only company invitation, activation and token replay denial
5. Tenant B customers, jobs, employees, appointments, estimates, invoices and payments
6. Bidirectional tenant isolation, cross-tenant IDs and denied writes
7. Staff Admin/Employee enrollment, Finance access limits, read-only employee operations, owner-only resources
8. Admin password reset with single-use recovery code, session invalidation and code replay denial
9. Staff deactivation, revoked sessions, blocked login and reactivation
10. Employee self-service security, password rotation and regeneration of recovery codes
11. Revoked and expired invitations cannot create accounts
12. A company cannot access another company's backup snapshot or export
13. Snapshot creation/verification/export, audit log and SQLite integrity
14. The top-level suite organizing all preceding 13 scenarios

Final runner: **14 passed, 0 failed**. Some earlier runner attempts failed because the temporary test harness was being initialized incorrectly; those fixture issues were corrected. They were not product defects.

## Live deployment checks

Cloudflare Browser Rendering was run against the real private CRM website **without signing in, issuing invitations or modifying stored data**.

- **390px mobile viewport:** 41 of 41 checks passed
- **320px mobile viewport:** 41 of 41 checks passed
- Live `/api/health` and `/api/status` returned HTTP 200.
- Anonymous `/api/me`, customers, jobs, invoices, backups, platform companies, security summary and staff users returned **HTTP 401**.
- Anonymous attempt to create a customer returned **HTTP 401**; no record was created.
- API response headers included `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- Dashboard, Customers, Operations, Finance, Management and their subviews rendered at both viewport widths without page-width overflow.
- Customer form expanded on tap; role-specific UI controls and the single Security password form rendered correctly.

The temporary browser QA asset was **deleted** from the production public folder afterward.

## Non-destructive production database checks

Using Cloudflare D1 SQL queries (read only):
- `PRAGMA quick_check`: **ok**
- `PRAGMA foreign_key_check`: **no violations**
- 0 stored tenant-ID mismatches in the joined job/customer, appointment/job, estimate/customer, invoice/customer and payment/invoice relationships.
- Original rows remained: 1 company, 1 account, 2 customers, 2 jobs, 1 estimate, 1 invoice and 1 payment.
- No QA account, test invitation, recovery code or test customer was inserted into the live database.

## Remaining testing and release gates

This was a broad, automated regression audit, but not an exhaustive bug hunt or professional penetration test.

In particular, these remain **unverified/incomplete**:
- Two separate **real Cloudflare-authenticated** company accounts on the live app with malicious cross-tenant ID, role and login testing. The two-company tests above used isolated in-memory SQLite and the actual API handler.
- MFA, verified email address ownership, automated account recovery and abuse prevention at production scale.
- Automated **independent off-site backups**, real restore tests, retention and incident recovery.
- Real Android/iPhone device testing beyond emulated 320px/390px Chromium.
- Load/soak testing, browser accessibility audits, external dependency review, a professional security assessment, incident monitoring, customer support and operational policies.
- Customer subscriptions, licensing, legal/privacy terms and payment-provider integration.

**Recommendation:** Keep the private CRM restricted to controlled testing with fictional records until those production-release gates are complete. Continue using the public showcase/demo for presentations to potential buyers.
