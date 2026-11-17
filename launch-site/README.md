# Nexus CRM — Public Product Website (Pre-launch)

**Share with prospects:** https://nexus-crm-showcase.pages.dev

**Interactive public demo:** https://nexus-crm-preview.pages.dev

**Private signed-in owner CRM:** https://nexus-crm-secure.pages.dev (do not share credentials)

This project is under `launch-site/` and deploys automatically from GitHub `main` to Cloudflare Pages project `nexus-crm-showcase`. Its public root is `launch-site/public`, with Pages Functions under `launch-site/functions`.

## What visitors can do
- Read about five workspaces and service industries.
- Explore a separate interactive fictional-data demo.
- Submit early-access interest using an email, optional business name, industry and brief note with explicit consent.
- Withdraw the interest request using the one-time private receipt from the submission.

## Data isolation
- Public inquiries are stored in an **independent Cloudflare D1 database** through the `LEADS` binding.
- No private CRM customer/job data is exposed in the public website or inquiry API.
- Prospects do not receive a CRM login or commercial account when they submit a request.
- Management → Sales Leads in the private CRM lists inquiries only for the signed-in owner; status updates and deletion require the owner's authenticated session and CSRF token.
- Inquiry database is private and never committed to public GitHub.
- Public submission rate limit and simple bot honeypot are basic safeguards, not a full commercial anti-abuse system.

## Sales status
This website is suitable for sharing a **pre-launch product preview** and collecting pilot interest. It does **not** process purchases, supply paid subscriptions, guarantee business use, or automatically send emails.

Published tier names are proposals. Commercial prices are *not* yet public or binding. Internal plan: [sales/LAUNCH_PLAN.md](../sales/LAUNCH_PLAN.md).

## Security, legal and business readiness before paid launch
- Verify/register your legal business name and domain; configure customer support contact details.
- Independent security testing, multi-company onboarding, MFA, staff role permissions, password recovery and tenant isolation.
- Independent, encrypted off-site backups and restore tests; current D1 in-database snapshots do not count.
- Legal review of privacy notice, website terms and customer SaaS agreement.
- Billing/checkout, server-verified subscriptions and reliable cancellation/data-export flows.
- Clear invoices, tax and payment handling, integrations and support documentation.

**Do not enter real customer data in the public demo.** The authenticated cloud alpha should continue to use fictional test records until reviewed for production security.
