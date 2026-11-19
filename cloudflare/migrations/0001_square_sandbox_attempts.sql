-- Nexus POS: Cloudflare D1 Square Sandbox attempt foundation.
-- Development/staging only. Does not submit payments or change sale status.
-- Apply only to the D1 database bound to nexus-crm-pos-integrated-preview.
CREATE TABLE IF NOT EXISTS pos_square_sandbox_payment_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  sale_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL
    CHECK(length(idempotency_key) BETWEEN 8 AND 45
      AND idempotency_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  square_location_id TEXT NOT NULL
    CHECK(length(square_location_id) BETWEEN 4 AND 100
      AND square_location_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK(status IN ('prepared','submitted','completed_unreconciled','reconciled','failed','unknown')),
  provider_payment_id TEXT UNIQUE
    CHECK(provider_payment_id IS NULL
      OR (length(provider_payment_id) BETWEEN 8 AND 200
        AND provider_payment_id NOT GLOB '*[^A-Za-z0-9_-]*')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, idempotency_key),
  UNIQUE(tenant_id, sale_id),
  FOREIGN KEY(tenant_id, sale_id) REFERENCES pos_sales(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS pos_square_attempts_tenant_status
  ON pos_square_sandbox_payment_attempts(tenant_id, status, created_at);

-- A prepared attempt must correspond to an unpaid sale belonging to this exact
-- company, in USD, for the exact total stored server-side.
CREATE TRIGGER IF NOT EXISTS pos_square_attempt_validate_insert
BEFORE INSERT ON pos_square_sandbox_payment_attempts
WHEN NOT EXISTS(
  SELECT 1 FROM pos_sales s
  WHERE s.id = NEW.sale_id
    AND s.tenant_id = NEW.tenant_id
    AND s.status = 'pending'
    AND s.total_cents = NEW.amount_cents
    AND s.currency = NEW.currency
)
BEGIN
  SELECT RAISE(ABORT,'Square Sandbox attempt must match a pending company sale');
END;

-- An attempt's company, sale, amount, reference, currency, and location are
-- immutable. Updating payment status never authorizes changing the sale amount.
CREATE TRIGGER IF NOT EXISTS pos_square_attempt_immutable_reference
BEFORE UPDATE OF tenant_id, sale_id, idempotency_key, square_location_id,
                 amount_cents, currency ON pos_square_sandbox_payment_attempts
WHEN OLD.tenant_id IS NOT NEW.tenant_id
  OR OLD.sale_id IS NOT NEW.sale_id
  OR OLD.idempotency_key IS NOT NEW.idempotency_key
  OR OLD.square_location_id IS NOT NEW.square_location_id
  OR OLD.amount_cents IS NOT NEW.amount_cents
  OR OLD.currency IS NOT NEW.currency
BEGIN
  SELECT RAISE(ABORT,'Square Sandbox attempt references are immutable');
END;
