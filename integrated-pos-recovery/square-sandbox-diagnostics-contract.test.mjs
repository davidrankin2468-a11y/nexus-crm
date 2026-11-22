import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSandboxFailure} from './square-sandbox-failure-diagnostics.js';

test('sandbox diagnostic allowlist rejects raw provider messages and secrets', () => {
 const record = sanitizeSandboxFailure({
   reason: 'Bearer SECRET card 4111111111111111',
   providerStatus: 200,
   operation: 'payment_submit',
   at: 'not a date',
   accessToken: 'SECRET',
   providerBody: {card: '4111111111111111'}
 });
 assert.deepEqual(record, {operation:'payment_submit',reason:'UNKNOWN_FAILURE',providerStatus:null,at:null});
 assert.equal(Object.isFrozen(record), true);
 assert.equal(JSON.stringify(record).includes('SECRET'), false);
 assert.equal(JSON.stringify(record).includes('4111111111111111'), false);
});

test('known payment failure retains safe code, bounded HTTP status and UTC timestamp', () => {
 assert.deepEqual(sanitizeSandboxFailure({
   reason:'SQUARE_PAYMENT_REJECTED',providerStatus:429,
   operation:'payment_reconcile',at:'2026-11-22T12:34:56.000Z'
 }), {operation:'payment_reconcile',reason:'SQUARE_PAYMENT_REJECTED',providerStatus:429,at:'2026-11-22T12:34:56.000Z'});
});

test('invalid status and unknown operation fail closed', () => {
 const record=sanitizeSandboxFailure({reason:'AMOUNT_MISMATCH',providerStatus:600,operation:'charge',at:'2026-99-99T12:00:00.000Z'});
 assert.deepEqual(record,{operation:'unknown',reason:'AMOUNT_MISMATCH',providerStatus:null,at:null});
});


test('payment submission diagnostic retains operation without accepting provider payload', () => {
 const record = sanitizeSandboxFailure({operation:'payment_submit',reason:'SQUARE_PAYMENT_REJECTED',providerStatus:402,at:'2026-11-22T12:34:56.000Z',providerBody:'sensitive'});
 assert.deepEqual(record,{operation:'payment_submit',reason:'SQUARE_PAYMENT_REJECTED',providerStatus:402,at:'2026-11-22T12:34:56.000Z'});
 assert.equal(JSON.stringify(record).includes('sensitive'),false);
});
