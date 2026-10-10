// Deterministic AUTH / Firestore / HTTP / OS boundaries only. Pages, stores,
// shared listeners, access resolution, quote controller and price engine are production code.
import { useSyncExternalStore } from "react";
import { account, DEFAULT_FLAGS, grantsFor, initialUid, membershipFor, product } from "./data";
import { normalizeUserPreferences } from "../../../utils/userPreferences";
import { normaliseCouponDoc } from "../../../utils/coupons";
import { buildQuote } from "../../../utils/serverQuotes";
const params = new URLSearchParams(location.search);
const listeners = new Set<() => void>();
const snapshots = new Map<string, Set<{ next: (value: any) => void; error: (value: any) => void }>>();
const oldSnapshots: any[] = [];
const saved = (uid: string) => { try { return JSON.parse(localStorage.getItem(`fixture-prefs:${uid}`) || "null"); } catch { return null; } };
export const state: any = {
  uid: initialUid, extraGrants: new Map(), flags: new Map(), revision: new Map(), requests: [], writes: [], quoteRequests: [], setups: 0, permissionRequests: 0,
  permission: params.has("blocked") ? "denied" : params.has("permissionGranted") ? "granted" : "default",
  nativePermission: params.has("blocked") ? "denied" : params.has("permissionGranted") ? "granted" : "prompt",
  faults: { read: params.has("readError"), save: params.has("saveError"), setup: params.has("setupError"), sync: Boolean(params.get("accessError")), quote: params.has("quoteError"), token: params.has("tokenHang") },
  deferred: [], snapshotStarts: {}, nativeListeners: new Map(), nativeRegisters: 0, nativeRequests: 0,
};
function prefs(uid: string) {
  if (!state.flags.has(uid)) {
    const previous = saved(uid);
    state.flags.set(uid, previous?.preferences || { ...DEFAULT_FLAGS, ...(params.has("pushOff") && uid === "learner-a" ? { push: false } : {}) });
    state.revision.set(uid, previous?.revision || 0);
  }
  return state.flags.get(uid);
}
const currentUser = () => state.uid ? { ...account(state.uid), getIdToken: async () => state.faults.token ? new Promise(() => {}) : `token:${state.uid}` } : null;
export const auth: any = { get currentUser() { return currentUser(); } };
export const db = {};
export const getFirebaseStorage = () => ({});
export function useAuth() {
  const uid = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state.uid);
  return { user: uid ? account(uid) : null, loading: false, logout: async () => state.switchUser(null) };
}
state.switchUser = (uid: string | null) => { state.uid = uid; for (const fn of listeners) fn(); };
function rawDoc(key: string): any {
  const parts = key.split("/");
  const uid = parts[1];
  if (parts.length === 2 && parts[0] === "users") return { uid, name: account(uid).name, preferences: prefs(uid), preferencesRevision: state.revision.get(uid) || 0, ...(uid === "learner-a" && (params.has("expiredBase") || params.has("revokedBase")) ? { purchasedProductIds: [product.id] } : {}) };
  if (key.endsWith("/subscription/current")) return membershipFor(uid);
  return null;
}
function rawCollection(key: string) {
  if (key === "siteProducts") return [{ id: product.documentId, data: () => ({ ...product, status: "published" }) }];
  if (key.startsWith("entitlements:")) return [...grantsFor(key.slice("entitlements:".length)), ...(state.extraGrants.get(key.slice("entitlements:".length)) || [])].map((data, i) => ({ id: `grant-${i}`, data: () => data }));
  if (key.endsWith("/purchases") && (params.has("expiredBase") || params.has("revokedBase"))) return [{ id: product.documentId, data: () => ({ productId: product.documentId, kind: "full_product", status: "Verified" }) }];
  if (key.endsWith("/notifications")) return [{ id: "receipt", data: () => ({ title: "Course unlocked", read: false, category: "unlock" }) }, { id: "offer", data: () => ({ title: "New product offer", read: false, category: "store", type: "product-created" }) }];
  return [];
}
function snapshotFor(key: string) { const data = rawDoc(key); return { docs: rawCollection(key), metadata: { fromCache: false }, exists: () => Boolean(data), data: () => data }; }
const sourceMatches = (key: string, source: string | null) => source === "account" ? key === `users/${state.uid}`
  : source === "subscription" ? key === `users/${state.uid}/subscription/current`
    : source === "purchases" ? key === `users/${state.uid}/purchases` : key === `entitlements:${state.uid}`;
const held = (key: string) => params.get("waitAccess") && sourceMatches(key, params.get("waitAccess")) && !state.released;

export function onSnapshot(ref: any, next: (value: any) => void, error: (failure: any) => void = () => {}) {
  const key = ref.key;
  state.snapshotStarts[key] = (state.snapshotStarts[key] || 0) + 1;
  const group = snapshots.get(key) || new Set(); const listener = { next, error }; group.add(listener); snapshots.set(key, group);
  queueMicrotask(() => {
    if (!group.has(listener) || held(key)) return;
    const failedSource = params.get("accessError");
    if (state.faults.sync && sourceMatches(key, failedSource)) error(Error("Snapshot unavailable"));
    else next(snapshotFor(key));
  });
  oldSnapshots.push({ key, ...listener });
  return () => group.delete(listener);
}
state.publish = (key: string) => { for (const item of snapshots.get(key) || []) item.next(snapshotFor(key)); };
state.acquireModule = (moduleId: string) => { const records = state.extraGrants.get(state.uid) || []; records.push({ uid: state.uid, productId: product.documentId, kind: "module", moduleId, status: "active" }); state.extraGrants.set(state.uid, records); state.publish(`entitlements:${state.uid}`); };
state.releaseAccess = () => { state.released = true; for (const key of snapshots.keys()) state.publish(key); };
state.emitOld = (index: number) => oldSnapshots[index]?.next(snapshotFor(oldSnapshots[index].key));
state.oldSnapshotKeys = () => oldSnapshots.map((item) => item.key);
state.remotePreferences = (patch: object, uid = state.uid) => { prefs(uid); state.flags.set(uid, { ...prefs(uid), ...patch }); state.revision.set(uid, (state.revision.get(uid) || 0) + 1); state.publish(`users/${uid}`); };
export const doc = (_db: any, ...parts: string[]) => ({ key: parts.join("/"), type: "doc" });
export const collection = (_db: any, ...parts: string[]) => ({ key: parts.join("/"), type: "collection" });
export const where = (field: string, op: string, value: string) => ({ field, op, value });
export const query = (ref: any, ...conditions: any[]) => ({ ...ref, key: ref.key === "entitlements" ? `entitlements:${conditions.find((condition) => condition.field === "uid")?.value}` : ref.key });
export const getDoc = async (ref: any) => snapshotFor(ref.key);
export const getDocs = async (ref: any) => snapshotFor(ref.key);
export const serverTimestamp = () => Date.now();
export const setDoc = async () => {};
export const updateDoc = async () => {};
export const deleteDoc = async () => {};
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const capabilities = () => ({ emailConfigured: !params.has("emailUnconfigured"), webPushConfigured: !params.has("pushUnconfigured"), fcmConfigured: !params.has("pushUnconfigured") });
export async function apiFetch(url: string, options: any = {}) {
  state.requests.push({ url, method: options.method || "GET", body: options.body });
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.startsWith("/api/account/preferences")) {
    const uid = String(options.headers?.Authorization || "").slice("Bearer token:".length);
    if (!uid || uid === "Bearer token:") return response({ ok: false, error: "Sign in required" }, 401);
    prefs(uid);
    if ((options.method || "GET") === "GET") {
      if (state.faults.read) return response({ ok: false, error: "Settings service unavailable. Retry to reconnect." }, 503);
    } else {
      const keys = Object.keys(body.preferences || {});
      if (keys.length !== 1 || typeof body.preferences[keys[0]] !== "boolean") return response({ ok: false, error: "One boolean field required" }, 400);
      state.writes.push({ uid, ...body.preferences });
      if (params.has("slowSave") || state.holdSave) await new Promise((done) => state.deferred.push(done));
      if (state.faults.save) return response({ ok: false, error: "This change could not be saved. Check your connection and retry." }, 503);
      const next = { ...prefs(uid), ...body.preferences, ...(body.preferences.shareActivity ? { activityConsentVersion: 1 } : {}) };
      state.flags.set(uid, next); state.revision.set(uid, state.revision.get(uid) + 1);
      localStorage.setItem(`fixture-prefs:${uid}`, JSON.stringify({ preferences: next, revision: state.revision.get(uid) }));
      state.publish(`users/${uid}`);
      if (params.has("lostAck")) throw Error("HTTP acknowledgement lost");
    }
    return response({ ok: true, preferences: normalizeUserPreferences(prefs(uid)), revision: state.revision.get(uid), capabilities: capabilities() });
  }
  if (url.startsWith("/api/quotes/create")) {
    state.quoteRequests.push(structuredClone(body.selection));
    if (state.holdQuote) await new Promise((done) => state.deferred.push(done));
    if (state.faults.quote) return response({ ok: false, error: "Pricing service unavailable" }, 503);
    const productId = product.documentId!;
    const purchases = [...grantsFor(state.uid), ...(state.extraGrants.get(state.uid) || [])].map((record: any) => ({ ...record, productDocumentId: productId }));
    const member = membershipFor(state.uid);
    if (member) { purchases.push({ kind: "full_product", productDocumentId: productId, source: "subscription" } as any); purchases.push({ kind: "module", moduleId: "advanced", productDocumentId: productId, source: "subscription" } as any); }
    const coupon = body.selection.couponCode ? normaliseCouponDoc({ code: body.selection.couponCode, type: "flat", value: 5000, status: "active", globalLimit: null, perUserLimit: null, usedCount: 0 }) : null;
    const built: any = buildQuote({ uid: state.uid, selection: body.selection, products: new Map([[productId, { ...product, id: productId }]]), purchasesByProduct: new Map([[productId, purchases]]), quoteId: `fixture-quote-${state.quoteRequests.length}`, now: Date.now(), ttlMs: 900000, ...(coupon ? { coupon } : {}) });
    return built.ok ? response({ ok: true, quote: built.quote }) : response({ ok: false, error: built.reason }, built.status);
  }
  if (url.startsWith("/api/public-profile")) {
    const uid = new URL(url, location.origin).searchParams.get("uid")!;
    if (!prefs(uid).profileVisible) return response({ ok: false, error: "This learner's profile is private or unavailable." }, 404);
    return response({ ok: true, profile: { uid, name: account(uid).name }, activity: prefs(uid).shareActivity ? { coursesStarted: 2, completedItems: 9 } : null });
  }
  if (url.includes("fcm-register")) {
    state.nativeRequests += 1;
    if (state.holdNative) await new Promise((done) => state.deferred.push(done));
    return state.faults.setup ? response({ ok: false }, 503) : response({ ok: true, uid: String(options.headers.Authorization).slice("Bearer token:".length), registered: "fixture-device" });
  }
  return response({ ok: false, error: "Unknown fixture request" }, 404);
}
export const useCatalog = () => ({ products: [product], purchasedIds: new Set<string>(), loading: false, error: null });
export const useCommerce = () => ({ cartIds: new Set(), favoriteIds: new Set() });
export const useBranding = () => ({ appName: "Digital Catalyst", logoUrl: "", homeGradientFrom: "#4f46e5", homeGradientTo: "#7c3aed" });
export const FakeCapacitor = { isNativePlatform: () => params.has("native"), getPlatform: () => params.has("native") ? "android" : "web" };
export const FakePushNotifications = {
  checkPermissions: async () => ({ receive: state.nativePermission }),
  requestPermissions: async () => { state.permissionRequests += 1; state.nativePermission = "granted"; return { receive: "granted" }; },
  addListener: async (name: string, callback: any) => { const group = state.nativeListeners.get(name) || new Set(); group.add(callback); state.nativeListeners.set(name, group); return { remove: async () => group.delete(callback) }; },
  register: async () => { state.nativeRegisters += 1; queueMicrotask(() => { for (const callback of state.nativeListeners.get("registration") || []) callback({ value: "fixture-fcm-token" }); }); },
};
export const FakeLocalNotifications = { createChannel: async () => {}, checkPermissions: async () => ({ display: "granted" }), getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => {}, addListener: async () => ({ remove: async () => {} }), checkExactNotificationSetting: async () => ({ exact_alarm: "granted" }), changeExactNotificationSetting: async () => ({ exact_alarm: "granted" }) };
class FakeNotification { static get permission() { return state.permission; } static async requestPermission() { state.permissionRequests += 1; state.permission = "granted"; return "granted"; } }
Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
export const isWebPushSupported = () => !params.has("unsupported");
export const getCurrentPushSubscription = async () => null;
export const ensureSavedWebPushSubscription = async () => { state.setups += 1; return !state.faults.setup; };
export const subscribeToWebPush = async () => null;
export const showLocalSystemNotification = async () => false;
export const getBrandNotificationIcon = () => "/fixture-icon.png";
state.release = () => { const queue = state.deferred.splice(0); for (const resolve of queue) resolve(); };
(window as any).fixtureState = state;

export const addDoc = async (_ref: any, data: any) => ({ id: "fixture-new-doc", data });
export const limit = (value: number) => ({ limit: value });
export const orderBy = (...parts: any[]) => ({ orderBy: parts });
export const increment = (value: number) => value;
export const writeBatch = () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} });
export const Timestamp = { now: () => ({ toMillis: () => Date.now() }), fromMillis: (value: number) => ({ toMillis: () => value }) };
