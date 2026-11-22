// Safe, bounded diagnostic records for sandbox failures. No credentials, payloads, URLs or PII.
const ALLOWED = new Set(['SANDBOX_NOT_CONFIGURED','INVALID_REFUND','SQUARE_REDIRECT_BLOCKED','SQUARE_REFUND_REJECTED','SQUARE_PROVIDER_UNAVAILABLE','REFUND_ID_INVALID','PAYMENT_MISMATCH','REFUND_NOT_COMPLETED','AMOUNT_MISMATCH','LOCATION_MISMATCH','UNKNOWN_FAILURE','SQUARE_PAYMENT_REJECTED','SQUARE_LOCATIONS_REJECTED','PAYMENT_ID_NOT_RETURNED','PAYMENT_ID_MISMATCH','PAYMENT_NOT_COMPLETED','MERCHANT_MISMATCH','MERCHANT_LOCATION_NOT_VERIFIED','SALE_REFERENCE_MISMATCH','TOTAL_MISMATCH','PAYMENT_ALREADY_REFUNDED','INVALID_ATTEMPT']);
export function sanitizeSandboxFailure({reason,providerStatus,operation,at} = {}) {
  const status = Number.isInteger(providerStatus) && providerStatus >= 400 && providerStatus <= 599 ? providerStatus : null;
  const timestamp = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) && !Number.isNaN(Date.parse(at)) ? at : null;
  return Object.freeze({
    operation: operation === 'refund_verify' || operation === 'payment_reconcile' ? operation : 'unknown',
    reason: ALLOWED.has(reason) ? reason : 'UNKNOWN_FAILURE',
    providerStatus: status,
    at: timestamp
  });
}
