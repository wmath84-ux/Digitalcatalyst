import crypto from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import {
  adminDb,
  errorResponse,
  grantProductEntitlement,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/firebaseAdmin';

const cleanRazorpayId = (value: unknown) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const firebaseUser = await requireFirebaseUser(req);
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ ok: false, error: 'Razorpay verification is not configured.' });

    const orderId = cleanRazorpayId(req.body?.razorpay_order_id);
    const paymentId = cleanRazorpayId(req.body?.razorpay_payment_id);
    const signature = String(req.body?.razorpay_signature || '').trim();
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ ok: false, verified: false, error: 'Missing payment verification fields.' });
    }

    const expectedHex = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    const expected = Buffer.from(expectedHex, 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(400).json({ ok: false, verified: false, error: 'Payment signature verification failed.' });
    }

    const db = adminDb();
    const intentRef = db.collection('_paymentIntents').doc(orderId);
    const intentSnapshot = await intentRef.get();
    if (!intentSnapshot.exists) return res.status(404).json({ ok: false, verified: false, error: 'Secure payment intent was not found.' });
    const intent = intentSnapshot.data() as { uid?: string; productId?: string; amountPaise?: number; status?: string; paymentId?: string };
    if (intent.uid !== firebaseUser.uid) return res.status(403).json({ ok: false, verified: false, error: 'This payment belongs to a different account.' });
    if (intent.status === 'verified') {
      return res.status(200).json({ ok: true, verified: true, orderId, paymentId: intent.paymentId || paymentId, alreadyVerified: true });
    }

    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${authorization}` },
    });
    let payment = await paymentResponse.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
    if (!paymentResponse.ok) return res.status(400).json({ ok: false, verified: false, error: payment?.error?.description || 'Could not confirm payment with Razorpay.' });

    if (payment.status === 'authorized') {
      const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/capture`, {
        method: 'POST',
        headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(intent.amountPaise), currency: 'INR' }),
      });
      payment = await captureResponse.json().catch(() => payment) as Record<string, any>;
      if (!captureResponse.ok) return res.status(409).json({ ok: false, verified: false, error: payment?.error?.description || 'Payment was authorized but could not be captured.' });
    }

    if (payment.status !== 'captured') return res.status(409).json({ ok: false, verified: false, error: `Payment is ${String(payment.status || 'not captured')}.` });
    if (String(payment.order_id || '') !== orderId) return res.status(400).json({ ok: false, verified: false, error: 'Payment order mismatch.' });
    if (Number(payment.amount) !== Number(intent.amountPaise)) return res.status(400).json({ ok: false, verified: false, error: 'Payment amount mismatch.' });

    const productId = String(intent.productId || '');
    const productSnapshot = await db.collection('siteProducts').doc(productId).get();
    if (!productSnapshot.exists) return res.status(404).json({ ok: false, verified: false, error: 'Purchased product no longer exists.' });

    await grantProductEntitlement({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.name,
      productId,
      product: productSnapshot.data() as Record<string, unknown>,
      amountPaise: Number(intent.amountPaise),
      orderId,
      paymentId,
      source: 'razorpay',
    });
    await intentRef.set({ status: 'verified', paymentId, verifiedAt: Timestamp.now() }, { merge: true });

    return res.status(200).json({ ok: true, verified: true, orderId, paymentId });
  } catch (error) {
    console.error('Verify Razorpay payment failed', error);
    return errorResponse(res, error, 'Payment could not be verified.');
  }
}
