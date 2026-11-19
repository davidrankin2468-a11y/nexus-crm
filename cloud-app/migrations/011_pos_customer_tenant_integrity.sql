-- Development first: keep POS sale customer associations within the signed-in CRM company.
-- Does not modify historical sales, passwords, payment processing, or other tenants.
-- Same-company customer association is also checked by the authenticated API.
CREATE TRIGGER IF NOT EXISTS pos_sale_customer_same_tenant_insert
BEFORE INSERT ON pos_sales
WHEN NEW.customer_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
BEGIN
 SELECT RAISE(ABORT, 'POS CRM customer must belong to the sale company');
END;
CREATE TRIGGER IF NOT EXISTS pos_sale_customer_same_tenant_update
BEFORE UPDATE OF customer_id,tenant_id ON pos_sales
WHEN NEW.customer_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND tenant_id=NEW.tenant_id)
BEGIN
 SELECT RAISE(ABORT, 'POS CRM customer must belong to the sale company');
END;
