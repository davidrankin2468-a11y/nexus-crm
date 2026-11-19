"""Acceptance tests for the D1 Square Sandbox attempt migration (in-memory only)."""
import pathlib
import sqlite3
import unittest

MIGRATION = (pathlib.Path(__file__).parents[1] /
             "cloudflare/migrations/0001_square_sandbox_attempts.sql").read_text()

class SandboxAttemptSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE tenants(id TEXT PRIMARY KEY);
            CREATE TABLE pos_sales(
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(id),
                status TEXT NOT NULL,
                total_cents INTEGER NOT NULL,
                currency TEXT NOT NULL,
                UNIQUE(tenant_id,id)
            );
            INSERT INTO tenants VALUES ('company-A'),('company-B');
            INSERT INTO pos_sales VALUES
            ('sale-A','company-A','pending',1250,'USD'),
            ('sale-A2','company-A','pending',800,'USD'),
            ('sale-B','company-B','pending',1250,'USD'),
            ('sale-paid','company-A','completed',600,'USD');
        """)
        self.db.executescript(MIGRATION)

    def tearDown(self):
        self.db.close()

    def add(self, attempt="attempt-1", tenant="company-A", sale="sale-A",
            key="test-key-123", amount=1250, currency="USD",
            location="SQ_LOCATION_1"):
        self.db.execute("""
            INSERT INTO pos_square_sandbox_payment_attempts
            (id,tenant_id,sale_id,idempotency_key,square_location_id,
             amount_cents,currency,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,'prepared',100,100)
        """, (attempt,tenant,sale,key,location,amount,currency))

    def test_valid_pending_company_sale(self):
        self.add()
        row = self.db.execute("SELECT status,amount_cents FROM pos_square_sandbox_payment_attempts").fetchone()
        self.assertEqual(row, ("prepared",1250))

    def test_cross_company_sale_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(tenant="company-B")

    def test_mismatched_total_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(amount=1251)

    def test_completed_sale_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(sale="sale-paid",amount=600)

    def test_duplicate_sale_other_key_rejected(self):
        self.add()
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(attempt="attempt-2",key="other-key-456")

    def test_duplicate_idempotency_key_in_company_rejected(self):
        self.add()
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(attempt="attempt-2",sale="sale-A2",amount=800)

    def test_different_companies_can_reuse_idempotency_key(self):
        self.add()
        self.add(attempt="attempt-2",tenant="company-B",sale="sale-B")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pos_square_sandbox_payment_attempts").fetchone()[0],2)

    def test_non_usd_and_zero_amount_rejected(self):
        for currency,amount in [("EUR",1250),("USD",0)]:
            with self.subTest(currency=currency,amount=amount):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.add(currency=currency,amount=amount)

    def test_reference_fields_immutable(self):
        self.add()
        for statement in [
            "UPDATE pos_square_sandbox_payment_attempts SET amount_cents=1251",
            "UPDATE pos_square_sandbox_payment_attempts SET tenant_id='company-B'",
            "UPDATE pos_square_sandbox_payment_attempts SET square_location_id='SQ_LOCATION_2'",
        ]:
            with self.subTest(statement=statement):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.db.execute(statement)

    def test_duplicate_provider_payment_id_rejected(self):
        self.add()
        self.add(attempt="attempt-2",tenant="company-B",sale="sale-B",key="test-key-other")
        self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET provider_payment_id='square-pay-1234567' WHERE id='attempt-1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET provider_payment_id='square-pay-1234567' WHERE id='attempt-2'")

if __name__ == "__main__":
    unittest.main()
