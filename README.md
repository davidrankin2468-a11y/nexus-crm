# Nexus CRM — Nexus Software Solutions

Nexus CRM is a customizable five-workspace business CRM in development for landscaping, painting, construction and other field-service teams.

## Websites

| Website | Audience | Purpose |
| --- | --- | --- |
| **[Public product website](https://nexus-crm-showcase.pages.dev)** | Prospects / businesses | Product overview, fictional-data demo links, optional early-access interest form |
| [Interactive demo](https://nexus-crm-preview.pages.dev) | Anyone | Five tabs with fictional sample records saved in the visitor's browser only |
| [Private secure cloud alpha](https://nexus-crm-secure.pages.dev) | Authorized owner | Cloud D1-backed business data, Finance, recovery, and owner-only Sales Leads dashboard |

**Share the product website with prospective customers, not the private cloud alpha login.**

## Development state

- Public showcase site and basic interest collection are in place. Interest data uses a separate Cloudflare D1 database.
- The signed-in CRM has customers, jobs, employees, appointments, estimates, invoices, payment recording, reports and owner management. A submitted inquiry is not a paid CRM account.
- Commercial billing, public account onboarding, verified multiple-company users, MFA, independent backups and true offline sync are **not ready**.
- The website is in **pre-launch**. We are not accepting payments or granting commercial subscriptions.

## Key references

- [Public website implementation](launch-site/README.md)
- [Sales launch and pricing draft](sales/LAUNCH_PLAN.md)
- [Signed-in cloud alpha and recovery limitations](cloud-app/README.md)
- [Original interactive demo completion notes](docs/DEVELOPMENT_STATUS.md)

## Code and data safety

This GitHub repository is public. It contains only source files and legacy version archives, not the live customer D1 database. **Never commit credentials, tokens, customer lists, private backups or other sensitive data here.**

Cloudflare Pages deployments are triggered from GitHub. The public showcase, demo and private alpha have separate hosting configurations. The interest-collection database is separate from private CRM company records.
