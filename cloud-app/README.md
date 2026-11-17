# Nexus CRM 3.0 — Invitation-only Multi-Company Pilot

The five-tab private CRM now has **Management → Companies** for the Nexus platform operator and one-time invitation acceptance for first owners of separate companies. The upgrade uses the existing D1 database and free Pages hosting. No public sign-up, automated email verification, subscription checkout, MFA or production certification is enabled.

**Full guide:** [Nexus CRM 3.0 multi-company pilot](MULTI_COMPANY_PILOT.md)

**Current verified checks:** Migration applied, SQL syntax and guarded invitation operations verified on production D1 using non-mutating checks, and source/UI syntax checks passed. A real two-account signed-in isolation test is still required before production access. Use only fictional test records.

---


## 2.9 — Zero-subscription security and backup enhancements (November 16, 2026)

- **Management → Backups** now provides a password-verified **portable encrypted download** of an existing recovery snapshot to the owner's phone or computer. Records are encrypted entirely in the browser with AES-256-GCM; the *separate* backup passphrase does not leave the device.
- **Verify an encrypted backup file** decrypts the downloaded file locally and checks business-table counts. It does not upload the file.
- **Management → Security** has a change-password form requiring the old password and a new password of at least 14 characters. A successful change revokes other active sessions. Do not try changing your password as a casual test.
- The **Management → Sales Leads** feature is restricted by a dedicated `platform_operators` database table. Future customer tenant owners do not automatically receive access to platform-wide prospect inquiries.
- `migrations/005_platform_operator.sql` has been applied, retaining one existing Nexus platform operator.
- No paid Cloudflare subscription, billing provider, email service or R2 storage was activated for these upgrades.
- Source branch `before-free-safety-upgrades-2026-11` preserves the previous state.
- [Portable backup procedure and file format](PORTABLE_BACKUPS.md).

### Checks performed

An isolated mobile Chromium test passed 9 checks: backup download and verification controls, password-change form, five-tab navigation, platform-only sales access, no horizontal overflow, fictional AES-GCM backup creation, and successful local decryption. The temporary test asset was deleted after validation. These are **interface/cryptography checks**, not independent security certification. Real authenticated download and password-update flows should be exercised by the owner on the actual session. No existing CRM company records were modified.

### Important limitations

The exported encrypted archive is a **manual, user-held independent copy**, not an automatically scheduled off-site backup. The CRM does not yet import encrypted archive files: recovery from a downloaded archive requires a supported future import tool or assisted data reconstruction. Automated off-site backups, MFA, multi-company enrollment/tenant isolation penetration testing, a complete production security assessment, legal/privacy review, support and paid billing still block a public commercial release.

---

# Nexus CRM 2.9 — Secure Cloud Alpha (Free Security Upgrades)

Live secured application: **https://nexus-crm-secure.pages.dev**

Separate public fictional-data demo: https://nexus-crm-preview.pages.dev

The five top-level tabs remain **Dashboard, Customers, Operations, Finance, Management**. The secure app uses Cloudflare Pages Functions and D1 with company-scoped records and owner authorization. This is **not yet a commercial-production security-certified system**; continue using fictional test data.

## Current cloud features

- Owner sign-in/out, PBKDF2 password hashes, HTTP-only secure session cookies, same-origin and CSRF checks
- Customer and job records persisted in D1
- Employee directory and appointment scheduling persisted in D1
- Finance: estimates, invoices, manual bookkeeping payments, report totals, print views and CSV exports
- **Management → Backups:** owner can create an in-app snapshot, list prior snapshots, verify integrity and preview counts, and optionally recover missing business records after password and typed confirmation
- **Management → Security:** owner can view a recent action log, active-session count, and revoke other sessions with their password

## Backups and recovery — important limitations

- The database is on D1 **production** storage. Cloudflare's built-in D1 Time Travel supports **up to 30 days** of point-in-time recovery and does not require configuring scheduled jobs. Recovery through D1 Time Travel restores the **database**, not a selected tenant, and should be performed carefully in Cloudflare's administration tools.
- `backup_snapshots` are snapshots **inside the same database** as the CRM. They preserve seven business tables: customers, employees, jobs, estimates, invoices, appointments, payments. They do **not** store users, passwords, login tokens, sessions, or authentication keys.
- A SHA-256 checksum is stored with each snapshot and verified before preview/recovery.
- Owner-triggered in-app recovery runs in **missing-record-only** mode: it inserts absent records but does not overwrite changed records or remove newer records. It is **not** equivalent to point-in-time rollback.
- Each recovery attempt creates a **pre-recovery checkpoint**. D1 batch writes aim to restore a consistent set of missing records atomically.
- For this alpha, a maximum of 30 in-app snapshots per company and 250 records per single recovery operation is supported.
- Independent/off-site R2 storage is **not configured**. Cloudflare returned "Please enable R2 through the Cloudflare Dashboard" when checked. R2 requires enabling a subscription, which we have not done because the user prefers the free setup.
- These snapshots are created **manually** via the Management page; D1 Time Travel is the automatic recovery mechanism. Do not mistake the two.
- Production-ready independent encrypted backups, scheduled copy-out, retention policies, external disaster-recovery drills, and automated database integrity monitoring are still future milestones.

## Security audit and access limits

- Snapshot creation, preview, and recovery require an authenticated **owner** session; recovery additionally requires the owner password and an exact confirmation phrase.
- Sessions can be revoked on other devices without signing out the current one; this also requires the password.
- Business changes produce owner/company-scoped audit entries, excluding customer field values and passwords. Prior changes before this upgrade will not appear retrospectively.
- No MFA, staff logins/invitations, account recovery, comprehensive role permissions, or external penetration/security audit is implemented yet.
- New migration: `migrations/004_recovery_audit.sql`; prior migrations 002 and 003 stay intact.

## Validation of upgrade

- Git branch `backup-secure-cloud-2-6-before-recovery` preserves the previous source state.
- `migrations/004_recovery_audit.sql` was applied additively without changing existing business records.
- First private recovery snapshot created and checksum verified; no source-controlled customer data or credentials.
- Database-level recovery rehearsal in a **disposable separate test tenant** recovered all seven record types, rejected duplicate repeated restores through insert-ignore, then deleted the disposable test data.
- Management Backups, Security, and recovery-preview interfaces passed a local rendering smoke check.
- This does **not** replace full authenticated on-phone end-to-end testing of the live recovery endpoints. Users should only test snapshot creation and preview first, not restore their actual records unnecessarily.

## Remaining production requirements

Independent encrypted backups to storage outside D1; MFA and recovery; per-role permission tests; formal cross-tenant isolation tests; full user-journey E2E mobile tests; true offline edit queue/sync with Windows; billing/licensing; operational monitoring.

**Never commit private company data, passwords, API tokens, or backup JSON to the public GitHub repository.**
