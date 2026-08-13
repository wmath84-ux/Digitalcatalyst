import { applicationDefault, cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';

export type VercelRequest = {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

export type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

type ServiceAccountRecord = Record<string, unknown> & {
  project_id?: string;
  projectId?: string;
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

const configurationError = (message: string, cause?: unknown) => {
  const error = new Error(message) as Error & { statusCode: number; cause?: unknown; code: string };
  error.name = 'FirebaseAdminConfigurationError';
  error.code = 'firebase_admin_not_configured';
  error.statusCode = 503;
  if (cause !== undefined) error.cause = cause;
  return error;
};

const normalizePrivateKey = (value: unknown) =>
  String(value || '').trim().replace(/\\n/g, '\n');

// Escape raw control characters (newlines, tabs, carriage returns) that
// appear *inside* JSON string literals. A service-account paste whose
// `private_key` was re-saved by a text editor can contain real line breaks
// inside the string, which strict JSON.parse rejects. Characters outside
// string literals keep the JSON structure untouched, so this repair is safe
// to use as a fallback parse candidate.
const escapeControlCharsInJsonStrings = (input: string): string => {
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of input) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && ch === '\n') {
      out += '\\n';
      continue;
    }
    if (inString && ch === '\r') {
      out += '\\r';
      continue;
    }
    if (inString && ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
};

const parseServiceAccountValue = (rawValue: string): ServiceAccountRecord => {
  const raw = rawValue.trim().replace(/^\uFEFF/, '');
  let value: unknown = raw;
  let lastError: unknown;

  // Vercel accepts both plain JSON and base64 values. Supporting both avoids
  // brittle newline escaping when a PEM key is pasted into the dashboard.
  const candidates = [raw];
  // Some pastes arrive wrapped in an extra pair of quotes; try unwrapped.
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    candidates.push(raw.slice(1, -1));
  }
  // If the paste contains real line breaks inside the PEM string, repair
  // them so JSON.parse accepts the document.
  const repaired = escapeControlCharsInJsonStrings(raw);
  if (repaired !== raw) candidates.push(repaired);
  if (!raw.startsWith('{') && !raw.startsWith('"{')) {
    try {
      candidates.push(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      // JSON parsing below will produce the actionable configuration error.
    }
  }

  for (const candidate of candidates) {
    try {
      value = JSON.parse(candidate);
      // Some deployment tools wrap the complete JSON object in a JSON string.
      if (typeof value === 'string') value = JSON.parse(value);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as ServiceAccountRecord;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw configurationError('FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64-encoded JSON.', lastError);
};

const serviceAccountFromIndividualVariables = (): ServiceAccountRecord | null => {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId && !clientEmail && !privateKey) return null;
  if (!projectId || !clientEmail || !privateKey) {
    throw configurationError('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must all be configured together.');
  }
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
};

const readServiceAccount = (): ServiceAccountRecord | null => {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  const parsed = raw ? parseServiceAccountValue(raw) : serviceAccountFromIndividualVariables();
  if (!parsed) return null;

  const projectId = String(parsed.project_id || parsed.projectId || '').trim();
  const clientEmail = String(parsed.client_email || parsed.clientEmail || '').trim();
  const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey);
  if (!projectId || !clientEmail || !privateKey) {
    throw configurationError('The Firebase service account must include project_id, client_email, and private_key.');
  }

  return { ...parsed, project_id: projectId, client_email: clientEmail, private_key: privateKey };
};

export const getFirebaseAdminApp = (): App => {
  if (getApps().length) return getApp();
  const serviceAccount = readServiceAccount();
  try {
    return initializeApp({
      credential: serviceAccount ? cert(serviceAccount as ServiceAccount) : applicationDefault(),
      projectId: serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID || 'my-website-761e9',
    });
  } catch (error) {
    throw configurationError('Firebase Admin credentials are invalid.', error);
  }
};

export const adminDb = (): Firestore => getFirestore(getFirebaseAdminApp());

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
  } catch (error) {
    // Do not misreport a deployment credential failure as an expired user
    // session. It is recoverable by the operator, not by logging in again.
    if (isCredentialFailure(error) || (error instanceof Error && 'statusCode' in error && Number((error as { statusCode?: unknown }).statusCode) === 503)) {
      throw configurationError('Firebase Admin credentials are unavailable.', error);
    }
    throw Object.assign(new Error('Your session is invalid or expired. Please log in again.'), { statusCode: 401 });
  }
}

const isCredentialFailure = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  if (error.name === 'FirebaseAdminConfigurationError') return true;
  const text = `${error.name} ${error.message}`.toLowerCase();
  return [
    'could not load the default credentials',
    'default credentials were not found',
    'metadata.google.internal',
    'invalid pem',
    'no start line',
    'decoder routines',
    'credential implementation provided to initializeapp',
  ].some((fragment) => text.includes(fragment));
};

export const errorResponse = (response: VercelResponse, error: unknown, fallback: string) => {
  // Keep detailed errors in server logs while returning a stable, actionable
  // JSON response. This also prevents Vercel's generic HTML 500 page from
  // turning into the unhelpful client message "Server returned 500".
  console.error(`[api] ${fallback}`, error);
  if (isCredentialFailure(error)) {
    return response.status(503).json({
      ok: false,
      code: 'firebase_admin_not_configured',
      error: 'Secure pricing is temporarily unavailable. Please try again shortly.',
    });
  }
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode) || 500
    : 500;
  const message = error instanceof Error ? error.message : fallback;
  return response.status(statusCode).json({ ok: false, error: message || fallback });
};

export const parseProductPricePaise = (data: Record<string, unknown>): number => {
  if (data.isFree === true) return 0;
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

  await db.runTransaction(async (transaction: Transaction) => {
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
