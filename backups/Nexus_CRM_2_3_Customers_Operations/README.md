# Nexus CRM 2.3 — Customers and Operations

**Backup status: uploaded and verified.** Source-only Windows application derived from Nexus CRM 2.2 Five-Tab UI.

- [Download version 2.3 ZIP](./Nexus_CRM_2_3_Customers_Operations.zip)
- SHA-256: `234d240deda220e6fd0efb0f2e69149287a860c16f339b0a4fd2ab7637b46cb5`
- Size: 31,503 bytes
- Features: five main tabs; customer create/search/edit; create jobs/update status; dashboard company metrics; pre-upgrade 2.3 SQLite backup.
- Tests: Python compilation, customer CRUD, job status workflow, basic tenant isolation, and local sync journal smoke tests (Flask shim, not a complete Windows execution test).
- Contains no local SQLite database, live customer records, password hashes or session keys.
- Vercel is a separate fictional-data demo; it is not connected to your Windows CRM database.

**Warning:** This GitHub repository is public. The source archive is visible to anyone. Use a private repository for confidential software or actual customer backups.
