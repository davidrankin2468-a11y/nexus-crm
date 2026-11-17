# Nexus CRM — Commercial Readiness & Database Security Check

**Checked:** November 16, 2026  
**Service:** https://nexus-crm-secure.pages.dev  
**Version:** 3.1 multi-company pilot  
**Mode:** Non-destructive, read-only checks of the existing Cloudflare D1 production database.

## Verified on current database

| Check | Result |
| --- | --- |
| `PRAGMA quick_check` | **OK** |
| `PRAGMA foreign_key_check` | **0 violations** |
| Jobs linked to customers from a different company | **0** |
| Appointments linked to jobs from a different company | **0** |
| Estimates linked to customers from a different company | **0** |
| Invoices linked to customers from a different company | **0** |
| Payments linked to invoices from a different company | **0** |
| Existing company count | **1** |
| Existing login count | **1** |
| Existing customer count | **2** |
| Existing job count | **2** |
| Estimates / invoices / payments | **1 / 1 / 1** |
| Employees / appointments | **0 / 0** |
| Outstanding unused company invitations | **0** |

**Interpretation:** Current production data is internally consistent. Because only **one company** currently exists, these checks cannot prove that two independently signed-in companies are isolated. There was no live two-account login/tamper test in this run.

## Remaining security milestones in priority order

1. **True two-company security regression:** provision two disposable test companies with their own credentials. Check reads, writes, guesses of another company's record IDs, list endpoints, file exports, Finance data, audit log, backups, and company administrator endpoints. Test invite expiration, replay, concurrent acceptance and CSRF. Remove all disposable test records after audit.
2. **MFA and secure account recovery:** verified email delivery and recovery links; phishing-resistant methods where practical; rate limits and clear recovery ownership.
3. **Multi-user staff invitations and permissions:** access controls at server level for job/finance/management roles, not only hidden UI elements. Test with multiple users within one tenant and across tenants.
4. **Independent encrypted backups:** automated exports to isolated storage, clear retention, and tested restore without breaking other companies. Current in-D1 snapshots and manually downloaded encrypted archives are helpful but not sufficient for automated commercial disaster recovery.
5. **Operational readiness:** monitoring, error reporting, backups/restore rehearsals, accessibility and mobile device testing, support processes and handling resource quotas/overages.
6. **Commercial readiness:** legal entity/trademark review, SaaS contracts and privacy policies, subscription entitlements, billing provider, taxes, cancellation and customer data export/deletion.

## Demo readiness versus commercial readiness

- **Shareable today:** https://nexus-crm-showcase.pages.dev and https://nexus-crm-preview.pages.dev with fictional test records.
- **Private pilot:** https://nexus-crm-secure.pages.dev, invite-only; should use fictional records.
- **Not ready:** taking subscription payments or onboarding real company data until items above are completed, verified and reviewed.

## Domain and pricing snapshot

Cloudflare Registrar's published **.com** registration and renewal price was **$11.17/year** when checked November 16, 2026: https://pricing.registrar.cloudflare.com/?q=com . Confirm availability, currency, tax and checkout total before purchasing. Cloudflare Pages currently supports custom domains on the Free plan: https://developers.cloudflare.com/pages/configuration/custom-domains/ .

A single domain can support a company website and many subdomains (e.g. `crm.NexusSoftwareUSA.com` and `demo.NexusSoftwareUSA.com`). No extra annual registrar fee is required for each subdomain. Email hosting at a custom domain, payment processing and production scaling may incur separate charges.

**Cloudflare account check:** No DNS zones were listed in the connected account during this audit. That does not establish domain availability or ownership through a different registrar/account; no domain has been purchased or configured during this check.

## Safety notes

- This check did not change production company, customer, invoice, job or user data.
- Cross-tenant security requires multi-account live tests, not only source review and DB constraints.
- Stay within Cloudflare D1 free-plan limits; since September 2026 daily over-limit reads/writes fail until reset or upgrade. Official FAQ: https://developers.cloudflare.com/d1/reference/faq/
- Never publish passwords, invitation tokens, private backup exports or customer records in the public GitHub repository.
