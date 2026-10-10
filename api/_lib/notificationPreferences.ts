import type { Firestore } from "firebase-admin/firestore";
import { PREFERENCE_KEYS, notificationPolicy, type NotificationPolicyPayload } from "../../utils/userPreferences.js";

/** A per-dispatch cache, never a cross-request privacy cache. */
export function createNotificationPreferenceReader(db: Firestore) {
  const cache = new Map<string, Promise<ReturnType<typeof notificationPolicy>>>();
  return (uid: string, payload: NotificationPolicyPayload = {}) => {
    const key = `${uid}:${JSON.stringify(payload)}`;
    let result = cache.get(key);
    if (!result) {
      result = db.collection("users").doc(uid).get().then((doc) => notificationPolicy(doc.exists ? doc.data()?.preferences : Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, false])), payload));
      cache.set(key, result);
    }
    return result;
  };
}

/** Stored tokens may survive a local unsubscribe or a network failure. Their
 * existence is NEVER consent to send; account preferences are checked afresh. */
export async function userNotificationPolicy(db: Firestore, uid: string, payload: NotificationPolicyPayload = {}) {
  const doc = await db.collection("users").doc(uid).get();
  return notificationPolicy(doc.exists ? doc.data()?.preferences : Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, false])), payload);
}
