type VercelRequest = { method?: string; body?: Record<string, unknown> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void };

const safeText = (value: unknown, max = 80) =>
  String(value || '').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return res.status(500).json({ ok: false, error: 'Razorpay server keys are not configured.' });

  const amountRupees = Number(req.body?.amount || 0);
  const amountPaise = Math.round(amountRupees * 100);
  if (!Number.isFinite(amountRupees) || !Number.isFinite(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid checkout amount.' });
  }

  const receipt = safeText(req.body?.receipt, 40) || `dc_${Date.now()}`;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: {
        checkoutType: safeText(req.body?.checkoutType, 30),
        userId: safeText(req.body?.userId),
        targetId: safeText(req.body?.targetId),
        billingCycle: safeText(req.body?.billingCycle, 20),
      },
    }),
  });

  const data = await response.json().catch(() => ({} as any)) as any;
  if (!response.ok) return res.status(response.status).json({ ok: false, error: data?.error?.description || 'Could not create Razorpay order.' });

  return res.status(200).json({ ok: true, keyId, orderId: data.id, amount: data.amount, currency: data.currency, receipt });
}
