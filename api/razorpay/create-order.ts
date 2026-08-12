import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { findPaidUpdate, grantCourseUpdate } from '../_lib/courseUpdates';
import { adminDb, errorResponse, grantProductEntitlements, parseProductPricePaise, requireFirebaseUser, type VercelRequest, type VercelResponse } from '../_lib/firebaseAdmin';

const cleanId = (value: unknown) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const db = adminDb();
    const updateRequest = req.body?.updateSelection && typeof req.body.updateSelection === 'object' ? req.body.updateSelection as Record<string, unknown> : null;
    let amountPaise = 0;
    let productName = 'Digital product';
    let intentData: Record<string, unknown> = {};

    if (updateRequest) {
      const productId = cleanId(updateRequest.productId);
      const updateId = cleanId(updateRequest.updateId);
      if (!productId || !updateId) return res.status(400).json({ ok: false, error: 'Invalid course update selection.' });
      const [productSnapshot, basePurchase, userSnapshot] = await Promise.all([
        db.collection('siteProducts').doc(productId).get(),
        db.collection('users').doc(firebaseUser.uid).collection('purchases').doc(productId).get(),
        db.collection('users').doc(firebaseUser.uid).get(),
      ]);
      if (!productSnapshot.exists) return res.status(404).json({ ok: false, error: 'Course was not found.' });
      if (!basePurchase.exists) return res.status(403).json({ ok: false, error: 'Purchase the base course before buying an update.' });
      const owned = (userSnapshot.data()?.purchasedProductUpdateIds?.[productId] || []) as unknown[];
      if (owned.map(String).includes(updateId)) return res.status(200).json({ ok: true, free: true, verified: true, alreadyOwned: true, orderId: `OWNED-UPDATE-${Date.now()}` });
      const product = productSnapshot.data() as Record<string, unknown>;
      const update = findPaidUpdate(product, updateId);
      if (!update) return res.status(404).json({ ok: false, error: 'Course update is no longer available.' });
      amountPaise = update.pricePaise;
      productName = update.title;
      intentData = { checkoutType: 'course_update', productId, updateId };
      if (amountPaise === 0) {
        const orderId = `FREE-UPD-${Date.now()}-${firebaseUser.uid.slice(0, 8)}`;
        await grantCourseUpdate({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.name, productId, product, update, orderId, source: 'free' });
        return res.status(200).json({ ok: true, free: true, verified: true, orderId });
      }
    } else {
      const requestedIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [req.body?.productId];
      const productIds = Array.from(new Set(requestedIds.map(cleanId).filter(Boolean))).slice(0, 20);
      if (!productIds.length) return res.status(400).json({ ok: false, error: 'Missing product id.' });
      const snapshots = await db.getAll(...productIds.map((id) => db.collection('siteProducts').doc(id)));
      if (snapshots.some((snapshot) => !snapshot.exists)) return res.status(404).json({ ok: false, error: 'One or more products were not found.' });
      const allItems = snapshots.map((snapshot) => ({ productId: snapshot.id, product: snapshot.data() as Record<string, unknown> }));
      if (allItems.some(({ product }) => product.isVisible === false || product.inStock === false)) return res.status(409).json({ ok: false, error: 'One or more products are unavailable.' });
      const purchases = await db.getAll(...productIds.map((id) => db.collection('users').doc(firebaseUser.uid).collection('purchases').doc(id)));
      const items = allItems.filter((_, index) => !purchases[index].exists);
      if (!items.length) {
        await db.collection('users').doc(firebaseUser.uid).set({ cartProductIds: FieldValue.arrayRemove(...productIds) }, { merge: true });
        return res.status(200).json({ ok: true, free: true, verified: true, alreadyOwned: true, orderId: `OWNED-${Date.now()}` });
      }
      amountPaise = items.reduce((sum, item) => sum + parseProductPricePaise(item.product), 0);
      productName = items.length === 1 ? String(items[0].product.title || 'Digital product') : `${items.length} Digital Catalyst products`;
      intentData = { checkoutType: 'products', productIds: items.map((item) => item.productId), requestedProductIds: productIds };
      if (amountPaise === 0) {
        const orderId = `FREE-${Date.now()}-${firebaseUser.uid.slice(0, 8)}`;
        await grantProductEntitlements({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.name, items, cartProductIds: productIds, amountPaise: 0, orderId, source: 'free' });
        return res.status(200).json({ ok: true, free: true, verified: true, orderId });
      }
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ ok: false, error: 'Secure payments are not configured yet.' });
    const receipt = `dc_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`.slice(0, 40);
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes: { userId: firebaseUser.uid, type: String(intentData.checkoutType || 'products') } }) });
    const razorpayData = await razorpayResponse.json().catch(() => ({} as Record<string, unknown>)) as Record<string, any>;
    if (!razorpayResponse.ok) return res.status(razorpayResponse.status).json({ ok: false, error: razorpayData?.error?.description || 'Could not create Razorpay order.' });
    await db.collection('_paymentIntents').doc(String(razorpayData.id)).set({ uid: firebaseUser.uid, ...intentData, amountPaise, currency: 'INR', status: 'created', receipt, createdAt: Timestamp.now() });
    return res.status(200).json({ ok: true, free: false, keyId, orderId: razorpayData.id, amount: amountPaise, currency: 'INR', productName, customer: { name: firebaseUser.name || '', email: firebaseUser.email || '' } });
  } catch (error) {
    console.error('Create Razorpay order failed', error);
    return errorResponse(res, error, 'Could not start secure checkout.');
  }
}
