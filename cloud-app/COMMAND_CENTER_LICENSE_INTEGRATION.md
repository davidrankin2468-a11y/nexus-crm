# Nexus Command Center ↔ CRM licensing integration contract

## Architecture
Command Center is the private Nexus Software Solutions operator interface. CRM is the customer-facing tenant application. Never share operator session cookies or expose the operator API publicly.

## Planned API (not deployed)
- GET /api/operator/licenses — authenticated platform operator only; paginated company license summaries.
- POST /api/operator/licenses/:id/activate — verified operator action, audit logged, explicit plan and period.
- POST /api/operator/licenses/:id/renew — verified operator action, idempotency key and audit event.
- POST /api/operator/licenses/:id/cancel — cancel at period end, schedule export window.
- GET /api/license/me — authenticated tenant session only; returns own entitlements, no other company data.
- GET /api/license/export — owner-only export, within permitted export window.

## Connection prerequisites
1. Deploy the migration to the actual CRM staging database (isolated license test database is already provisioned).
2. Integrate the license guard into each protected API handler. All tenant identifiers must be derived from authenticated sessions.
3. Provision an authenticated platform-operator service endpoint; use short-lived, scoped credentials or server-to-server identity, never browser-embedded secrets.
4. Connect Command Center Sales & Billing to the operator API with verified owner authorization.
5. Test separate tenant accounts, expired/grace/canceled states, feature bypass attempts, renewal idempotency and export access.
6. Deploy only after tests and approval. The existing Command Center GitHub repository currently contains a standalone preview, not a production authenticated owner dashboard.

## Important
Do not use an iframe or direct browser link as proof of authorization. An interface link is navigation, not integration. No Square payment processing is active.
