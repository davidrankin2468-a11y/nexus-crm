-- Keep in-flight Square Sandbox payments from being voided/restocked.
-- Apply after migrations 0001, 0002, 0003.
CREATE TRIGGER IF NOT EXISTS pos_square_prevent_void_when_submitted
BEFORE UPDATE OF status ON pos_sales
WHEN OLD.status='pending' AND NEW.status='voided'
  AND EXISTS (
    SELECT 1 FROM pos_square_sandbox_payment_attempts a
    WHERE a.tenant_id=OLD.tenant_id AND a.sale_id=OLD.id
      AND a.status IN ('submitted','completed_unreconciled','unknown','reconciled')
  )
BEGIN
  SELECT RAISE(ABORT,'Square Sandbox payment may be pending; do not void the sale');
END;

CREATE TRIGGER IF NOT EXISTS pos_square_sale_completion_requires_receipt
BEFORE UPDATE OF status ON pos_sales
WHEN OLD.status='pending' AND NEW.status='completed'
  AND EXISTS (
    SELECT 1 FROM pos_square_sandbox_payment_attempts a
    WHERE a.tenant_id=OLD.tenant_id AND a.sale_id=OLD.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM pos_payment_events e
    WHERE e.tenant_id=OLD.tenant_id
      AND e.sale_id=OLD.id
      AND e.provider='square_sandbox'
      AND e.event_type='payment_completed'
      AND e.amount_cents=OLD.total_cents
  )
BEGIN
  SELECT RAISE(ABORT,'Square Sandbox sale requires verified receipt before completion');
END;
