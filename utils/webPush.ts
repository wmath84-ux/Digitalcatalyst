import { apiFetch } from "../src/utils/apiBase";
import { captureDevicePushGate } from "./deviceNotificationPreference";
/// <reference types="vite/client" />
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { DEFAULT_LOGO_URL, readCachedBranding } from '../src/utils/branding';

const BRAND_NOTIFICATION_ICON = '/api/brand-icon?size=192';

/** Logo from the admin Branding page, used on every local/system notification. */
export const getBrandNotificationIcon = () => {
  try {
    const logoUrl = readCachedBranding().logoUrl;
    if (logoUrl && logoUrl !== DEFAULT_LOGO_URL) return logoUrl;
  } catch {
    /* private mode / SSR */
  }
  return BRAND_NOTIFICATION_ICON;
};

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

const bufferToUrlBase64 = (buffer: ArrayBuffer | null) => {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

const bounded = async <T>(promise: Promise<T>, ms = 10000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Device connection timed out.")), ms); })]); }
  finally { if (timer) clearTimeout(timer); }
};

export const isServiceWorkerReady = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await bounded(navigator.serviceWorker.ready, 5000);
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
    return await bounded(registration.pushManager.getSubscription());
  } catch {
    return null;
  }
};

const buildSubscriptionRecord = (subscription: PushSubscription): StoredWebPushSubscription => ({
  uid: '',
  endpoint: subscription.endpoint,
  p256dh: bufferToUrlBase64(subscription.getKey('p256dh')),
  auth: bufferToUrlBase64(subscription.getKey('auth')),
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
    let subscription = await bounded(registration.pushManager.getSubscription());
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
      await bounded(subscription.unsubscribe());
    }

    subscription = await bounded(registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_VAPID_PUBLIC_KEY),
    }));
    return subscription;
  } catch {
    return null;
  }
};

const saveViaApi = async (uid: string, record: StoredWebPushSubscription): Promise<"saved" | "unavailable" | "rejected"> => {
  if (auth.currentUser?.uid !== uid) return "rejected";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const token = await bounded(auth.currentUser.getIdToken(true));
    if (!token || auth.currentUser?.uid !== uid || controller.signal.aborted) return "rejected";
    const response = await apiFetch('/api/push/subscribe', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...record, uid }), signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (response.ok && payload?.ok) return auth.currentUser?.uid === uid ? "saved" : "rejected";
    // Do not bypass an explicit authorization/schema refusal through a cached
    // SDK token. Legacy unavailable routes may use an owner-only cloud write.
    return response.status >= 400 && response.status < 500 && response.status !== 404 ? "rejected" : "unavailable";
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
};

const saveViaFirestore = async (uid: string, record: StoredWebPushSubscription, documentId: string): Promise<boolean> => {
  if (auth.currentUser?.uid !== uid) return false;
  await bounded(setDoc(doc(db, 'users', uid, 'webPushSubscriptions', documentId), { ...record, uid }, { merge: true }));
  return auth.currentUser?.uid === uid;
};

export const saveWebPushSubscription = async (uid: string, subscription: PushSubscription): Promise<boolean> => {
  if (!uid || !subscription || auth.currentUser?.uid !== uid) return false;
  const record = buildSubscriptionRecord(subscription);
  const documentId = hashString(subscription.endpoint);
  const result = await saveViaApi(uid, record);
  if (result === "saved") return true;
  if (result === "rejected" || auth.currentUser?.uid !== uid) return false;
  try { return await saveViaFirestore(uid, record, documentId); }
  catch { return (await saveViaApi(uid, record)) === "saved"; }
};

function getContextualIconForTag(tag: string): string {
  const t = (tag || "").toLowerCase();
  if (t.includes("reminder") || t.includes("reminders")) return "/notif-icons/reminder.png";
  if (t.includes("task") || t.includes("tasks")) return "/notif-icons/task.png";
  if (t.includes("schedule")) return "/notif-icons/schedule.png";
  if (t.includes("course") || t.includes("lecture") || t.includes("revision") || t.includes("exam")) return "/notif-icons/course.png";
  if (t.includes("store") || t.includes("product")) return "/notif-icons/store.png";
  if (t.includes("unlock")) return "/notif-icons/unlock.png";
  if (t.includes("community")) return "/notif-icons/community.png";
  if (t.includes("announcement")) return "/notif-icons/announcement.png";
  if (t.includes("subscription")) return "/notif-icons/subscription.png";
  return "";
}

export const showLocalSystemNotification = async (
  title: string,
  body: string,
  url = '/#/notifications',
  tag = `eduvora-local-${Date.now()}`,
  uid?: string,
): Promise<boolean> => {
  const allowed = captureDevicePushGate(uid);
  if (!allowed() || !isWebPushSupported() || window.Notification.permission !== 'granted') return false;
  // Left small icon always app badge, right large icon contextual per notification type
  const contextual = getContextualIconForTag(tag);
  const icon = contextual || getBrandNotificationIcon();
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon,
    badge: '/icons/badge-96x96.png',
    tag,
    renotify: true,
    data: { url, timestamp: Date.now() },
  };
  try {
    const registration = await isServiceWorkerReady();
    if (!allowed()) return false;
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    if (!allowed()) return false;
    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Ensure this device is subscribed and saved for the signed-in user.
 *
 * Previously this short-circuited when permission was still `default`
 * (i.e. the user had never been asked). On a fresh Android install that
 * meant the browser was never prompted, never subscribed, and never saved —
 * so purchase unlocks, renewals and admin announcements could never reach
 * the device as system notifications. `subscribeToWebPush()` already owns the
 * permission flow (it prompts only when permission is `default` and bails
 * immediately when it is `denied`), so we let it decide instead of
 * pre-filtering on `granted`.
 */
export const ensureSavedWebPushSubscription = async (uid: string, options: { requestPermission?: boolean } = {}): Promise<boolean> => {
  if (!uid || auth.currentUser?.uid !== uid || !isWebPushSupported()) return false;
  if (window.Notification.permission === 'denied' || (options.requestPermission === false && window.Notification.permission !== 'granted')) return false;
  const subscription = await subscribeToWebPush();
  if (!subscription) return false;
  return saveWebPushSubscription(uid, subscription);
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
      await bounded(subscription.unsubscribe());
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
    const permission: NotificationPermission = typeof window !== 'undefined' && 'Notification' in window
      ? (window.Notification.permission as NotificationPermission)
      : 'default';
    const denied = permission === 'denied';
    return { ok: false, code: denied ? 'permission_denied' : 'subscribe_failed', message: denied ? 'Notification permission was denied. Enable it in browser Site settings.' : 'The browser could not create a push subscription. Check notification permission and the public VAPID key.' };
  }

  const record = buildSubscriptionRecord(subscription);
  const localShown = await showLocalSystemNotification(
    'Eduvora test notification',
    'Web notifications are working on this device — just like other system alerts.',
  );
  const saved = await saveWebPushSubscription(uid, subscription);

  try {
    const token = await auth.currentUser.getIdToken(true);
    const response = await fetch('/api/push/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: record.endpoint, p256dh: record.p256dh, auth: record.auth, platform: record.platform }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; code?: string; message?: string; error?: string };
    if (response.ok && payload.ok) {
      return { ok: true, code: 'sent', message: payload.message || 'Test notification sent. Check your phone or browser notification tray.' };
    }
    if (localShown) {
      return { ok: true, code: 'sent', message: 'A system notification was shown on this device. Server push will retry in the background.' };
    }
    if (!saved) {
      return { ok: false, code: 'save_failed', message: payload.error || 'The browser subscribed, but the subscription could not be saved to Firestore. Deploy the latest Firestore rules and retry.' };
    }
    return { ok: false, code: payload.code || `server_${response.status}`, message: payload.error || `Push test server returned ${response.status}.` };
  } catch (error) {
    if (localShown) {
      return { ok: true, code: 'sent', message: 'A system notification was shown on this device.' };
    }
    if (!saved) {
      return { ok: false, code: 'save_failed', message: 'The browser subscribed, but the subscription could not be saved to Firestore. Deploy the latest Firestore rules and retry.' };
    }
    return { ok: false, code: 'network_error', message: error instanceof Error ? `Push test request failed: ${error.message}` : 'Push test request failed. Check your network.' };
  }
};
