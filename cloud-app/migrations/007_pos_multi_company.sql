-- Nexus POS + CRM: additive multi-company POS schema (development only).
-- Do not apply to production until existing schema and authenticated routes are verified.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pos_products (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 sku TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
 stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(tenant_id, sku),
 UNIQUE(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant ON pos_products(tenant_id, active, name);

CREATE TABLE IF NOT EXISTS pos_sales (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 customer_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','voided','partially_refunded','refunded')),
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
 tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents >= 0),
 total_cents INTEGER NOT NULL CHECK(total_cents = subtotal_cents + tax_cents),
 refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND total_cents),
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency = 'USD'),
 idempotency_key TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 completed_at INTEGER,
 UNIQUE(tenant_id, idempotency_key),
 UNIQUE(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_tenant_date ON pos_sales(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_sale_items (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 product_name TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents = quantity * unit_price_cents),
 FOREIGN KEY(tenant_id, sale_id) REFERENCES pos_sales(tenant_id, id),
 FOREIGN KEY(tenant_id, product_id) REFERENCES pos_products(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS pos_inventory_movements (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 sale_id TEXT,
 quantity_delta INTEGER NOT NULL CHECK(quantity_delta != 0),
 reason TEXT NOT NULL CHECK(reason IN ('restock','sale','refund','correction')),
 created_at INTEGER NOT NULL,
 FOREIGN KEY(tenant_id, product_id) REFERENCES pos_products(tenant_id, id),
 FOREIGN KEY(tenant_id, sale_id) REFERENCES pos_sales(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_product ON pos_inventory_movements(tenant_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_refunds (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 reason TEXT NOT NULL,
 provider_refund_id TEXT,
 idempotency_key TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(tenant_id, idempotency_key),
 FOREIGN KEY(tenant_id, sale_id) REFERENCES pos_sales(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_refunds_sale ON pos_refunds(tenant_id, sale_id);

CREATE TABLE IF NOT EXISTS pos_payment_events (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 provider_event_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
 created_at INTEGER NOT NULL,
 UNIQUE(provider, provider_event_id),
 FOREIGN KEY(tenant_id, sale_id) REFERENCES pos_sales(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pos_payment_events_sale ON pos_payment_events(tenant_id, sale_id);
