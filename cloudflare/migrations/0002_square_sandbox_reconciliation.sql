-- D1 Square Sandbox reconciliation guards. Staging-only, no provider calls.
-- Requires 0001_square_sandbox_attempts.sql and existing POS tables.

-- A Square receipt event is allowed only for one prepared, company-scoped,
-- server-priced, still-pending sale. A receipt cannot be reused for another sale.
CREATE TRIGGER IF NOT EXISTS pos_square_completed_event_guard
BEFORE INSERT ON pos_payment_events
WHEN NEW.provider = 'square_sandbox'
BEGIN
  SELECT CASE WHEN NEW.event_type != 'payment_completed'
    OR NOT EXISTS (
      SELECT 1
      FROM pos_square_sandbox_payment_attempts a
      JOIN pos_sales s ON s.tenant_id=a.tenant_id AND s.id=a.sale_id
      WHERE a.tenant_id=NEW.tenant_id
        AND a.sale_id=NEW.sale_id
        AND a.status='prepared'
        AND a.provider_payment_id IS NULL
        AND a.amount_cents=NEW.amount_cents
        AND a.currency='USD'
        AND s.status='pending'
        AND s.total_cents=NEW.amount_cents
        AND s.currency='USD'
    )
    OR EXISTS (
      SELECT 1 FROM pos_payment_events e
      WHERE e.tenant_id=NEW.tenant_id AND e.sale_id=NEW.sale_id
        AND e.provider='square_sandbox'
    )
    THEN RAISE(ABORT, 'Square receipt requires a unique prepared company sale')
  END;
END;

-- The reconciled state is only valid once a completed sale has a corresponding
-- uniquely recorded Square receipt with the same provider payment ID and amount.
CREATE TRIGGER IF NOT EXISTS pos_square_attempt_reconciled_guard
BEFORE UPDATE OF status,provider_payment_id ON pos_square_sandbox_payment_attempts
WHEN NEW.status='reconciled'
BEGIN
  SELECT CASE WHEN OLD.status NOT IN ('prepared','reconciled')
    OR NEW.provider_payment_id IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pos_sales s
      JOIN pos_payment_events e
        ON e.tenant_id=s.tenant_id AND e.sale_id=s.id
      WHERE s.tenant_id=NEW.tenant_id
        AND s.id=NEW.sale_id
        AND s.status='completed'
        AND s.total_cents=NEW.amount_cents
        AND e.provider='square_sandbox'
        AND e.provider_event_id=NEW.provider_payment_id
        AND e.event_type='payment_completed'
        AND e.amount_cents=NEW.amount_cents
    )
    THEN RAISE(ABORT, 'Square reconciliation requires completed sale and receipt')
  END;
END;

-- Forbid changing a receipt's provider identity after insertion.
CREATE TRIGGER IF NOT EXISTS pos_square_receipt_immutable
BEFORE UPDATE ON pos_payment_events
WHEN OLD.provider='square_sandbox'
BEGIN
  SELECT RAISE(ABORT,'Square receipts are append-only');
END;
