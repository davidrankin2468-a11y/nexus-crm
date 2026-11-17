# Nexus POS integration verification — development branch

## Implemented
- `public/pos/index.html` uses `GET /api/me` for the current CRM user and CSRF token.
- `GET/POST /api/pos/products` lists and creates company-scoped products.
- `GET/POST /api/pos/sales` lists and records company-scoped sales with inventory movements.
- API derives tenant ID from authenticated HTTP-only session, never from request JSON.
- All writes require same-origin and `X-Nexus-CSRF`. Only owner/admin roles may access this pilot.
- No payment provider, card collection, customer data imports or real refunds.

## Checks completed (source inspection, not execution)
- UI references the correct session, product, and sales routes.
- CSRF header matches existing CRM API.
- SQL statements filter tenant-owned products and sales by authenticated tenant.
- Sale writes use D1 batch; stock has a database nonnegative constraint.
- Schema contains tenant-composite references for sale items, refunds and inventory movements.

## NOT YET TESTED — blockers to deployment and real use
1. Apply migration 007 to a **disposable D1 database** with the exact existing 001–006 migrations. Validate all foreign keys and constraints.
2. Verify Pages routing chooses `/api/pos/[[path]].js` over the existing catch-all.
3. Sign in as two separate fictional companies. Verify each can only read and create its own products and sales, including forged cross-company IDs.
4. Test missing/expired cookies, bad CSRF, non-owner roles, duplicate idempotency keys, simultaneous last-stock checkouts, rollback on insufficient stock, and failed writes.
5. Browser test desktop/mobile checkout and error recovery.
6. Integrate the POS entry point into the existing five-tab CRM Finance workspace. Current `/pos/` page is standalone.
7. Add secure provider checkout, verified webhook handling, refund accounting, tax calculation, and authorization audits before real transactions.
8. Review all schema relationships against the actual production migrations before applying any changes to live D1.

## Known pilot limitations
- Tax is manually entered and not compliant jurisdictional tax calculation.
- Sale is recorded as completed **without collecting payment**. Pilot must be used with fictional data only.
- No stock restocking endpoint or inventory correction endpoint yet.
- No customer assignment to sales in this pilot.
- No automatic retries for transient failures. Retrying a sale with a new key can duplicate a sale; production UI must persist a pending idempotency key.
- The code is not security-certified, and tests above remain outstanding.
