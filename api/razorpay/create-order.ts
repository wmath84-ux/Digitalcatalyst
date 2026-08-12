import { Timestamp } from 'firebase-admin/firestore';
import {
  adminDb,
  errorResponse,
  grantProductEntitlement,
  parseProductPricePaise,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/firebaseAdmin';

const cleanProductId = (value: unknown) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const firebaseUser = await requireFirebaseUser(req);
    const productId = cleanProductId(req.body?.productId);
    if (!productId) return res.status(400).json({ ok: false, error: 'Missing product id.' });

    const db = adminDb();
    const productSnapshot = await db.collection('siteProducts').doc(productId).get();
    if (!productSnapshot.exists) return res.status(404).json({ ok: false, error: 'Product was not found.' });
    const product = productSnapshot.data() as Record<string, unknown>;
    if (product.isVisible === false || product.inStock === false) {
      return res.status(409).json({ ok: false, error: 'This product is not currently available.' });
    }

    const amountPaise = parseProductPricePaise(product);
    if (amountPaise === 0) {
      const freeOrderId = `FREE-${Date.now()}-${firebaseUser.uid.slice(0, 8)}`;
      await grantProductEntitlement({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.name,
        productId,
        product,
        amountPaise: 0,
        orderId: freeOrderId,
        source: 'free',
      });
      return res.status(200).json({ ok: true, free: true, verified: true, orderId: freeOrderId });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(503).json({ ok: false, error: 'Secure payments are not configured yet. Add Razorpay server keys in deployment settings.' });
    }

    const receipt = `dc_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`.slice(0, 40);
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { userId: firebaseUser.uid, productId },
      }),
    });
    const razorpayData = await razorpayResponse.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
    if (!razorpayResponse.ok) {
      return res.status(razorpayResponse.status).json({ ok: false, error: razorpayData?.error?.description || 'Could not create Razorpay order.' });
    }

    await db.collection('_paymentIntents').doc(String(razorpayData.id)).set({
      uid: firebaseUser.uid,
      productId,
      amountPaise,
      currency: 'INR',
      status: 'created',
      receipt,
      createdAt: Timestamp.now(),
    });

    return res.status(200).json({
      ok: true,
      free: false,
      keyId,
      orderId: razorpayData.id,
      amount: amountPaise,
      currency: 'INR',
      productName: String(product.title || 'Digital product'),
      customer: { name: firebaseUser.name || '', email: firebaseUser.email || '' },
    });
  } catch (error) {
    console.error('Create Razorpay order failed', error);
    return errorResponse(res, error, 'Could not start secure checkout.');
  }
}
