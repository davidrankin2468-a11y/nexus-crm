-- STAGING FIRST: atomic reversal of inventory reservation for an unpaid POS sale.
-- Only the pending -> voided transition restores stock. Repeated attempts are no-ops.
-- No payment, refund, or financial settlement is performed.
CREATE TRIGGER IF NOT EXISTS pos_void_pending_restock
AFTER UPDATE OF status ON pos_sales
WHEN OLD.status = 'pending' AND NEW.status = 'voided'
BEGIN
 UPDATE pos_products
 SET stock_quantity=stock_quantity + COALESCE((
    SELECT SUM(i.quantity) FROM pos_sale_items i
    WHERE i.tenant_id=NEW.tenant_id AND i.sale_id=NEW.id AND i.product_id=pos_products.id
 ),0),updated_at=CAST(strftime('%s','now') AS INTEGER)
 WHERE tenant_id=NEW.tenant_id
 AND EXISTS (SELECT 1 FROM pos_sale_items i
   WHERE i.tenant_id=NEW.tenant_id AND i.sale_id=NEW.id AND i.product_id=pos_products.id);
 INSERT INTO pos_inventory_movements(id,tenant_id,product_id,sale_id,quantity_delta,reason,created_at)
 SELECT lower(hex(randomblob(16))),NEW.tenant_id,product_id,NEW.id,quantity,'correction',
 CAST(strftime('%s','now') AS INTEGER)
 FROM pos_sale_items
 WHERE tenant_id=NEW.tenant_id AND sale_id=NEW.id;
END;
