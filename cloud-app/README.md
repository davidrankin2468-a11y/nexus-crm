# Nexus CRM 2.6 — Secure Cloud Alpha (Finance upgrade)

## Environments
- **Cloud alpha (login required):** https://nexus-crm-secure.pages.dev
- **Public fictional-data demo (separate):** https://nexus-crm-preview.pages.dev
- Production Cloudflare Pages project: `nexus-crm-secure`
- GitHub repository source root: `cloud-app`, production branch `main`
- Static folder `public`; Cloudflare Pages Functions `functions/api/[[path]].js`
- Cloudflare D1 binding `DB`

## Working features (private cloud records)
- First admin setup, sign-in/out, HTTP-only session cookies, CSRF check, limited login throttling
- Dashboard with counts and job pipeline
- Customer directory: add/edit
- Operations: jobs, employees, appointments, employee assignment, schedules
- **Finance (2.6):** Estimates (Draft/Sent/Accepted/Declined), create invoices manually or from accepted estimates, print-friendly previews, manual payment recording, invoice balances/status, reporting totals, and CSV downloads
- Five main tabs remain Dashboard, Customers, Operations, Finance, Management
- UI is designed for Chrome on Android, tablets, and Windows without ZIP downloads

## Finance behavior and safeguards
- Financial amounts are stored as **integer cents**, never binary floating point in SQL.
- Every financial table includes `tenant_id` and composite company-scoped references.
- Every Finance API route checks authentication and requires owner/admin role; writes require same-origin request plus session-bound CSRF token.
- Estimate conversion is allowed only for an **Accepted** estimate with positive amount; an estimate can be invoiced only once.
- Manual payments use a single conditional SQL insert to reject overpayments. Payments cannot be edited or deleted through this alpha UI.
- Recorded payments are **bookkeeping entries only**. The system does not charge cards, transfer money, or verify deposits.
- Invoice previews do **not** yet support complete legal/tax invoicing, itemized tax, billing email delivery, or accounting integrations.
- Finance queries are fault-isolated from core CRM reads so unavailable Finance APIs do not prevent using Customers or Operations.
- Data migration: `migrations/003_finance.sql` (additive; no existing tables overwritten).

## Verification done during this upgrade
- Cloudflare deployment after the Finance code commit succeeded.
- Migration created estimate/invoice/payment tables and indexes while preserving preexisting customers and jobs.
- Exact SQL paths for estimate listing, invoice listing, payment listing, guarded payment insert and estimate conversion compiled on the real D1 database.
- An isolated fictional test tenant ran end-to-end database checks: estimate create, convert to invoice, partial payment, overpayment rejection, exact balance payment, company separation. All seven checks passed. All temporary finance test records and test company were subsequently deleted.
- A source-level JS UI test rendered all four Finance sections (Estimates, Invoices, Payments, Reports) and conversion form.
- **Not yet verified:** full signed-in mobile interaction using the actual customer session; this must be checked by the user.

## Still required before real business use
- Stronger account recovery, MFA, invitation provisioning, RBAC/security audit and systematic tenant isolation tests
- Structured automated encrypted database backups **and successful restore drills**
- Invoices that meet company/legal/tax requirements and full accounting/integration testing
- Real offline edit queue with sync/concurrency/conflict handling and Windows data migration
- Email delivery, payment processor integration (if desired), licensing and commercial subscription support
- End-to-end production mobile accessibility/regression testing

**Important:** This is a private-login alpha, not yet production-certified. Use fictional test records. Do not put real passwords, customer databases, API tokens or other secrets in the **public** GitHub repository.
