# Nexus CRM license staging

Cloudflare Pages project: `nexus-crm-license-staging`

Dedicated D1 database: `nexus_crm_full_staging` (156852c4-c056-408f-84b2-1d305c94993e).

This project builds from `feature/nexus-license-manager-foundation` and must never use the production CRM D1 binding. No real customer data or Square credentials are present. License enforcement remains disabled.

Verify successful deployment, database binding, authenticated endpoints and tenant isolation before production rollout.
