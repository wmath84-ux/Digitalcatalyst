import * as webpush from 'web-push';

type VercelRequest = { method?: string; body?: Record<string, unknown> };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void };

type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

const safeText = (value: unknown, max = 200) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const isPushSub = (value: unknown): value is PushSub => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const endpoint = candidate.endpoint;
  const keys = candidate.keys as Record<string, unknown> | undefined;
  return typeof endpoint === 'string'
    && endpoint.startsWith('https://')
    && Boolean(keys)
    && typeof keys?.p256dh === 'string'
    && typeof keys?.auth === 'string';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return res.status(500).json({ ok: false, error: 'Web Push VAPID keys are not configured.' });
  }
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT || 'mailto:admin@eduvora.app',
    publicKey,
    privateKey,
  );

  const title = safeText(req.body?.title, 80);
  const body = safeText(req.body?.body, 240);
  if (!title) return res.status(400).json({ ok: false, error: 'Missing notification title.' });

  const payload = {
    title,
    body,
    tag: safeText(req.body?.tag, 60) || undefined,
    icon: safeText(req.body?.icon, 300) || undefined,
    badge: safeText(req.body?.badge, 300) || undefined,
    url: safeText(req.body?.url, 500) || undefined,
  };
  const payloadString = JSON.stringify(payload);

  let subscriptions: PushSub[] = Array.isArray(req.body?.subscriptions)
    ? (req.body.subscriptions as unknown[]).filter(isPushSub)
    : [];

  const uid = safeText(req.body?.uid, 60);
  const sendToAll = Boolean(req.body?.all);

  if ((uid || sendToAll) && subscriptions.length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      return res.status(500).json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT is required when targeting stored subscriptions.' });
    }
    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
      const firestore = getFirestore(app);

      const snapshot = sendToAll
        ? await firestore.collectionGroup('webPushSubscriptions').get()
        : await firestore.collection('users').doc(uid).collection('webPushSubscriptions').get();

      subscriptions = snapshot.docs
        .map(item => item.data())
        .filter((data): data is Record<string, unknown> => Boolean(data))
        .map(data => ({
          endpoint: safeText(data.endpoint, 500),
          keys: { p256dh: safeText(data.p256dh, 300), auth: safeText(data.auth, 100) },
        }))
        .filter(isPushSub);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load subscriptions.';
      return res.status(500).json({ ok: false, error: message });
    }
  }

  if (subscriptions.length === 0) {
    return res.status(400).json({ ok: false, error: 'No push subscriptions provided or found.' });
  }

  const results: Array<{ endpoint: string; status: string; error?: string }> = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payloadString, { TTL: 60 * 60 * 24 });
      results.push({ endpoint: subscription.endpoint, status: 'sent' });
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 0;
      const message = error instanceof Error ? error.message : 'Send failed.';
      results.push({ endpoint: subscription.endpoint, status: `failed:${statusCode}`, error: message });
    }
  }

  const sent = results.filter(result => result.status === 'sent').length;
  return res.status(200).json({ ok: true, sent, failed: results.length - sent, results });
}
