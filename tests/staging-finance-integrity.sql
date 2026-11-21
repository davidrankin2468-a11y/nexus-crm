-- Nexus CRM staging financial integrity audit (READ ONLY).
-- Run against staging D1 only; never paste production customer records into reports.
PRAGMA quick_check;
PRAGMA foreign_key_check;
SELECT COUNT(*) AS overpaid_invoices FROM (
 SELECT i.id FROM invoices i
 LEFT JOIN payments p ON p.invoice_id=i.id AND p.tenant_id=i.tenant_id
 GROUP BY i.id HAVING COALESCE(SUM(p.amount_cents),0)>i.amount_cents
);
SELECT COUNT(*) AS duplicate_estimate_invoices FROM (
 SELECT tenant_id,estimate_id FROM invoices WHERE estimate_id IS NOT NULL
 GROUP BY tenant_id,estimate_id HAVING COUNT(*)>1
);
SELECT COUNT(*) AS orphaned_payments FROM payments p
 LEFT JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id
 WHERE i.id IS NULL;
SELECT COUNT(*) AS negative_payments FROM payments WHERE amount_cents<=0;
SELECT COUNT(*) AS invalid_invoice_amounts FROM invoices WHERE amount_cents<=0;
