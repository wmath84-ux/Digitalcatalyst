import { applicationDefault, cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

export type VercelRequest = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

export type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

const readServiceAccount = () => {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be a valid service-account JSON string.');
  }
};

export const getFirebaseAdminApp = (): App => {
  if (getApps().length) return getApp();
  const serviceAccount = readServiceAccount();
  return initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId: serviceAccount?.project_id || 'my-website-761e9',
  });
};

export const adminDb = () => getFirestore(getFirebaseAdminApp());

const readAuthorization = (request: VercelRequest) => {
  const raw = request.headers?.authorization;
  return Array.isArray(raw) ? raw[0] || '' : String(raw || '');
};

export async function requireFirebaseUser(request: VercelRequest): Promise<DecodedIdToken> {
  const authorization = readAuthorization(request);
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  try {
    return await getAuth(getFirebaseAdminApp()).verifyIdToken(match[1], true);
  } catch {
    throw Object.assign(new Error('Your session is invalid or expired. Please log in again.'), { statusCode: 401 });
  }
}

export const errorResponse = (response: VercelResponse, error: unknown, fallback: string) => {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode) || 500
    : 500;
  const message = error instanceof Error ? error.message : fallback;
  return response.status(statusCode).json({ ok: false, error: message || fallback });
};

export const parseProductPricePaise = (data: Record<string, unknown>): number => {
  const source = data.salePrice === undefined || data.salePrice === null || data.salePrice === '' ? data.price : data.salePrice;
  const amount = Number(String(source ?? '0').replace(/[^0-9.-]/g, ''));
  const paise = Math.round(amount * 100);
  if (!Number.isFinite(paise) || paise < 0) throw Object.assign(new Error('Product has an invalid price.'), { statusCode: 409 });
  return paise;
};

export async function grantProductEntitlements(input: {
  uid: string;
  email?: string;
  name?: string;
  items: Array<{ productId: string; product: Record<string, unknown> }>;
  cartProductIds?: string[];
  amountPaise: number;
  orderId: string;
  paymentId?: string;
  source: 'razorpay' | 'free';
}) {
  const db = adminDb();
  const userRef = db.collection('users').doc(input.uid);
  const siteOrderRef = db.collection('siteOrders').doc(input.orderId);
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const purchaseEntries = input.items.map((item) => ({
      ...item,
      ref: userRef.collection('purchases').doc(item.productId),
    }));
    const existingPurchases = await Promise.all(purchaseEntries.map((item) => transaction.get(item.ref)));

    purchaseEntries.forEach((item, index) => {
      if (existingPurchases[index].exists) return;
      transaction.set(item.ref, {
        productId: Number.isFinite(Number(item.productId)) ? Number(item.productId) : item.productId,
        productDocumentId: item.productId,
        title: String(item.product.title || 'Digital product'),
        quantity: 1,
        total: `₹${(parseProductPricePaise(item.product) / 100).toFixed(2)}`,
        amountPaise: parseProductPricePaise(item.product),
        currency: 'INR',
        status: 'Verified',
        source: input.source,
        orderId: input.orderId,
        paymentId: input.paymentId || '',
        unlockedAt: now,
      });
    });

    transaction.set(userRef, {
      purchasedProductIds: FieldValue.arrayUnion(...input.items.map((item) => Number.isFinite(Number(item.productId)) ? Number(item.productId) : item.productId)),
      cartProductIds: FieldValue.arrayRemove(...(input.cartProductIds || input.items.map((item) => item.productId))),
      updatedAt: now,
    }, { merge: true });

    transaction.set(siteOrderRef, {
      id: input.orderId,
      customerUid: input.uid,
      customerName: input.name || '',
      customerEmail: input.email || '',
      date: now.toDate().toISOString(),
      total: `₹${(input.amountPaise / 100).toFixed(2)}`,
      amountPaise: input.amountPaise,
      currency: 'INR',
      status: 'Completed',
      paymentStatus: 'Verified',
      paymentProvider: input.source === 'razorpay' ? 'razorpay' : 'free',
      paymentId: input.paymentId || '',
      items: input.items.map((item) => ({
        id: item.productId,
        name: String(item.product.title || 'Digital product'),
        quantity: 1,
        price: `₹${(parseProductPricePaise(item.product) / 100).toFixed(2)}`,
      })),
      createdAt: now,
    }, { merge: true });
  });
}
