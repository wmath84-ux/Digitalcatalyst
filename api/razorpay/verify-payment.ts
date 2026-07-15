import crypto from 'crypto';

type VercelRequest = { method?: string; body?: Record<string, unknown> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: 'Razorpay verification secret is not configured.' });

  const orderId = String(req.body?.razorpay_order_id || '').trim();
  const paymentId = String(req.body?.razorpay_payment_id || '').trim();
  const signature = String(req.body?.razorpay_signature || '').trim();
  if (!orderId || !paymentId || !signature) return res.status(400).json({ ok: false, verified: false, error: 'Missing verification fields.' });

  const expectedHex = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  const verified = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!verified) return res.status(400).json({ ok: false, verified: false, error: 'Payment signature verification failed.' });

  return res.status(200).json({ ok: true, verified: true, razorpayOrderId: orderId, razorpayPaymentId: paymentId });
}
