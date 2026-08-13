import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const WEB_PUSH_VAPID_PUBLIC_KEY =
  (typeof import.meta !== 'undefined' && String(import.meta.env?.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim())
  || 'BL35cvR9aNQmqzemYR1Zq8ZEfhRUDH1bgNKZ4W8K9n8iqSuU5046MRYDouaAmjkptDEyvEbBwJdr3VBM7dyybk8';

export type WebPushState = 'unsupported' | 'loading' | 'denied' | 'unsubscribed' | 'subscribed';

export interface StoredWebPushSubscription {
  uid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: string;
  userAgent: string;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
}

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
};

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const detectPlatform = () => {
  if (typeof window === 'undefined') return 'unknown';
  const userAgent = navigator.userAgent || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac/i.test(userAgent)) return 'macos';
  if (/Linux/i.test(userAgent)) return 'linux';
  return 'unknown';
};

export const isWebPushSupported = () =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

export const isServiceWorkerReady = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
    ]);
    return registration || null;
  } catch {
    return null;
  }
};

export const getCurrentPushSubscription = async (): Promise<PushSubscription | null> => {
  if (!isWebPushSupported()) return null;
  const registration = await isServiceWorkerReady();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
};

const buildSubscriptionRecord = (subscription: PushSubscription): StoredWebPushSubscription => ({
  uid: '',
  endpoint: subscription.endpoint,
  p256dh: subscription.getKey('p256dh') ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))) : '',
  auth: subscription.getKey('auth') ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))) : '',
  platform: detectPlatform(),
  userAgent: (navigator.userAgent || '').slice(0, 200),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastSeenAt: Date.now(),
});

export const subscribeToWebPush = async (): Promise<PushSubscription | null> => {
  if (!isWebPushSupported()) return null;
  if (window.Notification.permission === 'denied') return null;

  const registration = await isServiceWorkerReady();
  if (!registration) return null;

  const permission = window.Notification.permission === 'default'
    ? await window.Notification.requestPermission()
    : window.Notification.permission;
  if (permission !== 'granted') return null;

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const applicationServerKey = subscription.options?.applicationServerKey;
      const activeKeyBytes = applicationServerKey
        ? new Uint8Array(applicationServerKey as unknown as ArrayLike<number>)
        : null;
      const wantedKey = urlBase64ToUint8Array(WEB_PUSH_VAPID_PUBLIC_KEY);
      const sameKey = Boolean(activeKeyBytes)
        && activeKeyBytes!.length === wantedKey.length
        && activeKeyBytes!.every((byte, index) => byte === wantedKey[index]);
      if (sameKey) return subscription;
      await subscription.unsubscribe();
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_VAPID_PUBLIC_KEY),
    });
    return subscription;
  } catch {
    return null;
  }
};

export const saveWebPushSubscription = async (uid: string, subscription: PushSubscription): Promise<boolean> => {
  if (!uid || !subscription) return false;
  const record = buildSubscriptionRecord(subscription);
  const documentId = hashString(subscription.endpoint);
  try {
    await setDoc(doc(db, 'users', uid, 'webPushSubscriptions', documentId), { ...record, uid }, { merge: true });
    return true;
  } catch {
    return false;
  }
};

export const removeWebPushSubscription = async (uid: string, endpoint?: string): Promise<boolean> => {
  const subscription = endpoint ? null : await getCurrentPushSubscription();
  const targetEndpoint = endpoint || subscription?.endpoint || '';
  if (uid && targetEndpoint) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'webPushSubscriptions', hashString(targetEndpoint)));
    } catch {
      // Local unsubscribe still proceeds when the cloud copy is unreachable.
    }
  }
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      return false;
    }
  }
  return true;
};

export const loadStoredPushSubscriptions = async (uid: string): Promise<StoredWebPushSubscription[]> => {
  if (!uid) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'users', uid, 'webPushSubscriptions'), where('uid', '==', uid)));
    return snapshot.docs.map(item => item.data() as StoredWebPushSubscription);
  } catch {
    return [];
  }
};

export type WebPushTestResult = { ok: boolean; code: string; message: string };

/** End-to-end self-test: browser support → permission → service worker →
 * PushManager subscription → Firestore persistence → authenticated server send. */
export const sendWebPushSelfTest = async (uid: string): Promise<WebPushTestResult> => {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
    return { ok: false, code: 'login_required', message: 'Please sign in before testing notifications.' };
  }
  if (!isWebPushSupported()) {
    return { ok: false, code: 'browser_unsupported', message: 'This browser or in-app webview does not support Web Push. Try installed Chrome, Edge, or the Eduvora PWA.' };
  }
  if (!window.isSecureContext) {
    return { ok: false, code: 'https_required', message: 'Web Push requires HTTPS or localhost. Open the secure deployed app and retry.' };
  }
  if (window.Notification.permission === 'denied') {
    return { ok: false, code: 'permission_denied', message: 'Notification permission is blocked. Enable it in browser Site settings, then retry.' };
  }
  const registration = await isServiceWorkerReady();
  if (!registration) {
    return { ok: false, code: 'service_worker_unavailable', message: 'The app service worker is not ready. Reload the installed app and try again.' };
  }
  const subscription = await subscribeToWebPush();
  if (!subscription) {
    const denied = window.Notification.permission === 'denied';
    return { ok: false, code: denied ? 'permission_denied' : 'subscribe_failed', message: denied ? 'Notification permission was denied. Enable it in browser Site settings.' : 'The browser could not create a push subscription. Check notification permission and the public VAPID key.' };
  }
  if (!(await saveWebPushSubscription(uid, subscription))) {
    return { ok: false, code: 'save_failed', message: 'The browser subscribed, but the subscription could not be saved to Firestore. Deploy the latest Firestore rules and retry.' };
  }
  try {
    const token = await auth.currentUser.getIdToken(true);
    const response = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; code?: string; message?: string; error?: string };
    if (!response.ok || !payload.ok) return { ok: false, code: payload.code || `server_${response.status}`, message: payload.error || `Push test server returned ${response.status}.` };
    return { ok: true, code: 'sent', message: payload.message || 'Test notification sent. It should appear within a few seconds.' };
  } catch (error) {
    return { ok: false, code: 'network_error', message: error instanceof Error ? `Push test request failed: ${error.message}` : 'Push test request failed. Check your network.' };
  }
};
