-- Read-only Square Sandbox staging audit; do not run against production.
PRAGMA quick_check;
PRAGMA foreign_key_check;
SELECT status,COUNT(*) AS attempts FROM pos_square_sandbox_payment_attempts GROUP BY status;
SELECT status,COUNT(*) AS sales FROM pos_sales GROUP BY status;
SELECT COUNT(*) AS recorded_refunds FROM pos_refunds;
SELECT COUNT(*) AS orphan_payment_events FROM pos_payment_events e
 LEFT JOIN pos_sales s ON s.id=e.sale_id AND s.tenant_id=e.tenant_id WHERE s.id IS NULL;
SELECT COUNT(*) AS mismatched_attempt_amounts FROM pos_square_sandbox_payment_attempts a
 JOIN pos_sales s ON s.id=a.sale_id AND s.tenant_id=a.tenant_id
 WHERE a.amount_cents<>s.total_cents;
SELECT COUNT(*) AS excessive_refunds FROM pos_sales WHERE refunded_cents>total_cents;
SELECT COUNT(*) AS refund_total_mismatches FROM pos_sales s
 WHERE s.refunded_cents<>(SELECT COALESCE(SUM(r.amount_cents),0)
 FROM pos_refunds r WHERE r.tenant_id=s.tenant_id AND r.sale_id=s.id);
SELECT COUNT(*) AS duplicate_payment_events FROM
 (SELECT provider,provider_event_id FROM pos_payment_events GROUP BY provider,provider_event_id HAVING COUNT(*)>1);
