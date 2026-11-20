# Nexus CRM + POS — Encrypted R2 Backups (pilot)

**Configured:** November 19, 2026 (America/Chicago)  
**Source D1:** `nexus_crm_full_staging` (`156852c4-c056-408f-84b2-1d305c94993e`)  
**Private R2 bucket:** `nexus-crm-pos-secure-backups`  
**Scheduled backup Worker:** `nexus-crm-pos-r2-backups`  
**Source:** `cloudflare/nexus-crm-pos-r2-backup-worker.js`  
**Schedule:** Two UTC triggers, `0 5 * * *` and `0 6 * * *`. The Worker checks `America/Chicago` using the scheduled timestamp and runs exactly one backup daily at **12:00 a.m. Central** (CST and CDT), skipping the other trigger.  
**Health monitor:** Nexus R2 Backup Health, daily conditional notification at 6 a.m. America/Chicago.

## Current deployment state

- R2 activated in the connected Cloudflare account and private bucket created.
- Worker deployed with no public `workers.dev` subdomain and a `fetch()` handler that always returns HTTP 404.
- Worker has only a read-only **code path** to the source D1 DB, a private R2 binding and a *separate* 32-byte backup encryption secret. It retains the same D1 binding permissions granted by Cloudflare; read-only here means the handler itself never issues writes to D1.
- AES-256-GCM encrypts a transactional snapshot of application tables, with a fresh random 96-bit IV per object and authenticated additional data. The source plaintext is never uploaded.
- Each snapshot includes the user schema (tables, indexes, triggers where SQL-defined) and all rows from 35 current user tables, including CRM, POS and account metadata. Cloudflare internal `_cf_KV` is excluded.
- After write, the scheduled Worker reads the object back, authenticates and decrypts it in memory, validates its plaintext SHA-256 digest and row totals, and fails the job on any mismatch.
- New backups are written under `snapshots/v1/YYYY/MM/DD/`; the Worker uses a unique object key per run.
- Encryption unit and tampering tests passed in GitHub Actions on fictional data.
- An encrypted write/read/delete probe succeeded against the actual R2 bucket using fictional data only.
- The first full-data daily backup will not be marked successful until a real `.aes256gcm` object is observed in R2 after the first scheduled run and its Worker execution reports success.

## Immediate manual backup and isolated recovery drill (November 19, 2026 CST)

**Verified manual backup:** Stored in the private bucket under `snapshots/manual/v1/2026/11/20/verified-manual-*.aes256gcm`. The archive is **AES-256-GCM encrypted**, was read back from R2, decrypted in the same secure operation, authenticated, checked against SHA-256, and its data structure verified: **35 application tables, 84 SQL schema objects, 103 database rows**. D1 was read only. The separate recovery key is a Cloudflare Worker secret named `BACKUP_MANUAL_KEY_V2_20261119`. This key is not the MFA key or the scheduled backup's `BACKUP_ENCRYPTION_KEY`. Do not remove either key.

An earlier manual object also exists; only the `verified-manual-` archive has the successful end-to-end readback result. Do not treat the earlier archive as the primary recovery point.

**Consistency limitation:** This immediate manual backup collected tables using sequential, read-only D1 API queries, not a single database transaction. Although its counts and cryptographic integrity were validated, it is **not guaranteed point-in-time transactionally consistent if application records changed during extraction**. The separate daily Worker is intended to use D1 batched reads and must be verified after its first execution.

**Isolated recovery and tenant-integrity drill:** Created temporary D1 database `nexus_crm_pos_restore_drill_20261119`. Successfully recreated all **35 tables, 37 indexes and 12 triggers**, uploaded/read/decrypted a **fictional** R2 backup fixture, restored fictional records for two companies, confirmed two customers, two jobs, two POS products, two sales and linked items, and verified `PRAGMA quick_check=ok` with **zero foreign-key violations**. Cross-company job and POS item inserts were rejected. Then deleted the temporary test database and fictional R2 object. The live source D1 and the private backup objects remained intact.

**Not yet completed:** Actual restore of the `verified-manual-` encrypted data file into an isolated destination (including key escrow and full recovery procedure); observation and verification of the first full scheduled `snapshots/v1/` archive; off-account backup and key copies.

**Schedule updated:** `0 5 * * *` plus `0 6 * * *` UTC, guarded to exactly one midnight Central backup. First expected daily run **November 20, 2026, 12:00 a.m. CST (06:00 UTC)**. The existing 6:00 a.m. Central backup-health monitor remains in place and is configured to recognize the new schedule. Regression tests cover standard/daylight saving transitions.

---

## Key and disaster recovery limitations

The `BACKUP_ENCRYPTION_KEY` secret was generated within Cloudflare and never placed into GitHub or a chat. **Do not delete, rename or rotate the secret** without creating a separate, secure key-recovery and migration plan. R2 ciphertext cannot be decrypted without it. Preserving the MFA secret does not preserve the backup key: they are unrelated.

R2 and D1 are separate storage services but reside within the same Cloudflare account; this is not an independent-provider or independent-account disaster-recovery architecture. Account loss or malicious account-level deletion can affect both. A secure offline escrow of the backup key and periodic off-account copies are required before commercial launch.

Decrypt-and-verify is not equivalent to an end-to-end **restore drill**. A separate destination D1 or SQLite database must be restored, integrity-checked, and tested with fictional test tenants before production claims are made.

The current Worker fails rather than producing partial backups when a user table exceeds 20,000 rows or the decrypted JSON snapshot exceeds 12 MB. Review limits and implement streaming/paginated export before hitting these thresholds.

## Privacy, retention, and ongoing checks

- No R2 public domain, anonymous downloads, or customer-facing backup routes were enabled.
- No automatic R2 object expiration was configured, pending a business-approved retention and legal policy. Monitor storage growth and costs.
- Inspect the private bucket and Worker logs if the daily health monitor reports a missing/stale or failed backup.
- Recover only into a **separate** database. Never directly overwrite live tenant data during a restore rehearsal.
- Do not print secret key values, backup ciphertext or customer data to GitHub logs, public repositories, chat messages or CI artifacts.

## Launch gates

1. Confirm the **first real daily encrypted backup** and observe successful readback verification.
2. Conduct isolated end-to-end restore and compare counts and foreign keys.
3. Create a secure separate-account/offline recovery key escrow and off-provider backup copy.
4. Approve retention window, cost controls, alerts, periodic restore drills and incident response.
