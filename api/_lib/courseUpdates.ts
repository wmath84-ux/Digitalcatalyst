import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminDb, parseProductPricePaise } from './firebaseAdmin.js';

type AccessItem = Record<string, any>;

export const findPaidUpdate = (product: Record<string, unknown>, updateId: string) => {
  const matches: AccessItem[] = [];
  const visit = (modules: AccessItem[]) => modules.forEach((module) => {
    if (module?.accessLevel === 'paidUpdate' && String(module.paidUpdateId || module.id) === updateId) matches.push(module);
    (Array.isArray(module?.files) ? module.files : []).forEach((file: AccessItem) => {
      if (file?.accessLevel === 'paidUpdate' && String(file.paidUpdateId || file.id) === updateId) matches.push(file);
    });
    visit(Array.isArray(module?.modules) ? module.modules : []);
  });
  visit(Array.isArray(product.courseContent) ? product.courseContent as AccessItem[] : []);
  if (!matches.length) return null;
  const pricePaise = Math.max(...matches.map((item) => parseProductPricePaise({ price: item.paidUpdatePrice || 0 })));
  return {
    id: updateId,
    title: String(matches.find((item) => item.paidUpdateTitle)?.paidUpdateTitle || 'Course update'),
    pricePaise,
    contentNames: matches.map((item) => String(item.title || item.name || 'New content')),
  };
};

export async function grantCourseUpdate(input: { uid: string; email?: string; name?: string; productId: string; product: Record<string, unknown>; update: { id: string; title: string; pricePaise: number; contentNames: string[] }; orderId: string; paymentId?: string; source: 'razorpay' | 'free' }) {
  const db = adminDb();
  const userRef = db.collection('users').doc(input.uid);
  const entitlementRef = userRef.collection('purchases').doc(`${input.productId}__update__${input.update.id}`);
  const orderRef = db.collection('siteOrders').doc(input.orderId);
  const now = Timestamp.now();
  await db.runTransaction(async (transaction: Transaction) => {
    const existing = await transaction.get(entitlementRef);
    if (!existing.exists) transaction.set(entitlementRef, {
      productId: input.productId,
      productDocumentId: input.productId,
      updateId: input.update.id,
      title: input.update.title,
      contentNames: input.update.contentNames,
      amountPaise: input.update.pricePaise,
      total: `₹${(input.update.pricePaise / 100).toFixed(2)}`,
      status: 'Verified',
      source: input.source,
      orderId: input.orderId,
      paymentId: input.paymentId || '',
      unlockedAt: now,
    });
    transaction.update(userRef, { [`purchasedProductUpdateIds.${input.productId}`]: FieldValue.arrayUnion(input.update.id), updatedAt: now });
    transaction.set(orderRef, {
      id: input.orderId,
      customerUid: input.uid,
      customerName: input.name || '',
      customerEmail: input.email || '',
      date: now.toDate().toISOString(),
      total: `₹${(input.update.pricePaise / 100).toFixed(2)}`,
      amountPaise: input.update.pricePaise,
      currency: 'INR',
      status: 'Completed',
      paymentStatus: 'Verified',
      paymentProvider: input.source === 'razorpay' ? 'razorpay' : 'free',
      paymentId: input.paymentId || '',
      checkoutType: 'course_update',
      productId: input.productId,
      updateId: input.update.id,
      items: [{ id: input.update.id, name: input.update.title, quantity: 1, price: `₹${(input.update.pricePaise / 100).toFixed(2)}` }],
      createdAt: now,
    }, { merge: true });
  });
}
