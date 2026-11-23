// Call only from an authenticated server route with a sale loaded from the database.
export function squareSandbox({ accessToken, locationId, fetchImpl = fetch }) {
  if (!accessToken || !locationId) throw new Error('Square Sandbox is not configured.');

  async function send(path, body) {
    const response = await fetchImpl('https://connect.squareupsandbox.com/v2/' + path, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('Square Sandbox request failed (' + response.status + ').');
    return response.json();
  }

  function operation(idempotencyKey, cents) {
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey) || !Number.isSafeInteger(cents) || cents <= 0) {
      throw new Error('A stored operation key and positive amount in cents are required.');
    }
    return { idempotency_key: idempotencyKey, amount_money: { amount: cents, currency: 'USD' } };
  }

  return {
    async pay({ idempotencyKey, cents }) {
      const { payment } = await send('payments', {
        ...operation(idempotencyKey, cents),
        location_id: locationId,
        source_id: 'cnon:card-nonce-ok',
        autocomplete: true
      });
      if (!payment?.id || payment.status !== 'COMPLETED' || payment.location_id !== locationId ||
          payment.amount_money?.amount !== cents || payment.amount_money?.currency !== 'USD') {
        throw new Error('Square payment requires reconciliation.');
      }
      return payment.id;
    },
    async refund({ idempotencyKey, cents, paymentId }) {
      if (!paymentId) throw new Error('A recorded Square payment is required.');
      const { refund } = await send('refunds', {
        ...operation(idempotencyKey, cents),
        payment_id: paymentId
      });
      if (!refund?.id || refund.payment_id !== paymentId || refund.location_id !== locationId ||
          refund.amount_money?.amount !== cents || refund.amount_money?.currency !== 'USD' ||
          !['COMPLETED', 'PENDING'].includes(refund.status)) {
        throw new Error('Square refund requires reconciliation.');
      }
      return { id: refund.id, status: refund.status };
    }
  };
}
