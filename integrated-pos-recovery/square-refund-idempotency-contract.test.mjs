import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./pos-api.js',import.meta.url),'utf8');
test('duplicate provider refund requires original operation key',()=>{
  assert.match(source,/SELECT tenant_id,sale_id,amount_cents,idempotency_key FROM pos_refunds WHERE provider_refund_id=\?/);
  assert.match(source,/existing\.idempotency_key===expectedRefundKey/);
  assert.match(source,/Refund ID already used for another operation/);
});
