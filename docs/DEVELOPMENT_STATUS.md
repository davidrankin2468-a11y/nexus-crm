# Nexus CRM — Development status (November 16, 2026)

## Current live preview
- Website: https://nexus-crm-preview.pages.dev
- Hosting: Cloudflare Pages; source: `main` of `davidrankin2468-a11y/nexus-crm`
- Automatic deployment on GitHub commits: enabled
- Browser preview version: **2.4**
- Windows source package: **2.3**, stored separately under `backups/Nexus_CRM_2_3_Customers_Operations/`

## Five-tab design — implemented in the public browser preview

| Main tab | Preview features |
| --- | --- |
| Dashboard | Customer/job metrics, recorded payments, outstanding balances, upcoming jobs, activity |
| Customers | Create, search, edit, customer status, linked job history |
| Operations | Create/edit jobs, status, dates, employee assignments; appointment scheduling; employees; time tracking |
| Finance | Create/edit estimates and invoices; convert estimate to invoice; record partial/full payments; reports; CSV export; print-friendly invoice and estimate views |
| Management | Company demo settings, JSON browser-data export/import, reset sample data, security/sync/licensing status |

**Preview data is fictional and lives in each browser's localStorage.** It is not a hosted database and does not synchronize to other devices or the Windows CRM. It does not process real payments or issue legally complete invoices. Do not use it for real customers or passwords.

## Functional smoke tests performed
- Cloudflare Pages deployments verified successful.
- Cloudflare-hosted browser testing: navigation, customer creation and status, job creation, employees, time entry, appointment creation, estimate creation and conversion to invoice, invoice creation/numbering, payment recording, report rendering, and backup/print controls.
- Tests cover the interactive demo only; they do not certify a commercial production system.

## Still required before real business use
- Production-grade authentication, MFA recovery, session controls, CSRF/XSS protections, server-side rate limits, and audit logs
- Hosted database, secure tenant provisioning, comprehensive authorization checks, tenant isolation tests and database migration strategy
- Encryption and access controls for stored documents; private automated backups and tested restores
- A secure API and hybrid Windows/browser synchronization with idempotent event writes and clear conflict resolution
- True disconnected editing and reliable reconnection on multiple devices; no simultaneous unsafe access to the same SQLite database
- Real payment processing and email delivery only after explicit integrations, permissions, validation and business requirements
- Estimates and invoices suitable for actual legal/tax/accounting needs (currently demonstration bookkeeping)
- Commercial licensing, signed entitlements, billing hooks, renewal and offline policies
- Operational monitoring, security review, accessibility/mobile QA, production data import, documentation, support

The existing `CLOUD_DEPLOYMENT_PLAN.md` in the Windows package outlines the hybrid architecture and remains a roadmap—not an assertion that cloud sync is complete.

## Backup and rollback
- Versioned demo HTML backups under `backups/demo_versions/`
- Versioned Windows CRM source packages under `backups/`
- Cloudflare rebuilds automatically from the public GitHub `main` branch; revert a GitHub commit to roll back the demo
- Never commit real SQLite files, passwords, tokens, customer documents, or private backups to this **public** repository

## Operating guidance
1. Request UI or workflow changes in ChatGPT.
2. Review changes in GitHub, and open the stable Cloudflare site after successful deployment.
3. Use the sample records only. Export browser demo JSON before clearing browser data or switching devices.
4. Treat persistent, multi-user cloud CRM and offline sync as subsequent engineering milestones with separate testing.
