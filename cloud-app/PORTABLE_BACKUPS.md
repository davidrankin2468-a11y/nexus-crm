# Nexus CRM portable encrypted business backups — version 2.9

## How to make a separate backup for free

1. Sign into the **private** CRM at https://nexus-crm-secure.pages.dev.
2. Open **Management → Backups**.
3. If you have no current snapshot, click **Save recovery snapshot**.
4. Click **Preview** on a snapshot, then find **Download an encrypted backup**.
5. Enter your current CRM password to authorize access.
6. Choose a **different, strong backup passphrase** (at least 12 characters). Keep it separate from the file.
7. Click **Download encrypted backup**. This stores a file on **your device**, outside the D1 database.
8. Use **Verify an encrypted backup file** on the same page to select the downloaded file and enter the backup passphrase. The file is decrypted and checked **locally in your browser**; it is not uploaded.

The downloaded file is a JSON document ending in `.json`, but it contains only **encrypted** business records—not readable customer details. It uses AES-256-GCM, PBKDF2-HMAC-SHA256 with a randomly generated 16-byte salt and 200,000 iterations, and a randomly generated 12-byte nonce. Encryption and decryption happen on the device using browser Web Crypto.

## What the file contains
- Customers, employees, jobs, estimates, invoices, appointments, and manual payment records.
- Company name, snapshot creation time, record counts, and format version inside the **encrypted** payload.
- No account passwords, salts, session tokens, API keys or login credentials.

## Limits and recovery
- The CRM currently limits in-database snapshots to ~1.8 MB of plaintext and 2,500 rows per business table.
- The user must explicitly download the file; **automatic offsite backups are not enabled**.
- This file is a **portable encrypted archive**, but the site does **not** yet have an import/restore function for encrypted files. Recovery would require a future supported importer or assisted recovery using the documented file format.
- **In-database** snapshot recovery remains available separately in missing-record-only mode and requires owner login, password re-verification and typed confirmation.
- **Cloudflare D1 Time Travel** can help recover the entire database within its availability window. It is not a copy stored at a separate provider.
- A device loss, forgotten passphrase or deleted download can make this export unavailable. Protect **both** the file and the passphrase.
- Do not email unencrypted exports, share your backup passphrase publicly, or commit the file to GitHub.

## File structure

The top-level downloaded JSON includes:

```json
{
 "format": "nexus-crm-encrypted-backup-v1",
 "encryption": "AES-256-GCM",
 "kdf": "PBKDF2-SHA256",
 "iterations": 200000,
 "salt": "<base64 random salt>",
 "iv": "<base64 random initialization vector>",
 "data": "<base64 AES-GCM ciphertext and tag>"
}
```

Decrypt `data` with AES-GCM using a key derived from the passphrase using PBKDF2-SHA256, 200,000 iterations and `salt`. The decryption `iv` is the 12-byte initialization vector; the authentication tag is part of the ciphertext (Web Crypto convention). The decrypted UTF-8 JSON payload contains `format=nexus-crm-business-export-v1`, `schemaVersion=1`, source snapshot ID, company, counts, and business `records`. Always verify the authenticated decryption and validate the payload before using it.

## Business readiness

Portable exports improve your recovery options without an extra storage subscription. **They do not replace independently scheduled backups, production security review, account recovery, tested disaster recovery, legal terms, or automated multi-company isolation tests.** Use fictional test records until those release gates are complete.
