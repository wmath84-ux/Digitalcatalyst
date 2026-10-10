import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const folder = path.resolve("scratch/validation-settings-paid/runtime");
let accountHandlers, policy, email, mail, web, ownership, writer, native;
const globals = () => globalThis.__settingsRuntime;
function database(seed = {}) {
  const records = new Map(Object.entries(structuredClone(seed)));
  const writes = [];
  let queue = Promise.resolve();
  const snap = (key) => ({ id: key.split("/").at(-1), exists: records.has(key), data: () => structuredClone(records.get(key)), ref: ref(key) });
  const merge = (current, update) => {
    const out = { ...current };
    for (const [key, value] of Object.entries(update)) out[key] = value && typeof value === "object" && !Array.isArray(value) && typeof value.toMillis !== "function" && !(value instanceof Date) ? merge(current?.[key] || {}, value) : value;
    return out;
  };
  const ref = (key) => ({
    id: key.split("/").at(-1), key,
    get: async () => { if (globals().failRead?.has(key)) throw Error("Firestore unavailable"); return snap(key); },
    set: async (value, options) => { writes.push({ key, value }); records.set(key, options?.merge ? merge(records.get(key) || {}, value) : value); },
    delete: async () => records.delete(key),
    create: async (value) => { if (records.has(key)) { const error = Error("Already exists"); error.code = 6; throw error; } records.set(key, value); },
    collection: (name) => collection(`${key}/${name}`),
  });
  const collection = (key, conditions = [], cap = Infinity) => ({
    doc: (id) => ref(`${key}/${id}`),
    where: (field, _op, value) => collection(key, [...conditions, [field, value]], cap),
    limit: (value) => collection(key, conditions, value),
    get: async () => ({ docs: [...records.keys()].filter((item) => item.startsWith(key + "/") && item.slice(key.length + 1).split("/").length === 1 && conditions.every(([field, value]) => records.get(item)?.[field] === value)).slice(0, cap).map(snap) }),
  });
  return { records, writes, collection, runTransaction(fn) {
    const execute = async () => {
      const changes = [];
      const result = await fn({ get: (doc) => doc.get(), set: (doc, value, options) => changes.push(() => doc.set(value, options)), update: (doc, value) => changes.push(() => doc.set(value, { merge: true })) });
      for (const commit of changes) await commit();
      return result;
    };
    const next = queue.then(execute); queue = next.catch(() => {}); return next;
  } };
}
const sdk = {
  firebaseAdmin: `export const getFirebaseAdminApp=()=>({});export const adminDb=()=>globalThis.__settingsRuntime.db;export const adminAuth=()=>({getUser:async(uid)=>{globalThis.__settingsRuntime.authReads.push(uid);return globalThis.__settingsRuntime.authUsers[uid]||{email:uid+'@example.test',emailVerified:true};}});export const requireFirebaseUser=async(req)=>{const value=String(req.headers?.authorization||'');if(!value.startsWith('Bearer verified:'))throw Object.assign(Error('Sign in required'),{statusCode:401});return{uid:value.slice('Bearer verified:'.length)};};export const errorResponse=(res,error,fallback)=>res.status(error.statusCode||500).json({ok:false,error:error.message||fallback});`,
  pushNotify: `export const pushConfigured=()=>false;`,
  fcm: `export const fcmConfigured=()=>false;`,
  branding: `export const getBranding=async()=>({appName:'Digital Catalyst'});`,
  emailTemplate: `export const buildReplyEmail=()=>({html:'<p>Test reply</p>',text:'Test reply'});`,
  tls: `export const connect=(...args)=>globalThis.__settingsRuntime.socketFactory(...args);`,
};
async function bundle(entry, name, stubs) {
  const outfile = path.join(folder, name + ".mjs");
  await build({ entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node", packages: "external", logLevel: "silent", plugins: [{ name: name + "-external-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const key = args.path === "@capacitor/core" ? "nativeCore" : args.path === "@capacitor/push-notifications" ? "nativePush" : args.path === "@capacitor/local-notifications" ? "nativeLocal" : args.path === "node:tls" ? "tls" : args.path === "firebase-admin/auth" ? "adminAuthSdk" : path.basename(args.path).replace(/\.(js|ts)$/, "");
      if (Object.hasOwn(stubs, key)) return { path: key, namespace: "settings-io" };
    });
    builder.onLoad({ filter: /.*/, namespace: "settings-io" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  return import(pathToFileURL(outfile).href);
}
before(async () => {
  fs.mkdirSync(folder, { recursive: true });
  globalThis.__settingsRuntime = { db: null, authUsers: {}, authReads: [], failRead: new Set() };

  globals().native = { permission: "granted", requests: 0, registers: 0, callbacks: new Map(), schedules: [], getPermissions: async () => ({ display: "granted" }) };
  const nativeEntry = path.join(folder, "native-entry.ts");
  fs.writeFileSync(nativeEntry, 'export * from "../../../src/utils/capacitorBridge.ts";export * from "../../../utils/deviceNotificationPreference.ts";');
  native = await bundle(nativeEntry, "native", {
    nativeCore: `export const Capacitor={isNativePlatform:()=>true,getPlatform:()=>"android"};`,
    nativePush: `export const PushNotifications={checkPermissions:async()=>({receive:globalThis.__settingsRuntime.native.permission}),requestPermissions:async()=>{globalThis.__settingsRuntime.native.requests++;globalThis.__settingsRuntime.native.permission="granted";return{receive:"granted"};},addListener:async(name,callback)=>{const state=globalThis.__settingsRuntime.native;const group=state.callbacks.get(name)||new Set();group.add(callback);state.callbacks.set(name,group);return{remove:async()=>{group.delete(callback);}};},register:async()=>{const state=globalThis.__settingsRuntime.native;state.registers++;queueMicrotask(()=>{for(const fn of state.callbacks.get("registration")||[])fn({value:"fixture-native-token"});});}};`,
    nativeLocal: `export const LocalNotifications={createChannel:async()=>{},checkPermissions:()=>globalThis.__settingsRuntime.native.getPermissions(),schedule:async(value)=>{globalThis.__settingsRuntime.native.schedules.push(value);},cancel:async()=>{},getPending:async()=>({notifications:[]}),checkExactNotificationSetting:async()=>({exact_alarm:"granted"}),addListener:async()=>({remove:async()=>{}})};`,
    apiBase: `export const apiFetch=(...args)=>globalThis.__settingsRuntime.nativeFetch(...args);`,
  });
  accountHandlers = await bundle("api/_lib/accountPreferences.ts", "account", { firebaseAdmin: sdk.firebaseAdmin, pushNotify: sdk.pushNotify, fcm: sdk.fcm, userQueries: `export const mailConfigured=()=>false;` });
  policy = await bundle("api/_lib/notificationPreferences.ts", "policy", {});
  ownership = await bundle("api/_lib/quoteOwnership.ts", "quote-ownership", {});
  writer = await bundle("api/_lib/entitlements.ts", "grants", { firebaseAdmin: sdk.firebaseAdmin,
    coupons: `export const applyCouponRedemption=async()=>{};export const loadCouponByCode=async()=>null;`,
    referrals: `export const ensureReferralCoupon=async()=>{};`,
    subscriptions: `export const collectSubscriptionEntitlementIds=()=>[];export const loadActiveFeatures=async()=>[];export const loadPlanById=async()=>null;export const writeSubscriptionAfterPayment=async()=>{};`,
  });
  email = await bundle("api/_lib/notificationEmail.ts", "email", { firebaseAdmin: sdk.firebaseAdmin, adminAuthSdk: `export const getAuth=()=>({getUser:async(uid)=>{globalThis.__settingsRuntime.authReads.push(uid);return globalThis.__settingsRuntime.authUsers[uid]||{email:uid+'@example.test',emailVerified:true};}});`, userQueries: `export const mailConfigured=()=>true;export const sendMail=async(input)=>globalThis.__settingsRuntime.send(input);` });
  mail = await bundle("api/_lib/userQueries.ts", "smtp", { firebaseAdmin: sdk.firebaseAdmin, branding: sdk.branding, emailTemplate: sdk.emailTemplate, tls: sdk.tls });
  const webEntry = path.join(folder, "web-entry.ts");
  fs.writeFileSync(webEntry, 'export * from "../../../utils/webPush.ts";export * from "../../../utils/deviceNotificationPreference.ts";');
  web = await bundle(webEntry, "web", {
    firebase: `export const db={};export const auth={get currentUser(){return globalThis.__settingsRuntime.webUser;}};`,
    apiBase: `export const apiFetch=(...args)=>globalThis.__settingsRuntime.webFetch(...args);`,
    branding: `export const DEFAULT_LOGO_URL='/logo.png';export const readCachedBranding=()=>({});`,
    firestore: `export const collection=(...args)=>args;export const doc=(...args)=>args;export const query=(...args)=>args;export const where=(...args)=>args;export const getDocs=async()=>({docs:[]});export const deleteDoc=async()=>{};export const setDoc=async(...args)=>{globalThis.__settingsRuntime.webWrites.push(args);};`,
  });
});
function reset(seed = {}) {
  const db = database(seed); Object.assign(globals(), { db, authUsers: {}, authReads: [], failRead: new Set(), send: async () => ({ ok: true }) }); return db;
}
function request(method = "GET", body, uid = "alice", query = {}) {
  return { method, body, query, headers: { authorization: uid ? `Bearer verified:${uid}` : "" } };
}
function response() { return { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }

test("authenticated single-field preference transactions ignore client UIDs and unrelated fields survive", async () => {
  const db = reset({ "users/alice": { name: "Alice", privatePhone: "private", preferences: { push: true, email: true, legacyFlag: "keep" }, preferencesRevision: 7 }, "users/bob": { preferences: { push: true } } });
  const res = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { uid: "bob", preferences: { push: false } }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.preferences.push, false); assert.equal(res.body.revision, 8);
  assert.equal(db.records.get("users/alice").preferences.email, true); assert.equal(db.records.get("users/alice").preferences.legacyFlag, "keep"); assert.equal(db.records.get("users/alice").privatePhone, "private"); assert.equal(db.records.get("users/bob").preferences.push, true);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});
test("server rejects anonymous, invalid, multi-field or unknown preference writes", async () => {
  const db = reset({ "users/alice": { preferences: { push: true } } });
  const anonymous = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences: { push: false } }, null), anonymous); assert.equal(anonymous.statusCode, 401);
  for (const preferences of [{ push: "false" }, { push: false, email: false }, { role: true }, {}, []]) {
    const res = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences }), res); assert.equal(res.statusCode, 400);
  }
  assert.equal(db.writes.length, 0);
});
test("concurrent writes and repeated off/on transactions are revisioned without overwriting another field", async () => {
  const db = reset({ "users/alice": { preferences: { push: true, email: true }, preferencesRevision: 0 } });
  await Promise.all(["push", "email"].map(async (key) => { const res = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences: { [key]: false } }), res); assert.equal(res.statusCode, 200); }));
  assert.deepEqual(db.records.get("users/alice").preferences, { push: false, email: false }); assert.equal(db.records.get("users/alice").preferencesRevision, 2);
  for (const value of [true, false, true]) { const res = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences: { push: value } }), res); assert.equal(res.body.preferences.push, value); }
  assert.equal(db.records.get("users/alice").preferences.email, false); assert.equal(db.records.get("users/alice").preferencesRevision, 5);
});
test("activity sharing requires versioned explicit consent, and malformed revisions recover", async () => {
  const db = reset({ "users/alice": { preferences: { shareActivity: true, profileVisible: true }, preferencesRevision: "bad" } });
  const get = response(); await accountHandlers.handleAccountPreferences(request(), get); assert.equal(get.body.preferences.shareActivity, false); assert.equal(get.body.revision, 0);
  const save = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences: { shareActivity: true } }), save); assert.equal(save.body.preferences.shareActivity, true); assert.equal(save.body.revision, 1); assert.equal(db.records.get("users/alice").preferences.activityConsentVersion, 1);
});
test("public profile is count-only, requires current visibility, and never leaks contact or raw learning IDs", async () => {
  const db = reset({ "users/alice": { name: "Alice", email: "private@example.test", phone: "private", preferences: { profileVisible: true, shareActivity: true, activityConsentVersion: 1 } }, "users/alice/courseProgress/private-course": { completedResourceIds: ["private-resource"], resourceProgress: { "private-resource": { completed: true }, "another-private-resource": { completed: true } } } });
  const res = response(); await accountHandlers.handlePublicProfile(request("GET", undefined, null, { uid: "alice" }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.profile.name, "Alice"); assert.ok(res.body.activity); assert.doesNotMatch(JSON.stringify(res.body), /private@example|private-course|private-resource|privatePhone|email|phone/);
  db.records.get("users/alice").preferences.profileVisible = false; const hidden = response(); await accountHandlers.handlePublicProfile(request("GET", undefined, null, { uid: "alice" }), hidden); assert.equal(hidden.statusCode, 404); assert.equal(hidden.body.profile, undefined);
});
test("public profile read failure is not public permission, and invalid IDs cannot reach nested user data", async () => {
  reset({ "users/alice": { name: "Alice" } }); globals().failRead.add("users/alice");
  const unavailable = response(); await accountHandlers.handlePublicProfile(request("GET", undefined, null, { uid: "alice" }), unavailable); assert.equal(unavailable.statusCode, 500); assert.equal(unavailable.body.profile, undefined);
  const nested = response(); await accountHandlers.handlePublicProfile(request("GET", undefined, null, { uid: "alice/private" }), nested); assert.equal(nested.statusCode, 400);
});
test("every new delivery dispatch rechecks saved policy; missing/deleted users fail closed", async () => {
  const db = reset({ "users/alice": { preferences: { push: true, email: true, promotions: false } } });
  assert.equal((await policy.userNotificationPolicy(db, "alice")).push, true);
  assert.equal((await policy.userNotificationPolicy(db, "alice", { type: "product-created" })).push, false);
  db.records.get("users/alice").preferences.push = false;
  assert.equal((await policy.userNotificationPolicy(db, "alice")).push, false);
  assert.equal((await policy.userNotificationPolicy(db, "deleted")).email, false);
  assert.equal((await policy.createNotificationPreferenceReader(db)("deleted")).push, false);
});
test("email outbox is deduplicated and a queued job is skipped after consent withdrawal", async () => {
  const db = reset({ "users/alice": { preferences: { email: true } } });
  const payload = { title: "Course unlocked", body: "Your lesson is ready", category: "course", tag: "unlock-order-1", url: "/#/library" };
  assert.equal(await email.queueNotificationEmail(db, "alice", payload), true); assert.equal(await email.queueNotificationEmail(db, "alice", payload), false);
  assert.equal([...db.records.keys()].filter((key) => key.startsWith("notificationEmailOutbox/")).length, 1);
  db.records.get("users/alice").preferences.email = false; let sends = 0; globals().send = async () => { sends += 1; return { ok: true }; };
  const result = await email.deliverNotificationEmails(db); assert.equal(result.skipped, 1); assert.equal(sends, 0); assert.deepEqual(globals().authReads, []);
});
test("mail uses only the current verified Auth email, not a profile/body address", async () => {
  const db = reset({ "users/alice": { email: "untrusted@example.test", preferences: { email: true } } });
  globals().authUsers.alice = { email: "verified@example.test", emailVerified: true }; const sent = []; globals().send = async (input) => { sent.push(input); return { ok: true }; };
  await email.queueNotificationEmail(db, "alice", { title: "Unlocked", body: "Ready", category: "course", tag: "unlock-order-2" }); const result = await email.deliverNotificationEmails(db);
  assert.equal(result.sent, 1); assert.equal(sent[0].to, "verified@example.test"); assert.ok(sent[0].timeoutMs <= 5000); assert.match(sent[0].messageId, /^<[a-f0-9]{64}@notifications\./);
  assert.equal([...db.records.values()].find((item) => item.status === "sent").attempts, 1);
});
test("an unverified email is skipped, and SMTP rejection remains a retryable pending job", async () => {
  const db = reset({ "users/alice": { preferences: { email: true } } }); globals().authUsers.alice = { email: "not-verified@example.test", emailVerified: false };
  await email.queueNotificationEmail(db, "alice", { title: "Update", body: "Ready", category: "course", tag: "course-order-3" }); assert.equal((await email.deliverNotificationEmails(db)).skipped, 1);
  globals().authUsers.alice.emailVerified = true; await email.queueNotificationEmail(db, "alice", { title: "Update", body: "Ready", category: "course", tag: "course-order-4" }); globals().send = async () => ({ ok: false, reason: "SMTP unavailable" });
  assert.equal((await email.deliverNotificationEmails(db)).failed, 1);
  const pending = [...db.records.values()].find((item) => item.status === "pending"); assert.equal(pending.attempts, 1); assert.ok(pending.nextAttemptAt > Date.now()); assert.equal(pending.lastError, "SMTP unavailable");
});
function smtpSocket(scenario = "success") {
  const socket = new EventEmitter(); const commands = [];
  socket.setEncoding = () => {}; socket.setTimeout = () => {}; socket.end = () => { socket.closed = true; }; socket.destroy = () => { socket.closed = true; };
  const replies = ["250-server.example\r\n250-AUTH LOGIN\r\n250 OK\r\n", "334 Username\r\n", "334 Password\r\n", "235 Authenticated\r\n", "250 Sender accepted\r\n", "250 Recipient accepted\r\n", "354 End with dot\r\n", scenario === "reject" ? "550 Rejected\r\n" : "250 Queued\r\n"];
  socket.write = (text) => { commands.push(text); const index = commands.length - 1; if (index < replies.length) queueMicrotask(() => { const message = replies[index]; socket.emit("data", message.slice(0, 5)); socket.emit("data", message.slice(5)); }); };
  if (scenario !== "hang") setImmediate(() => { socket.emit("data", "220-ser"); socket.emit("data", "ver greeting\r\n220 Ready\r\n"); });
  return { socket, commands };
}
test("SMTP handles fragmented and multiline replies and reports success only after DATA acceptance", async () => {
  reset(); Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "fixture", SMTP_PASS: "fixture-only" }); const fixture = smtpSocket(); globals().socketFactory = () => fixture.socket;
  const result = await mail.sendMail({ to: "verified@example.test", subject: "Update", text: "Ready", timeoutMs: 500 }); assert.equal(result.ok, true); assert.equal(fixture.commands.length, 9); assert.equal(fixture.commands[0], "EHLO smtp.example.test\r\n"); assert.equal(fixture.commands.at(-1), "QUIT\r\n"); assert.equal(fixture.socket.closed, true);
});
test("SMTP provider rejection and whole-session timeout are honest failures, never fake delivery", async () => {
  reset(); Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "fixture", SMTP_PASS: "fixture-only" }); let fixture = smtpSocket("reject"); globals().socketFactory = () => fixture.socket;
  assert.equal((await mail.sendMail({ to: "verified@example.test", subject: "Update", text: "Ready", timeoutMs: 200 })).ok, false);
  fixture = smtpSocket("hang"); globals().socketFactory = () => fixture.socket; const result = await mail.sendMail({ to: "verified@example.test", subject: "Update", text: "Ready", timeoutMs: 20 }); assert.equal(result.ok, false); assert.match(result.reason, /timed out/); assert.equal(fixture.socket.closed, true);
});
const subscription = { endpoint: "https://push.example.test/device", getKey: () => new Uint8Array([1, 2]).buffer };
function webSetup(uid = "alice") {
  globals().webUser = { uid, getIdToken: async () => "verified:" + uid }; globals().webWrites = []; globals().webFetch = async () => new Response('{"ok":true}', { status: 200 });
  globalThis.window = { atob, PushManager: function() {}, Notification: { permission: "granted" } }; Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Fixture browser", serviceWorker: { ready: Promise.resolve({}) } } });
}
test("Web Push registration cannot save for another UID or bypass an explicit server authorization refusal", async () => {
  reset(); webSetup(); assert.equal(await web.saveWebPushSubscription("bob", subscription), false); assert.equal(globals().webWrites.length, 0);
  globals().webFetch = async () => new Response('{"ok":false}', { status: 401 }); assert.equal(await web.saveWebPushSubscription("alice", subscription), false); assert.equal(globals().webWrites.length, 0);
});
test("acknowledged Web Push registration and owner-only unavailable-route fallback remain retryable", async () => {
  reset(); webSetup(); assert.equal(await web.saveWebPushSubscription("alice", subscription), true); assert.equal(globals().webWrites.length, 0);
  globals().webFetch = async () => new Response('{"ok":false}', { status: 404 }); assert.equal(await web.saveWebPushSubscription("alice", subscription), true); assert.equal(globals().webWrites.length, 1);
});
test("a delayed old-account Web Push acknowledgement cannot report success to the new account", async () => {
  reset(); webSetup(); let release; globals().webFetch = async () => new Promise((done) => { release = () => done(new Response('{"ok":true}', { status: 200 })); });
  const result = web.saveWebPushSubscription("alice", subscription); await new Promise((done) => setTimeout(done, 0)); globals().webUser = { uid: "bob", getIdToken: async () => "verified:bob" }; release(); assert.equal(await result, false); assert.equal(globals().webWrites.length, 0);
});


test("verified quote loader suppresses expired/revoked canonical mirrors but retains independent scopes and active subscription", async () => {
  const db = reset({
    "users/alice": { purchasedProductIds: ["public-course"], purchasedProductUpdateIds: { "public-course": ["u1"] } },
    "users/alice/purchases/course-doc": { productId: "course-doc", status: "Verified" },
    "users/alice/purchases/course-doc__update__u1": { productId: "course-doc", updateId: "u1", status: "Verified" },
    "entitlements/full": { uid: "alice", kind: "full_product", productId: "course-doc", status: "active", expiresAt: 0 },
    "entitlements/update": { uid: "alice", kind: "paid_update", productId: "course-doc", updateId: "u1", status: "revoked" },
    "entitlements/independent": { uid: "alice", kind: "module", productId: "course-doc", moduleId: "independent", status: "active" },
  });
  const products = new Map([["course-doc", { id: "course-doc", publicId: "public-course" }]]);
  const rows = (await ownership.loadQuoteOwnership(db, "alice", products, 1000)).get("course-doc");
  assert.deepEqual(rows.updateIds, []); assert.equal(rows.purchaseDocs.some((row) => row.kind === "full_product"), false); assert.equal(rows.purchaseDocs[0].moduleId, "independent");
  db.records.set("users/alice/subscription/current", { uid: "alice", status: "active", expiresAt: 2000, includedProductIds: ["public-course"] });
  const subscribed = (await ownership.loadQuoteOwnership(db, "alice", products, 1000)).get("course-doc");
  assert.equal(subscribed.purchaseDocs.find((row) => row.kind === "full_product").source, "subscription");
});
const grantQuote = () => ({ uid: "alice", quoteId: "fresh-quote", purchaseKind: "selected_modules", status: "active", cashPayable: 24900, verifiedLineItems: [{ id: "module:course:m1", entitlementId: "module:course:m1", kind: "selected_modules", productId: "course", moduleId: "m1", title: "Practice", effectivePrice: 24900, regularPrice: 30000, quantity: 1, alreadyOwned: false }], grants: [] });
test("a new verified paid order replaces expired scope, while active grants and old verified replays stay untouched", async () => {
  const key = "entitlements/alice__module:course:m1";
  for (const scenario of ["expired-new-order", "active-existing", "revoked-replay"]) {
    const original = { uid: "alice", kind: "module", productId: "course", moduleId: "m1", status: scenario === "revoked-replay" ? "revoked" : "active", ...(scenario === "expired-new-order" ? { expiresAt: 0 } : {}), orderId: "original-order" };
    const db = reset({ [key]: original, ...(scenario === "revoked-replay" ? { "_paymentIntents/new-order": { status: "verified" } } : {}) });
    await writer.grantEntitlementsFromQuote({ quote: grantQuote(), orderId: "new-order", paymentId: "verified-payment", source: "razorpay" }, { db, now: 1000 });
    const current = db.records.get(key);
    if (scenario === "expired-new-order") { assert.equal(current.status, "active"); assert.equal(current.orderId, "new-order"); assert.equal(current.expiresAt, undefined); }
    else { assert.deepEqual(current, original); }
  }
});


test("device display gates are UID- and opt-out-generation scoped, including quick off/on reversals", () => {
  web.setDeviceNotificationPreference("alice", true); const first = web.captureDevicePushGate("alice"); assert.equal(first(), true);
  web.setDeviceNotificationPreference("alice", false); web.setDeviceNotificationPreference("alice", true); assert.equal(first(), false); assert.equal(web.captureDevicePushGate("alice")(), true);
  const current = web.captureDevicePushGate(); web.setDeviceNotificationPreference("bob", true); assert.equal(current(), false); assert.equal(web.captureDevicePushGate("alice")(), false);
  web.setDeviceNotificationPreference(null, false); assert.equal(web.canShowDevicePush(), false);
});
test("foreground browser display is cancelled if consent changes while the service worker is awaited", async () => {
  reset(); webSetup(); let release; let shown = 0; navigator.serviceWorker.ready = new Promise((done) => { release = done; });
  web.setDeviceNotificationPreference("alice", true); const pending = web.showLocalSystemNotification("Private reminder", "Alice only", "/", "reminder", "alice");
  web.setDeviceNotificationPreference("bob", true); release({ showNotification: async () => { shown += 1; } }); assert.equal(await pending, false); assert.equal(shown, 0);
});
const nativeReply = (options) => new Response(JSON.stringify({ ok: true, uid: options.headers.Authorization.slice("Bearer verified:".length) }), { status: 200 });
test("check-only native startup never prompts; a simultaneous explicit setup can still enable push", async () => {
  reset(); const state = globals().native; state.permission = "prompt"; state.requests = 0; state.registers = 0;
  globals().nativeFetch = async (_url, options) => nativeReply(options);
  const checked = native.registerForPush(async () => "verified:alice", { uid: "alice", requestPermission: false });
  const explicit = native.registerForPush(async () => "verified:alice", { uid: "alice" });
  assert.equal((await checked).ok, false); assert.equal((await explicit).ok, true); assert.equal(state.requests, 1); assert.equal(state.registers, 1);
  assert.equal([...state.callbacks.values()].every((group) => group.size === 1), true);
});
test("native registration is single-flight through setup and a late old timeout acknowledgement cannot complete a retry", async () => {
  reset(); const state = globals().native; state.permission = "granted"; state.registers = 0;
  let releases = []; globals().nativeFetch = async (_url, options) => new Promise((done) => { releases.push(() => done(nativeReply(options))); });
  const realTimer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, ms, ...args) => realTimer(callback, ms === 12000 ? 120 : ms, ...args);
  try {
    const first = native.registerForPush(async () => "verified:alice", { uid: "alice" });
    const joined = native.registerForPush(async () => "verified:alice", { uid: "alice" });
    assert.equal((await first).reason, "registration-timeout"); assert.equal((await joined).ok, false); assert.equal(state.registers, 1);
    let settled = false; const second = native.registerForPush(async () => "verified:bob", { uid: "bob" }).then((result) => { settled = true; return result; });
    await new Promise((done) => realTimer(done, 0)); assert.equal(releases.length, 2); releases[0](); await new Promise((done) => realTimer(done, 0)); assert.equal(settled, false);
    releases[1](); assert.equal((await second).ok, true); assert.equal(state.registers, 2); assert.equal([...state.callbacks.values()].every((group) => group.size === 1), true);
  } finally { globalThis.setTimeout = realTimer; }
});
test("a pending native alarm cannot bypass an off/on session change after permissions resolve", async () => {
  reset(); const state = globals().native; let release; state.schedules = []; state.getPermissions = () => new Promise((done) => { release = done; });
  native.setDeviceNotificationPreference("alice", true); const pending = native.scheduleLocalAlarm({ uid: "alice", id: 42, at: Date.now() + 60000, title: "Private reminder", body: "Alice", url: "/", tag: "reminder" });
  while (!release) await new Promise((done) => setTimeout(done, 0)); native.setDeviceNotificationPreference("alice", false); native.setDeviceNotificationPreference("alice", true); release({ display: "granted" });
  assert.equal(await pending, false); assert.equal(state.schedules.length, 0); state.getPermissions = async () => ({ display: "granted" });
});

test("recovering a malformed preference container cannot implicitly opt other channels/profile into publication", async () => {
  reset({ "users/alice": { preferences: "malformed", preferencesRevision: 3 } });
  const res = response(); await accountHandlers.handleAccountPreferences(request("PATCH", { preferences: { push: true } }), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.preferences.push, true);
  assert.equal(res.body.preferences.email, false); assert.equal(res.body.preferences.profileVisible, false); assert.equal(res.body.preferences.shareActivity, false);
});
