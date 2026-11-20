# Nexus CRM + POS — Actual encrypted R2 backup restore drill

**Date:** November 20, 2026 (America/Chicago)  
**Final result: PASS — real scheduled encrypted archive independently restored into isolated D1 and validated.**

## Archived source — read-only

- Source staging D1: `nexus_crm_full_staging` (`156852c4-c056-408f-84b2-1d305c94993e`).
- Private bucket: `nexus-crm-pos-secure-backups`.
- Actual scheduled snapshot: `snapshots/v1/2026/11/20/2026-11-20T06-00-27-724Z-de17f2ac-081a-4baa-bfb0-a73abf1edfd7.aes256gcm` (56,379 bytes).
- Archive timestamp: 2026-11-20 06:00:27.724 UTC (12:00:27 AM Central).
- Archive AES-256-GCM authenticated decryption, archived SHA-256 checksum, expected source/format, encrypted envelope, schema objects, table row totals, and metadata all validated **inside** the backup Worker using its existing protected `BACKUP_ENCRYPTION_KEY`. The secret was not retrieved, printed, or stored in GitHub.
- Original R2 archive remained unchanged throughout the drill.

## Recovered independently into isolated D1

- Successfully restored database: `nexus_crm_r2_restore_drill_20261120_v2`
- D1 ID: `32adbefb-0ca3-424c-841f-601d0b42283c`
- Restore completed at approximately **2026-11-20 13:19:03 UTC** (7:19 AM Central) after actual Queue-to-private-Worker execution.
- Archived and independently counted: **35 tables, 37 indexes, 12 triggers, 104 data rows (84 named SQL schema objects)**.
- Every archived table's row count matched the decrypted snapshot's count, verified by the restore Worker. A separate read-only D1 API inventory independently counted all 104 rows across those 35 tables.
- Recovered D1 `PRAGMA quick_check`: **ok**.
- Recovered D1 `PRAGMA foreign_key_check`: **0 violations**.
- Recovery job success log: `Nexus encrypted R2 restore verified 35 104 84 2026-11-20T06:00:27.724Z`.
- The source database may now have extra tables and rows added *after midnight*. The restored 35-table/104-row state is the **correct archived point-in-time snapshot** (not an assertion that the present-day staging database is byte-identical).

**Additional verification caveat:** Cloudflare D1's remote API rejected `PRAGMA integrity_check` with `SQLITE_AUTH`. This optional stronger command was not marked passed; `quick_check=ok`, the zero-violation foreign-key check, authenticated archive hash, and table/schema/record parity did pass.

## Defects found and corrected

1. **Multiline DDL parsing:** Cloudflare D1 `exec(sql)` split multiline `CREATE TABLE` declarations and produced `incomplete input`. Fixed by executing each complete schema statement with `prepare(sql).run()`.
2. **Composite foreign keys:** `appointments(tenant_id,job_id)` references `jobs(tenant_id,id)` through `idx_jobs_tenant_id`, a unique index. Importing rows before rebuilding the indexes produced `foreign key mismatch`. Fixed restore order: create tables, then indexes (including unique ones), then insert archived rows in a transaction, and create triggers after imported data.
3. Added regression tests for multiline table/trigger DDL, parent composite unique-index foreign keys, AES-GCM tamper rejection, authorized caller checks, and overwrite refusal.

The full [Nexus CRM/POS CI suite with these regression tests](https://github.com/davidrankin2468-a11y/nexus-crm/actions/runs/44742775140) passed before the successful real archive recovery. Source: `cloudflare/nexus-r2-isolated-restore-drill.js`, `tests/test_r2_actual_archive_restore.mjs`.

## Cleanup and safety verification — completed

- Restored the original, non-public scheduled backup Worker `nexus-crm-pos-r2-backups` to deployed version `3e3e979b-8c76-4c2a-b833-32512bcc4b95`, **with only its original five bindings**.
- Original midnight cron pair `0 5 * * *` and `0 6 * * *` UTC retained, with the America/Chicago midnight guard. **No permanent schedule changes.**
- Original backup Worker `workers.dev` subdomain remains disabled. Temporary diagnostic logging reverted to disabled.
- Deleted the temporary private queue, its consumer, and the one-shot restore trigger Worker. Temporary per-minute cron was removed before the Queue run.
- Deleted the failed, partial first recovery database `nexus_crm_r2_restore_drill_20261120`. Only the independently verified private recovered database `nexus_crm_r2_restore_drill_20261120_v2` was retained for audit.
- Live source staging D1 `PRAGMA quick_check=ok`, recovered D1 `PRAGMA quick_check=ok`, recovered D1 `PRAGMA foreign_key_check` returned no rows, and the original 56,379-byte encrypted R2 object remains present.
- No writes to the original CRM database, customer billing, Square merchant settings, or original encrypted backup object were part of the restore operation.

**Disaster recovery drill status: PASS for restoration of the actual November 20 midnight R2 archive.** This does not separately certify key escrow outside Cloudflare, continuous restore of every future snapshot, the commercial Square payment flows, or the overall customer-production release gate.
