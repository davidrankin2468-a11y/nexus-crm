# Nexus CRM 3.3 — Team Access, Staff Deactivation, and Offline Account Recovery

**Deployment:** https://nexus-crm-secure.pages.dev  
**Phase:** Invitation-only, fictional-record pilot. Not production-certified for real customer data.

## New capabilities

### Company-owner Team Access

From your own account, open **Management → Team Access**:

1. Choose **Employee** (read-only operations) or **Admin** (can edit operational and Finance records).
2. Enter an email address you control, then confirm your own CRM password.
3. Create the invitation and **copy the one-time secret link immediately**; Nexus CRM does not send it by email.
4. Open it in a different device or private/incognito browser window. The invited user sets a password of at least 14 characters.
5. The invitation is good for only **one acceptance** and expires after **three days**. The user is assigned to your company, not to another company.
6. Review Active/Disabled staff accounts and pending invitations under Team Access. You can revoke unused invitations.
7. To disable an accepted staff account, enter your owner password and choose **Disable access**. Their sessions are revoked and new logins denied. **Enable access** restores their ability to sign in; it does not resurrect sessions.

**Important:** Staff user accounts and the Employees directory are separate today; inviting a login does not automatically create an employee directory entry.

### Access levels

| Feature | Owner | Admin | Employee |
| --- | --- | --- | --- |
| Dashboard / customer and job records | Read/write | Read/write | Read only |
| Employees directory and appointments | Read/write | Read/write | Read only |
| Estimates, invoices, payment recording and reports | Yes | Yes | **No** |
| Company backups, Security, Team Access | Yes | **No** | **No** |
| Nexus platform Sales Leads and cross-company metadata | Platform operator only | **No** | **No** |
| Change own password / generate own recovery codes | Yes | Yes | Yes |

These permissions are checked by the **server**; the UI also hides workspaces and edit forms that the account cannot use. Only the platform operator can issue brand-new company-owner invitations. Only a company owner can issue, revoke or disable staff access within that company.

### Offline recovery codes, no email service required

Once signed in, select **Account Security** near the top of the CRM:

1. Enter your current login password and select **Generate new recovery codes**.
2. Save the **eight one-time 32-character codes** to a secure password manager or an offline location. **They appear only once and are not emailed.**
3. To recover a forgotten password, use **Use a saved recovery code** on the sign-in screen. Provide the same email, one unused code and a new 14+ character password.
4. A successful reset **consumes that code and revokes all active sign-in sessions**. Sign in again with the new password.
5. Generating new recovery codes invalidates the previous batch. If you have lost all codes and your password, this feature cannot recover the account; a verified recovery process is still needed.

Hashes of recovery codes are stored in D1; the plaintext codes appear only in the initial authenticated response. Never send screenshots, codes, secret links or passwords through public channels.

## Security and QA

- The existing owner's account and CRM records remain unchanged by these additive migrations.
- GitHub safety branch: `backup-before-staff-security-3-2`.
- Migrations `007_staff_invitations.sql`, `008_account_recovery_codes.sql`, `009_staff_deactivation.sql` were applied additively.
- The updated JS and API passed syntax checks.
- **15 explicit authorization test cases** passed for owner/admin/employee access.
- **7 SQL EXPLAIN checks** passed for staff invitations and recovery operations; further deactivation/session checks also passed.
- **14 mobile browser interface checks** passed for the Team Access/recovery screens on a 390px viewport.
- Note: SQL EXPLAIN is non-mutating and does not prove that a production password reset succeeds. Full signed-in two-company, two-staff role, token replay, and account-recovery security tests still need to be run before commercial availability.

## Still required for real paying businesses

- **Verified email identity**, automated secure account recovery and **multifactor authentication**.
- Full adversarial **two-company isolation** and staff permission tests using separately signed-in identities; concurrent invite redemption and recovery replay tests.
- Automated independent encrypted backups, retention, and real restore drills.
- Legal/privacy and data-processing documents, incident response and product support.
- Hosted subscription billing, licensing/entitlements, payment provider configuration, cancellations/refunds/taxes.
- Customer consent/onboarding and any required verified business registration/domain purchases. No payments or registrations were made by this upgrade.
- In-depth code audit, production monitoring, accessibility and real-device iPhone/Android testing.

**Share publicly today:** https://nexus-crm-showcase.pages.dev/ and https://nexus-crm-preview.pages.dev/ with fictional data only. The private `nexus-crm-secure.pages.dev` is still an alpha environment.
