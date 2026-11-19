# Cloudflare-first commercial release gate

Status: NOT READY TO SELL. This checklist is a release gate, not a certification.

## Hosting and separation
- Cloudflare Workers + Static Assets is the target for the commercial app and APIs; keep the existing Vercel integration as a rollback/backup until parity is proven.
- Preserve the public showcase, fictional-data demo, and private alpha as distinct deployments. Never put real customer data in the public demo.
- Keep Supabase Auth and the existing tenant-scoped PostgreSQL data model. Do not migrate customer data into the demo D1 database.
- Port the existing Vercel Node `req,res` handlers to Cloudflare Request/Response handlers behind an adapter, with environment bindings for secrets. Do not copy service-role keys into static assets.
- Confirm CORS, auth, rate limiting, webhook raw-body signatures, deployment rollback, and audit logs on Cloudflare before switching traffic.

## Organized five-tab information architecture
1. **Dashboard** — KPIs, urgent alerts, recent activity, next actions.
2. **Customers** — searchable directory, leads, customer profiles, history.
3. **Operations** — jobs, schedules, employees, time tracking, work orders.
4. **Finance** — estimates, invoices, POS checkout, payments, refunds, reports.
5. **Management** — company profile, staff permissions, subscriptions/licensing, integrations, security and backups.

Keep five top-level tabs; use consistent section headings, search/filter bars, status chips, breadcrumbs, empty states and one primary action per view. Separate operational data from account/billing configuration. Maintain existing features and company-specific branding.

## Release blockers (all must pass)
- [ ] Deploy current GitHub commit to an isolated Cloudflare staging Worker; test every API route and page.
- [ ] Verify tenant isolation across two companies, including direct API access, database RLS and staff roles.
- [ ] Verify end-to-end signup, login, onboarding, password recovery and subscription/license enforcement.
- [ ] Verify Square sandbox charge, idempotency, signed webhooks, atomic reconciliation, partial/full refunds and failure recovery; production payment mode stays disabled until explicit approval.
- [ ] Test complete estimate -> invoice -> checkout -> receipt -> refund workflow without duplicate charges.
- [ ] Validate security headers, secrets, webhook replay handling, rate limits, backups and restore drills.
- [ ] Run browser and mobile regression tests on all five tabs; fix accessibility and data-entry issues.
- [ ] Publish terms, privacy notice, customer support/contact, pricing, cancellation/refund policy and tax/accounting review.
- [ ] Run a final owner acceptance test before marking the commercial service available for purchase.

## Deployment rule
Never overwrite the existing production Cloudflare Pages site or claim commercial readiness until the staging gates above are evidenced by passing tests. Record tested commit, deployment URL, test results and any remaining blockers for each release.
