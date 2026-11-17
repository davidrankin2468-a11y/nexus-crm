# Nexus CRM 2.5 secure cloud alpha

**This is a new, separate authenticated web application**, not the public fictional-data demo.

- Live alpha: https://nexus-crm-secure.pages.dev
- Public demonstration (unchanged): https://nexus-crm-preview.pages.dev
- Cloudflare Pages Git root: `cloud-app`
- Build command: `exit 0`
- Static assets directory: `public`
- Server code: `functions/api/[[path]].js`
- Database: Cloudflare D1, production binding `DB`
- Admin setup is closed after one use. A one-time code must be provisioned server-side as its SHA-256 hash in D1. Do **not** put the setup code, passwords, API tokens or customer data in this public GitHub repository.
- All writes validate same-origin requests and a session-scoped CSRF value.
- Cookies are Secure, HttpOnly, SameSite=Strict and have a seven-day expiry.
- Passwords use PBKDF2-SHA256 with a per-user random salt. **This does not yet constitute a completed security audit.**
- Customer and job queries scope by authenticated `tenant_id`; there is no cross-company listing or public user signup.
- Login attempts are throttled by hashed user/email and originating IP.
- First phase supports secure setup, login/logout, dashboard, customers and jobs; Finance, personnel, offline sync and backup restore remain intentionally inactive.

**Important:** Do not import real customer information or activate commercial use until an independent security review, MFA/recovery, structured backup/restore and tenant isolation testing are complete. The prior local Windows CRM is unaffected. The public browser demo remains a separate experience.

## Update: Cloud Operations (November 16, 2026)

The first account and cloud test customer/job records have been preserved. The following additional features were deployed to the same secure site:

- Employee directory: add, edit, mark active/inactive, role, phone, email.
- Job appointments: schedule or edit date/time, job, assigned employee, location and notes.
- Operations now contains Jobs, Schedule, Employees subtabs within the five top-level tabs.
- Dashboard includes employee and appointment counts.
- Database migration: `migrations/002_employees_appointments.sql`. This is additive; it does not modify customer/job data.
- Every new API query is tenant-scoped, and write requests require a valid login plus same-origin CSRF verification.

Verification: Cloudflare Pages deployment succeeded; schema and foreign-key insert plans were validated without writing test records; the existing customer/job counts remained unchanged. Anonymous requests for the employee API return 401. Full authenticated mobile interaction testing must still be performed by a signed-in user.

Finance, automated backup/restore, MFA, staff login/invitations, and robust offline sync remain future milestones. This is still an alpha, so continue using test records only.
