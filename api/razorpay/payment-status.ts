type VercelRequest = { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void };

const cleanOrderId = (value: unknown): string =>
  String(value || '').trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80);

const readExpectedAmountPaise = (value: unknown): number => {
  const amount = Number(value || 0);
  const paise = Math.round(amount * 100);
  return Number.isFinite(paise) && paise > 0 ? paise : 0;
};

const pickLatestPayment = (items: any[] = []) => {
  const sorted = [...items].sort((a, b) => Number(b?.created_at || 0) - Number(a?.created_at || 0));
  return sorted.find(payment => payment?.status === 'captured')
    || sorted.find(payment => payment?.status === 'authorized')
    || sorted.find(payment => payment?.status === 'failed')
    || sorted[0]
    || null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, status: 'error', error: 'Method not allowed' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({ ok: false, status: 'error', error: 'Razorpay server keys are not configured.' });
  }

  const orderId = cleanOrderId(req.body?.orderId || req.query?.orderId);
  if (!orderId) {
    return res.status(400).json({ ok: false, status: 'error', error: 'Missing Razorpay order id.' });
  }

  const expectedAmountPaise = readExpectedAmountPaise(req.body?.expectedAmount || req.query?.expectedAmount);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}/payments`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });

  const data = await response.json().catch(() => ({} as any)) as any;
  if (!response.ok) {
    return res.status(response.status).json({ ok: false, status: 'error', error: data?.error?.description || 'Could not fetch payment status.' });
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const latestPayment = pickLatestPayment(items);
  const paidPayment = items.find((payment: any) => (payment?.status === 'captured' || payment?.status === 'authorized') && (!expectedAmountPaise || Number(payment?.amount) === expectedAmountPaise));
  const failedPayment = items.find((payment: any) => payment?.status === 'failed');

  if (paidPayment) {
    return res.status(200).json({
      ok: true,
      status: 'paid',
      orderId,
      paymentId: paidPayment.id,
      paymentStatus: paidPayment.status,
      amount: Number(paidPayment.amount || 0),
      expectedAmount: expectedAmountPaise,
      amountMatches: !expectedAmountPaise || Number(paidPayment.amount || 0) === expectedAmountPaise,
      method: paidPayment.method || null,
    });
  }

  if (latestPayment?.status === 'captured' || latestPayment?.status === 'authorized') {
    return res.status(200).json({
      ok: true,
      status: 'amount_mismatch',
      orderId,
      paymentId: latestPayment.id,
      paymentStatus: latestPayment.status,
      amount: Number(latestPayment.amount || 0),
      expectedAmount: expectedAmountPaise,
      amountMatches: false,
      error: 'Payment was found, but amount did not match this checkout.',
    });
  }

  if (failedPayment) {
    return res.status(200).json({
      ok: true,
      status: 'failed',
      orderId,
      paymentId: failedPayment.id,
      paymentStatus: failedPayment.status,
      amount: Number(failedPayment.amount || 0),
      expectedAmount: expectedAmountPaise,
      amountMatches: false,
      error: failedPayment.error_description || 'Payment failed or was not completed.',
    });
  }

  return res.status(200).json({
    ok: true,
    status: items.length ? 'pending' : 'not_paid',
    orderId,
    paymentId: latestPayment?.id || '',
    paymentStatus: latestPayment?.status || 'not_started',
    amount: Number(latestPayment?.amount || 0),
    expectedAmount: expectedAmountPaise,
    amountMatches: false,
  });
}
