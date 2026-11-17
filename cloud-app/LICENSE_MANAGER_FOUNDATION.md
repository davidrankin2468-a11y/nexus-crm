# Nexus License Manager — Foundation

This branch introduces an **additive database migration only**. It does not change authentication, enable subscriptions, or gate existing CRM endpoints.

## Installation
Review the migration, back up the D1 database, then apply `cloud-app/migrations/006_license_manager.sql` to a **staging** D1 database first. Verify schema and existing records before applying to production. This migration has **not** been applied to any D1 database by this commit.

## Server enforcement required before commercial launch
- Derive tenant ID from authenticated session; never trust a client-supplied tenant ID.
- For each protected API request, check tenant membership, active license period, grace expiry, feature entitlement and usage quota on the server.
- Enforce seat limits transactionally on invitations and activations. Check storage quota on upload; do not trust client counters.
- Keep existing pilot tenants working until an explicit, tested migration policy is approved. Never silently turn on default-deny in the existing alpha.
- Implement a clear cancellation/export policy, and audit administrator overrides.
- Verify Square webhook signatures from the raw request body; confirm payment/subscription state; deduplicate by provider event ID and handle out-of-order events.
- Do not treat a recorded manual payment as verified Square payment.

## Proposed policy
Starter $49/month, 3 seats, 5 GiB; Business $99/month, 10 seats, 25 GiB; Premium $149/month, unlimited seats subject to fair use, 100 GiB. Grace period 7 days and export window 30 days are **proposals**, not active enforcement. Final commercial terms require approval.

## Safety
The repository is public. Never commit Square credentials, customer data, license secrets, private keys, or database exports.
