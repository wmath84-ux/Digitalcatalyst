import { useSyncExternalStore } from "react";
import { doc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { createPreferenceStore, type PreferenceResult } from "../../utils/preferenceStore";
import { normalizeUserPreferences, type PreferenceKey } from "../../utils/userPreferences";
import { retrySharedDoc, subscribeSharedDoc } from "../lib/sharedSnapshot";
import { apiFetch } from "../utils/apiBase";

async function requestPreferences(uid: string, patch?: { key: PreferenceKey; value: boolean }): Promise<PreferenceResult> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Sign in again to save your settings.");
  const controller = new AbortController();
  const timeoutError = () => new Error("The save could not be confirmed. Check your connection and retry.");
  let rejectTimeout!: (error: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { controller.abort(); rejectTimeout(timeoutError()); }, 12000);
  const request = async () => {
    const token = await auth.currentUser!.getIdToken();
    if (controller.signal.aborted) throw timeoutError();
    if (auth.currentUser?.uid !== uid) throw new Error("Your account changed. Sign in again to save your settings.");
    const response = await apiFetch("/api/account/preferences", {
      method: patch ? "PATCH" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(patch ? { "Content-Type": "application/json" } : {}) },
      ...(patch ? { body: JSON.stringify({ preferences: { [patch.key]: patch.value } }) } : {}),
      signal: controller.signal, cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result.preferences) throw new Error(result?.error || "Settings could not be confirmed by the server. Please retry.");
    return result as PreferenceResult;
  };
  try { return await Promise.race([request(), deadline]); }
  catch (error) { if (controller.signal.aborted) throw timeoutError(); throw error; }
  finally { clearTimeout(timer); }
}

const stores = new Map<string, ReturnType<typeof createPreferenceStore>>();
const signedOut = createPreferenceStore({ subscribe: () => () => {}, read: async () => { throw new Error("Sign in to change settings."); }, write: async () => { throw new Error("Sign in to change settings."); } });

function storeFor(uid?: string) {
  if (!uid) return signedOut;
  let store = stores.get(uid);
  if (!store) {
    store = createPreferenceStore({
      subscribe: (listener) => subscribeSharedDoc(`users/${uid}`, () => doc(db, "users", uid), (data, _exists, error) => {
        if (error) listener(null, new Error("Account sync is unavailable. Retry to reconnect."));
        else listener({ preferences: normalizeUserPreferences(data?.preferences), revision: Number(data?.preferencesRevision || 0) });
      }),
      read: () => requestPreferences(uid),
      write: (key, value) => requestPreferences(uid, { key, value }),
      onIdle: () => stores.delete(uid),
    });
    stores.set(uid, store);
  }
  return store;
}

/** One UID-scoped store, one shared document listener and atomic field writes.
 * Neither Profile nor any startup effect maintains a competing preferences copy. */
export function useUserPreferences(uid?: string) {
  const store = storeFor(uid);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const reload = () => { if (uid) retrySharedDoc(`users/${uid}`); return store.reload(); };
  return { ...state, setPreference: store.setPreference, retry: () => state.failed ? store.retry() : reload(), reload };
}
