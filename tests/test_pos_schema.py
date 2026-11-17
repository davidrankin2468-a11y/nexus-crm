"""Nexus POS schema regression tests; uses only temporary in-memory SQLite."""
import pathlib, sqlite3, unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SQL=(ROOT/"cloud-app/migrations/007_pos_multi_company.sql").read_text()

def database():
    db=sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE users(id TEXT PRIMARY KEY);
    INSERT INTO tenants VALUES ('company-a'),('company-b');
    """)
    db.executescript(SQL)
    return db

class POSSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=database()
        for tenant in ("company-a","company-b"):
            self.db.execute("INSERT INTO pos_products(id,tenant_id,sku,name,price_cents,stock_quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                (tenant+"-p",tenant,"SAME-SKU","Test item",500,10,1,1))
            self.db.execute("INSERT INTO pos_sales(id,tenant_id,status,subtotal_cents,tax_cents,total_cents,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (tenant+"-s",tenant,"completed",500,0,500,"key-12345678",1))
    def tearDown(self):
        self.db.close()
    def test_duplicate_sku_within_company_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_products(id,tenant_id,sku,name,price_cents,stock_quantity,created_at,updated_at) VALUES('other','company-a','SAME-SKU','Duplicate',500,1,1,1)")
    def test_same_sku_allowed_across_companies(self):
        self.assertEqual(self.db.execute("SELECT count(*) FROM pos_products WHERE sku='SAME-SKU'").fetchone()[0],2)
    def test_cross_company_sale_item_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_sale_items(id,tenant_id,sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?,?,?)",
                ("bad","company-a","company-b-s","company-a-p","Test item",1,500,500))
    def test_cross_company_product_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_sale_items(id,tenant_id,sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?,?,?)",
                ("bad","company-a","company-a-s","company-b-p","Test item",1,500,500))
    def test_negative_stock_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE pos_products SET stock_quantity=-1 WHERE id='company-a-p'")
    def test_bad_sale_total_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_sales(id,tenant_id,subtotal_cents,tax_cents,total_cents,idempotency_key,created_at) VALUES('bad','company-a',500,20,500,'other-key',1)")
    def test_duplicate_idempotency_key_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_sales(id,tenant_id,subtotal_cents,tax_cents,total_cents,idempotency_key,created_at) VALUES('bad','company-a',500,0,500,'key-12345678',1)")
    def test_negative_refund_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO pos_refunds(id,tenant_id,sale_id,amount_cents,reason,idempotency_key,created_at) VALUES('bad','company-a','company-a-s',-1,'test','refund-key',1)")
    def test_foreign_key_check(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])

if __name__=="__main__": unittest.main()
