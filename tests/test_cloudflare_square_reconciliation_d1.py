"""Rollback-only SQLite tests for the Cloudflare D1 Square reconciliation guards."""
import pathlib
import sqlite3
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]/"cloudflare"/"migrations"
V1=(ROOT/"0001_square_sandbox_attempts.sql").read_text()
V2=(ROOT/"0002_square_sandbox_reconciliation.sql").read_text()
V3=(ROOT/"0003_square_sandbox_submission_reconcile.sql").read_text()
SALE="f341ff51-0adb-487f-8ac0-b0f9a58945fd"
SALE_B="9b843782-2931-4337-a9b5-130510279f64"
PAYMENT="sq-test-payment-123456789"
class ReconcileTransactionTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:")
  self.db.execute("PRAGMA foreign_keys=ON")
  self.db.executescript("""
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE pos_sales (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
      status TEXT NOT NULL CHECK(status IN ('pending','completed','voided','partially_refunded','refunded')),
      total_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
      completed_at INTEGER, UNIQUE(tenant_id,id)
    );
    CREATE TABLE pos_payment_events (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      sale_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_event_id TEXT NOT NULL, event_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
      created_at INTEGER NOT NULL, UNIQUE(provider,provider_event_id),
      FOREIGN KEY(tenant_id,sale_id) REFERENCES pos_sales(tenant_id,id)
    );
    INSERT INTO tenants VALUES ('A'),('B');
  """)
  self.db.execute("INSERT INTO pos_sales(id,tenant_id,status,total_cents,currency) VALUES(?, 'A','pending',1250,'USD')",(SALE,))
  self.db.execute("INSERT INTO pos_sales(id,tenant_id,status,total_cents,currency) VALUES(?, 'B','pending',1250,'USD')",(SALE_B,))
  self.db.executescript(V1)
  self.db.executescript(V2)
  self.db.executescript(V3)
  self.db.execute("""INSERT INTO pos_square_sandbox_payment_attempts
    (id,tenant_id,sale_id,idempotency_key,square_location_id,amount_cents,currency,status,created_at,updated_at)
    VALUES ('attempt-A','A',?,'idem-key-A','SQUARE_LOC',1250,'USD','prepared',100,100)""",(SALE,))
  self.db.execute("""INSERT INTO pos_square_sandbox_payment_attempts
    (id,tenant_id,sale_id,idempotency_key,square_location_id,amount_cents,currency,status,created_at,updated_at)
    VALUES ('attempt-B','B',?,'idem-key-B','SQUARE_LOC',1250,'USD','prepared',100,100)""",(SALE_B,))
  self.db.commit()
 def tearDown(self):self.db.close()
 def receipt(self,tenant='A',sale=SALE,payment=PAYMENT,amount=1250):
  self.db.execute("""INSERT INTO pos_payment_events
     (id,tenant_id,sale_id,provider,provider_event_id,event_type,amount_cents,created_at)
     VALUES ('evt-'||?, ?,?,'square_sandbox',?,'payment_completed',?,100)""",(tenant,tenant,sale,payment,amount))
 def successful_reconcile(self):
  with self.db:
   self.receipt()
   self.db.execute("UPDATE pos_sales SET status='completed',completed_at=100 WHERE tenant_id='A' AND id=? AND status='pending'",(SALE,))
   self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='reconciled',provider_payment_id=? WHERE id='attempt-A' AND tenant_id='A' AND status='prepared'",(PAYMENT,))
 def test_happy_path_atomic_reconciliation(self):
  self.successful_reconcile()
  self.assertEqual(self.db.execute("SELECT status FROM pos_sales WHERE id=?",(SALE,)).fetchone()[0],"completed")
  self.assertEqual(self.db.execute("SELECT status,provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE id='attempt-A'").fetchone(),("reconciled",PAYMENT))
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pos_payment_events").fetchone()[0],1)
 def test_rolled_back_if_attempt_update_fails(self):
  with self.assertRaises(sqlite3.IntegrityError):
   with self.db:
    self.receipt()
    self.db.execute("UPDATE pos_sales SET status='completed' WHERE id=?",(SALE,))
    self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='reconciled',provider_payment_id='other-payment-123' WHERE id='attempt-A'")
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM pos_payment_events").fetchone()[0],0)
  self.assertEqual(self.db.execute("SELECT status FROM pos_sales WHERE id=?",(SALE,)).fetchone()[0],"pending")
 def test_completed_unreconciled_attempt_can_be_reconciled(self):
  with self.db:
   self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='completed_unreconciled',provider_payment_id=? WHERE id='attempt-A'",(PAYMENT,))
   self.receipt()
   self.db.execute("UPDATE pos_sales SET status='completed' WHERE id=?",(SALE,))
   self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='reconciled' WHERE id='attempt-A'")
  self.assertEqual(self.db.execute("SELECT status FROM pos_square_sandbox_payment_attempts WHERE id='attempt-A'").fetchone()[0],'reconciled')
 def test_wrong_provider_id_cannot_reconcile_submitted_attempt(self):
  self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='completed_unreconciled',provider_payment_id=? WHERE id='attempt-A'",(PAYMENT,))
  with self.assertRaises(sqlite3.IntegrityError):
   self.receipt(payment='different-square-pay-111')
 def test_submitted_state_cannot_be_reconciled_before_provider_response(self):
  self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='submitted' WHERE id='attempt-A'")
  with self.assertRaises(sqlite3.IntegrityError):
   self.receipt()
 def test_duplicate_event_denied(self):
  self.successful_reconcile()
  with self.assertRaises(sqlite3.IntegrityError):self.receipt()
 def test_attempt_reconcile_without_receipt_denied(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE pos_square_sandbox_payment_attempts SET status='reconciled',provider_payment_id=? WHERE id='attempt-A'",(PAYMENT,))
 def test_wrong_amount_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.receipt(amount=1251)
 def test_cross_company_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.receipt(tenant='B',sale=SALE)
 def test_other_company_sale_remains_pending(self):
  self.successful_reconcile()
  self.assertEqual(self.db.execute("SELECT status FROM pos_sales WHERE id=?",(SALE_B,)).fetchone()[0],"pending")
 def test_second_receipt_for_same_sale_rejected(self):
  self.successful_reconcile()
  with self.assertRaises(sqlite3.IntegrityError):self.receipt(payment='sq-other-payment-87654321')
 def test_provider_id_cannot_be_reused(self):
  self.successful_reconcile()
  with self.assertRaises(sqlite3.IntegrityError):self.receipt(tenant='B',sale=SALE_B)
 def test_receipts_append_only(self):
  self.successful_reconcile()
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE pos_payment_events SET amount_cents=500")
if __name__=="__main__":unittest.main()
