-- Durable single-flight reservation for Square Sandbox refund operations.
-- Apply before deploying the matching POS Worker code.
CREATE TABLE IF NOT EXISTS pos_square_sandbox_refund_operations (
 operation_key TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 payment_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_sandbox_refund_operations_tenant_sale ON pos_square_sandbox_refund_operations(tenant_id,sale_id);
