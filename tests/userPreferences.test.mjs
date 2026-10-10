import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, PREFERENCE_KEYS, normalizeUserPreferences, validatePreferencePatch, notificationPolicy, publicProfileIdentity, publicLearningSummary } from "../utils/userPreferences.js";
import { createPreferenceStore } from "../utils/preferenceStore.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture(options = {}) {
  let listener;
  let preferences = { ...DEFAULT_PREFERENCES };
  let revision = 0;
  const writes = [];
  const adapter = {
    teardownMs: 0,
    subscribe: (callback) => { listener = callback; callback({ preferences, revision }); return () => {}; },
    read: async () => ({ preferences, revision, capabilities: { emailConfigured: false } }),
    write: async (key, value) => {
      writes.push({ key, value });
      if (options.write) return options.write(key, value);
      preferences = { ...preferences, [key]: value }; revision += 1;
      return { preferences, revision };
    },
  };
  const store = createPreferenceStore(adapter);
  const stop = store.subscribe(() => {});
  const receive = (prefs, version) => { preferences = prefs; revision = version; listener({ preferences, revision }); };
  return { store, writes, stop, receive };
}

test("defaults preserve existing channel choices but never publish learning activity by old default", () => {
  assert.deepEqual(normalizeUserPreferences(null), DEFAULT_PREFERENCES);
  assert.equal(normalizeUserPreferences({ shareActivity: true }).shareActivity, false);
  assert.equal(normalizeUserPreferences({ shareActivity: true, activityConsentVersion: 1 }).shareActivity, true);
  assert.equal(normalizeUserPreferences({ shareActivity: false, activityConsentVersion: 1 }).shareActivity, false);
  assert.equal(Object.isFrozen(DEFAULT_PREFERENCES), true);
});

test("explicit false survives normalisation for every preference", () => {
  const flags = Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, false]));
  assert.deepEqual(normalizeUserPreferences(flags), flags);
});

test("patches accept only one known boolean field, never arbitrary account or role data", () => {
  for (const key of PREFERENCE_KEYS) for (const value of [false, true]) assert.deepEqual(validatePreferencePatch({ [key]: value }), { key, value });
  for (const patch of [null, [], {}, { push: "false" }, { push: 0 }, { role: "admin" }, { push: false, email: true }, { activityConsentVersion: 1 }]) assert.throws(() => validatePreferencePatch(patch));
});

for (const key of PREFERENCE_KEYS) test(`${key}: persisted on → off → on stays reversible`, async () => {
  const { store, writes, stop } = fixture();
  await tick();
  if (!store.getSnapshot().preferences[key]) await store.setPreference(key, true);
  assert.equal(await store.setPreference(key, false), true);
  assert.equal(store.getSnapshot().preferences[key], false);
  assert.equal(await store.setPreference(key, true), true);
  assert.equal(store.getSnapshot().preferences[key], true);
  assert.deepEqual(writes.slice(-2), [{ key, value: false }, { key, value: true }]);
  assert.deepEqual(store.getSnapshot().savingKeys, []);
  stop();
});

test("optimistic change is field-scoped; a stale snapshot cannot undo pending intent or other fields", async () => {
  let resolve;
  const { store, receive, stop } = fixture({ write: () => new Promise((done) => { resolve = done; }) });
  await tick();
  const pending = store.setPreference("push", false);
  receive({ ...DEFAULT_PREFERENCES, email: false }, 1);
  assert.equal(store.getSnapshot().preferences.push, false);
  assert.equal(store.getSnapshot().preferences.email, false);
  resolve({ preferences: { ...DEFAULT_PREFERENCES, push: false, email: false }, revision: 2 });
  assert.equal(await pending, true);
  receive({ ...DEFAULT_PREFERENCES }, 0);
  assert.equal(store.getSnapshot().preferences.push, false);
  assert.equal(store.getSnapshot().preferences.email, false);
  stop();
});

test("failed save rolls back only its own field and the retry applies the original intent", async () => {
  let fail = true;
  const { store, receive, stop } = fixture({ write: async (key, value) => {
    if (fail) throw new Error("Offline — retry");
    return { preferences: { ...DEFAULT_PREFERENCES, email: false, [key]: value }, revision: 2 };
  } });
  await tick();
  receive({ ...DEFAULT_PREFERENCES, email: false }, 1);
  assert.equal(await store.setPreference("push", false), false);
  assert.equal(store.getSnapshot().preferences.push, true);
  assert.equal(store.getSnapshot().preferences.email, false);
  assert.deepEqual(store.getSnapshot().failed, { key: "push", value: false });
  assert.match(store.getSnapshot().error, /Offline/);
  fail = false;
  assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().preferences.push, false);
  assert.equal(store.getSnapshot().preferences.email, false);
  assert.equal(store.getSnapshot().error, "");
  stop();
});

test("concurrent independent fields reconcile monotonically despite reversed HTTP responses", async () => {
  const resolves = {};
  const { store, receive, stop } = fixture({ write: (key) => new Promise((done) => { resolves[key] = done; }) });
  await tick();
  const push = store.setPreference("push", false);
  const email = store.setPreference("email", false);
  assert.deepEqual(store.getSnapshot().savingKeys.sort(), ["email", "push"]);
  const both = { ...DEFAULT_PREFERENCES, push: false, email: false };
  resolves.email({ preferences: both, revision: 2 });
  assert.equal(await email, true);
  resolves.push({ preferences: { ...DEFAULT_PREFERENCES, push: false }, revision: 1 });
  assert.equal(await push, true);
  receive({ ...DEFAULT_PREFERENCES, push: false }, 1);
  assert.deepEqual(store.getSnapshot().preferences, both);
  stop();
});

test("duplicate same-field taps cannot start competing writes", async () => {
  let resolve;
  const { store, writes, stop } = fixture({ write: () => new Promise((done) => { resolve = done; }) });
  await tick();
  const first = store.setPreference("push", false);
  assert.equal(await store.setPreference("push", true), false);
  assert.deepEqual(store.getSnapshot().savingKeys, ["push"]);
  resolve({ preferences: { ...DEFAULT_PREFERENCES, push: false }, revision: 1 });
  assert.equal(await first, true);
  assert.equal(writes.length, 1);
  stop();
});

test("lost HTTP acknowledgement cannot roll back a newer confirmed Firestore commit", async () => {
  let reject;
  const { store, receive, stop } = fixture({ write: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await tick();
  const pending = store.setPreference("push", false);
  receive({ ...DEFAULT_PREFERENCES, push: false }, 1);
  reject(new Error("Response timed out"));
  assert.equal(await pending, true);
  assert.equal(store.getSnapshot().preferences.push, false);
  assert.equal(store.getSnapshot().error, "");
  stop();
});

test("fresh cross-device changes update the stored flags without being overwritten by no-op saves", async () => {
  const { store, receive, writes, stop } = fixture();
  await tick();
  receive({ ...DEFAULT_PREFERENCES, promotions: true, profileVisible: false }, 8);
  assert.equal(store.getSnapshot().preferences.promotions, true);
  assert.equal(store.getSnapshot().preferences.profileVisible, false);
  assert.equal(await store.setPreference("promotions", true), true);
  assert.equal(writes.length, 0);
  stop();
});

test("read errors are recoverable and do not claim the defaults were loaded", async () => {
  let readError = true;
  const store = createPreferenceStore({ teardownMs: 0, subscribe: () => () => {}, read: async () => {
    if (readError) throw Error("Unable to connect");
    return { preferences: DEFAULT_PREFERENCES, revision: 0 };
  }, write: async () => { throw Error("must not write before read"); } });
  const stop = store.subscribe(() => {});
  await tick();
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getSnapshot().loading, false);
  assert.match(store.getSnapshot().error, /Unable to connect/);
  assert.equal(await store.setPreference("email", false), false);
  readError = false;
  assert.equal(await store.retry(), true);
  assert.equal(store.getSnapshot().ready, true);
  stop();
});

test("push/email opt-outs stop delivery but keep personal in-app service alerts", () => {
  const service = { category: "course", type: "product-updated" };
  assert.deepEqual(notificationPolicy({ ...DEFAULT_PREFERENCES, push: false, email: false }, service), {
    inbox: true, push: false, email: false, publicProfile: true, publicActivity: false,
  });
});

test("new-product/promotional messages honour promotion consent across inbox, Web Push, FCM and mail", () => {
  for (const payload of [{ type: "product-created" }, { category: "store" }, { category: "promotion" }, { marketing: true }, { tag: "campaign-autumn" }]) {
    const off = notificationPolicy(DEFAULT_PREFERENCES, payload);
    assert.equal(off.inbox, false); assert.equal(off.push, false); assert.equal(off.email, false);
    const on = notificationPolicy({ ...DEFAULT_PREFERENCES, promotions: true }, payload);
    assert.equal(on.inbox, true); assert.equal(on.push, true); assert.equal(on.email, true);
  }
});

test("private profiles hide activity even when its separate preference remains on", () => {
  assert.equal(publicProfileIdentity("uid", { preferences: { profileVisible: false } }), null);
  assert.equal(notificationPolicy({ profileVisible: false, shareActivity: true, activityConsentVersion: 1 }).publicActivity, false);
  assert.equal(notificationPolicy({ profileVisible: true, shareActivity: true, activityConsentVersion: 1 }).publicActivity, true);
});

test("public identity never leaks private account, purchase, referral, or contact fields", () => {
  const data = { name: "Ananya Sharma", photoURL: "https://example.test/avatar.png", email: "private@example.test", mobile: "9876543210", bio: "private", referralCode: "secret", purchasedProductIds: ["private"], preferences: DEFAULT_PREFERENCES };
  assert.deepEqual(publicProfileIdentity("uid", data), { uid: "uid", name: "Ananya Sharma", photoURL: data.photoURL });
  assert.deepEqual(publicProfileIdentity("uid", { ...data, photoURL: "javascript:alert(1)" }), { uid: "uid", name: "Ananya Sharma" });
});

test("learning sharing counts genuine activity, deduplicates completions, and returns no private names or ids", () => {
  const rows = [{ productId: "private-course", completedFileIds: ["r1", "r1", "r2"], title: "Private course" }, { lastOpenedFileId: "r3" }, {}, { completedFileIds: [null, "", 1] }];
  assert.deepEqual(publicLearningSummary(rows), { coursesStarted: 2, completedItems: 2 });
  assert.deepEqual(publicLearningSummary([]), { coursesStarted: 0, completedItems: 0 });
});


test("explicit malformed flags fail closed; missing legacy fields retain documented defaults", () => {
  for (const value of ["false", "true", 0, 1, null, [], {}]) {
    const raw = Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, value]));
    assert.deepEqual(normalizeUserPreferences({ ...raw, activityConsentVersion: 1 }), Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, false])));
    assert.equal(publicProfileIdentity("learner", { preferences: raw }), null);
    assert.equal(notificationPolicy(raw, { category: "promotion" }).push, false);
    assert.equal(notificationPolicy(raw).email, false);
  }
  assert.deepEqual(normalizeUserPreferences({}), DEFAULT_PREFERENCES);
});


test("a present malformed preferences container cannot manufacture notification consent or public visibility", () => {
  const closed = Object.fromEntries(PREFERENCE_KEYS.map((key) => [key, false]));
  for (const input of ["false", 1, 0, false, true, [], new Date()]) {
    assert.deepEqual(normalizeUserPreferences(input), closed);
    assert.equal(publicProfileIdentity("learner", { preferences: input }), null);
  }
  assert.deepEqual(normalizeUserPreferences(undefined), DEFAULT_PREFERENCES);
});
