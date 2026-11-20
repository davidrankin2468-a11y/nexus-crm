# Nexus CRM + POS — Actual scheduled encrypted R2 archive restore drill
**Date:** 2026-11-20 (America/Chicago)  
**Decision:** NOT YET VERIFIED — isolated target and recovery code prepared/tested, actual encrypted scheduled archive NOT restored.

## Source object (READ ONLY)
- Source Cloudflare D1: `nexus_crm_full_staging` (`156852c4-c056-408f-84b2-1d305c94993e`).
- Private R2 bucket: `nexus-crm-pos-secure-backups`.
- Scheduled encrypted object: `snapshots/v1/2026/11/20/2026-11-20T06-00-27-724Z-de17f2ac-081a-4baa-bfb0-a73abf1edfd7.aes256gcm` (56,379 bytes; R2 ETag present).
- Snapshot Worker: `nexus-crm-pos-r2-backups`; its `BACKUP_ENCRYPTION_KEY` is a protected Cloudflare secret. The key was **not** retrieved or copied into chat, code or test artifacts.
- Snapshot Worker performs a decrypt/readback check immediately after storing each scheduled archive, but independent restore of this particular archive remains outstanding.

## Isolated restore destination
- New separate D1 database: `nexus_crm_r2_restore_drill_20261120`
- ID: `fc33c2e7-f911-4d31-b4c9-6bd2eabbfca6`.
- Created without changing existing D1 databases; **confirmed empty** on latest verification.

## Implemented and tested
- `cloudflare/nexus-r2-isolated-restore-drill.js`: validates authenticated R2 AES-256-GCM ciphertext and metadata, SHA-256, schema and row totals; creates schema and imports records only into a fresh `RECOVERY_DB`; checks foreign keys, quick_check, table and schema object counts. Does not write to source DB or R2.
- `tests/test_r2_actual_archive_restore.mjs`: encrypted fixture restore into a fresh SQLite database, table/foreign key/index assertions, tampered ciphertext rejection, caller authorization rejection, and refusal to overwrite an already-populated recovery database.
- `cloudflare/nexus-r2-private-restore-once-trigger.js`: proposed private service-binding-only trigger. No public backup endpoint is intended.
- Automated [CRM/POS and recovery tests](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44736400497) **passed**. This is proof of tested recovery code with a synthetic encrypted fixture, **NOT** proof of restoration from the actual R2 archive.

## Execution blocker / safety decision
- An attempt to stage an updated backup Worker with an isolated `RECOVERY_DB` binding and private secret returned an upload response, but the version ID could **not** be retrieved in Cloudflare's subsequent version lookup/list. A temporary trigger script's settings were also not reliably accessible.
- **Therefore, the backup Worker restore version was not deployed and the actual R2 object was not decrypted/restored.** The inactive temporary trigger script was deleted (it did not get a cron schedule). The currently active backup Worker remains its original version `3e3e979b-8c76-4c2a-b833-32512bcc4b95`.
- Original midnight schedules are still `0 5 * * *` and `0 6 * * *` UTC with America/Chicago midnight guard.
- Do not declare full disaster recovery passed until the **actual** R2 encrypted object is decrypted by the Worker with its protected key, written into the isolated D1 database, and its FK/checksum/row/schema checks pass.

## Safe completion plan
1. Establish a reliable way to stage, retrieve and deploy the private Worker recovery version while *strictly inheriting* all existing backup secrets and without changing or publishing the midnight backup Worker.
2. Execute the private one-shot recovery from the pinned encrypted R2 object to the empty isolated D1 (never use the production or integrated staging D1 as the target).
3. Verify `PRAGMA quick_check=ok`, zero rows from `PRAGMA foreign_key_check`, 100% row/table/schema parity with the archive, and exact authenticated SHA-256.
4. Remove all temporary triggers/secrets/bindings and restore the original private backup Worker deployment, then verify its schedule and secure non-public subdomain.
5. Mark backup restore as verified only after the actual isolated D1 recovery contains the decrypted archived records and all checks pass.

No original database or archived R2 object was overwritten during this drill.
