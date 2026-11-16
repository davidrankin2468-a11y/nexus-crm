# Nexus CRM 2.3 — Customers and Operations

Backup of the **source-only Windows application**, based on Nexus CRM 2.2 Five-Tab UI.

- Archive: [Nexus_CRM_2_3_Customers_Operations.zip](./Nexus_CRM_2_3_Customers_Operations.zip)
- SHA-256: `2414fb83a3bd46aedd315cf738a7394ae160ed672e699bf78f2147e0576a5a6a`
- Archive size: 31,468 bytes
- Smoke tests: customer creation, search/edit, job creation/status, company isolation and sync-journal triggers passed using a Flask stub; a complete Flask/Windows launch test still needs to be done on Windows.
- No SQLite database, passwords, or secret-key files are included.
- The public Vercel preview is a separate interactive demo using fictional data.

**WARNING:** The `nexus-crm` GitHub repository is public. Anyone can download the source archive. Consider a separate private repository for confidential product code.
