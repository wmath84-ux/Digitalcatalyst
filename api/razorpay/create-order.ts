import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  adminDb,
  errorResponse,
  grantProductEntitlements,
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
    const requestedIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [req.body?.productId];
    const productIds = Array.from(new Set(requestedIds.map(cleanProductId).filter(Boolean))).slice(0, 20);
    if (productIds.length === 0) return res.status(400).json({ ok: false, error: 'Missing product id.' });

    const db = adminDb();
    const productSnapshots = await db.getAll(...productIds.map((productId) => db.collection('siteProducts').doc(productId)));
    if (productSnapshots.some((snapshot) => !snapshot.exists)) return res.status(404).json({ ok: false, error: 'One or more products were not found.' });
    const allItems = productSnapshots.map((snapshot) => ({ productId: snapshot.id, product: snapshot.data() as Record<string, unknown> }));
    if (allItems.some(({ product }) => product.isVisible === false || product.inStock === false)) {
      return res.status(409).json({ ok: false, error: 'One or more products are not currently available.' });
    }

    const purchaseSnapshots = await db.getAll(...productIds.map((productId) => db.collection('users').doc(firebaseUser.uid).collection('purchases').doc(productId)));
    const items = allItems.filter((_, index) => !purchaseSnapshots[index].exists);
    if (items.length === 0) {
      await db.collection('users').doc(firebaseUser.uid).set({ cartProductIds: FieldValue.arrayRemove(...productIds) }, { merge: true });
      return res.status(200).json({ ok: true, free: true, verified: true, alreadyOwned: true, orderId: `OWNED-${Date.now()}` });
    }

    const amountPaise = items.reduce((sum, item) => sum + parseProductPricePaise(item.product), 0);
    if (amountPaise === 0) {
      const freeOrderId = `FREE-${Date.now()}-${firebaseUser.uid.slice(0, 8)}`;
      await grantProductEntitlements({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.name,
        items,
        cartProductIds: productIds,
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
        notes: { userId: firebaseUser.uid, productIds: items.map((item) => item.productId).join(',').slice(0, 250) },
      }),
    });
    const razorpayData = await razorpayResponse.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
    if (!razorpayResponse.ok) {
      return res.status(razorpayResponse.status).json({ ok: false, error: razorpayData?.error?.description || 'Could not create Razorpay order.' });
    }

    await db.collection('_paymentIntents').doc(String(razorpayData.id)).set({
      uid: firebaseUser.uid,
      productIds: items.map((item) => item.productId),
      requestedProductIds: productIds,
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
      productName: items.length === 1 ? String(items[0].product.title || 'Digital product') : `${items.length} Digital Catalyst products`,
      customer: { name: firebaseUser.name || '', email: firebaseUser.email || '' },
    });
  } catch (error) {
    console.error('Create Razorpay order failed', error);
    return errorResponse(res, error, 'Could not start secure checkout.');
  }
}
