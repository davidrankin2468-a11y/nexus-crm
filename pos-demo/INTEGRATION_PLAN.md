# Nexus POS + CRM — development integration plan

Status: prototype only. The POS prototype at `pos-demo/index.html` uses fictional browser-local data and **must not** be used for real payments, customer data, or taxes.

## Existing product boundary
- Preserve the existing five CRM tabs (Dashboard, Customers, Operations, Finance, Management).
- Add POS as a **Finance sub-workspace** or optional module, not a replacement for any existing tab.
- Maintain the private Nexus Command Center as the owner's headquarters, not a customer-facing application.
- Keep the existing secure CRM and public preview untouched until a separate authenticated test deployment passes.

## Secure backend design before launch
- Company-scoped `products`, `inventory_movements`, `sales`, `sale_items`, `refunds`, and `payment_events` tables, with foreign keys and unique idempotency keys.
- Every server query must derive `company_id` from the authenticated session; never trust a client-provided company ID.
- Inventory decrements, sale totals and sale items must be written in a single database transaction or equivalent atomic operation. Do not accept client totals as authoritative.
- Require role-specific authorization for inventory edits, discounts, refunds, exports and settings.
- Calculate monetary amounts in integer minor units. Tax configuration is business/jurisdiction dependent and requires validation.
- Use a hosted payment provider's approved checkout and tokenization. Never store raw card details.
- Verify payment webhooks with signatures and replay prevention. Separate payment capture from bookkeeping.
- Refunds must be linked to an original transaction and inventory restocking must be deliberate and auditable.
- Isolate business branding, users, products, customers, invoices, transactions, receipts and backups by tenant.
- Never put live secrets, personal records, customer databases or private backups in this public repository.

## Release gates
1. Regression tests for all five existing CRM tabs.
2. POS unit tests for cents, quantity, stock, discounts, tax, refunds, repeated clicks and duplicate requests.
3. Authenticated two-company isolation tests, including attempted cross-company IDs.
4. Payment provider sandbox flows: success, failure, cancellation, refund and replayed webhook.
5. Mobile and desktop keyboard/accessibility smoke tests.
6. Restore rehearsal using an independently stored encrypted backup.
7. Preview deploy with fictional data, review and explicit approval before commercial production.

## Prototype known limitations
- Browser-local data is not a server database and is not synced or multi-user.
- Demo checkout records sales only; no payment authorization or capture.
- The demo tax input is illustrative, not a sales tax engine.
- No production receipts, returns, inventory purchase orders, staff permissions or hardware integrations.
- No end-to-end browser testing or independent security audit has been completed.
