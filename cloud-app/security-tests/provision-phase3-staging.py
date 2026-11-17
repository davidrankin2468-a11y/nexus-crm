#!/usr/bin/env python3
"""Generate staging-only Nexus CRM test-account SQL and GitHub Actions secrets.
Run locally; never commit the generated SQL or credentials.
Requires Python 3.9+; uses only standard-library modules.
"""
import hashlib, secrets, sqlite3, os, pathlib, json
from getpass import getpass

TENANTS = [
    ("isolation-fixture-company-a", "owner", "nexus-phase3-a-owner@example.invalid"),
    ("isolation-fixture-company-b", "owner", "nexus-phase3-b-owner@example.invalid"),
    ("isolation-fixture-company-a", "employee", "nexus-phase3-a-employee@example.invalid"),
]
def quote(value):
    return "'" + str(value).replace("'", "''") + "'"
def main():
    output = pathlib.Path(os.environ.get("NEXUS_PHASE3_OUTPUT", ".nexus-phase3-private"))
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    sql = ["-- STAGING ONLY: use exclusively with nexus_crm_full_staging; NEVER production.", "BEGIN TRANSACTION;"]
    creds = {}
    for tenant, role, email in TENANTS:
        password = secrets.token_urlsafe(36)
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100000).hex()
        user_id = "isolation-fixture-user-" + role + "-" + tenant.rsplit("-", 1)[-1]
        sql.append("INSERT INTO users(id,tenant_id,email,password_hash,salt,iterations,role,created_at,disabled_at) "
                   f"VALUES({','.join(map(quote,[user_id,tenant,email,digest,salt,100000,role]))},strftime('%s','now'),NULL) "
                   "ON CONFLICT(id) DO NOTHING;")
        creds[email] = password
    sql.append("COMMIT;")
    (output/"staging-test-users.sql").write_text("\n".join(sql)+"\n",encoding="utf-8")
    (output/"staging-test-credentials.json").write_text(json.dumps(creds,indent=2),encoding="utf-8")
    os.chmod(output/"staging-test-users.sql",0o600)
    os.chmod(output/"staging-test-credentials.json",0o600)
    print("Generated staging-only SQL and credentials in",output)
    print("Never commit these files; add credentials to GitHub Actions secrets and apply SQL to staging D1 only.")
if __name__ == "__main__":
    main()
