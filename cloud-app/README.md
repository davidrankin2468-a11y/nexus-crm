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
