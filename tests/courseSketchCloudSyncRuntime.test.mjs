// tests/courseSketchCloudSyncRuntime.test.mjs
//
// Runtime proof for the Course Player's SKETCH persistence. The pure scene
// model has its own file (tests/courseSketchScene.test.mjs); this one runs the
// real `useCourseSketch` hook in real React 19 inside jsdom, against an
// in-memory Firestore, with no Excalidraw bundle anywhere near it — the hook
// is deliberately decoupled from the editor, which is exactly why it can be
// tested this fast.
//
// Firebase I/O is the only thing replaced:
//   • `firebase/firestore` — an in-memory store that records every write, so
//     paths, payloads, ordering and write COUNT are all observable;
//   • `../../firebase` — the app's `db` / `auth` singletons.
// Security rules are proved by the emulator suite, not here.
//
// What is proved, in behaviour rather than in text:
//   1. a drawn stroke reaches `users/{uid}/sketches/{uid}__{product}__{module}`
//      as a JSON STRING scene (Firestore forbids the nested point arrays);
//   2. a continuous drawing is debounced — one write, not one per change;
//   3. Excalidraw's no-op onChange calls (hover, select, open menu) never
//      write at all;
//   4. module A's board never leaks into module B, and returning to A
//      restores A;
//   5. a cloud failure never erases local work: the device mirror holds it,
//      the state says so out loud, and the write is retried until it lands;
//   6. a refused READ leaves the device copy on screen instead of blanking
//      the board;
//   7. unmounting (tab switch / leaving the player) flushes what is pending;
//   8. a uid the session cannot verify never writes into anyone's namespace;
//   9. drawing never re-renders the player — the scene lives outside React;
//  10. the scene key is stable across re-renders, so nothing can remount the
//      editor except a genuine change of board.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-course-sketch-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── stub: an in-memory Firestore ─────────────────────────────────────────── */

const FIRESTORE_STUB = path.join(DIR, "firestoreStub.mjs");
fs.writeFileSync(
  FIRESTORE_STUB,
  `
export const store = new Map();   // "users/u1/sketches/<id>" -> document data
export const writes = [];         // every set() that reached the "server"
export const reads = [];          // every getDoc() path
export const state = { failWrites: null, failReads: null, writeDelayMs: 0 };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asPath = (ref) => (typeof ref === "string" ? ref : String((ref && ref.path) || ""));
const fail = (spec) => {
  const error = new Error(spec.message || "stub failure");
  error.code = spec.code;
  return error;
};

export function collection(_db, ...segments) { return { type: "collection", path: segments.join("/") }; }
export function doc(_db, ...segments) { return { type: "doc", path: segments.join("/") }; }
export function serverTimestamp() { return new Date(0); }

export async function getDoc(ref) {
  const key = asPath(ref);
  reads.push(key);
  if (state.failReads) throw fail(state.failReads);
  const data = store.get(key);
  return { exists: () => Boolean(data), data: () => data };
}

export async function setDoc(ref, data) {
  const key = asPath(ref);
  if (state.writeDelayMs) await delay(state.writeDelayMs);
  if (state.failWrites) throw fail(state.failWrites);
  store.set(key, { ...data });
  writes.push({ path: key, data });
}

export async function deleteDoc(ref) {
  store.delete(asPath(ref));
}

// The board list query (users/{uid}/sketches where productId == … and
// moduleId == …) — equality filters only, exactly what the hook issues.
export const queries = [];
export function where(field, op, value) { return { field, op, value }; }
export function query(ref, ...filters) { return { type: "query", path: ref.path, filters }; }
export async function getDocs(q) {
  queries.push(q);
  if (state.failReads) throw fail(state.failReads);
  const prefix = q.path + "/";
  const rows = [];
  for (const [key, data] of store.entries()) {
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes("/")) continue;
    if (!q.filters.every((f) => f.op === "==" && data[f.field] === f.value)) continue;
    rows.push({ id: key.slice(prefix.length), data: () => data });
  }
  return { forEach: (fn) => rows.forEach(fn), docs: rows, size: rows.length };
}

export const reset = () => {
  store.clear();
  writes.length = 0;
  reads.length = 0;
  queries.length = 0;
  state.failWrites = null;
  state.failReads = null;
  state.writeDelayMs = 0;
};
export const paths = () => Array.from(store.keys());
`,
);

/* ── stub: the app's firebase singletons ──────────────────────────────────── */

const APP_STUB = path.join(DIR, "appStub.mjs");
fs.writeFileSync(
  APP_STUB,
  `
export const authState = { uid: "u1" };
export const auth = {
  get currentUser() {
    return authState.uid ? { uid: authState.uid, getIdToken: async () => "stub-token" } : null;
  },
  authStateReady: async () => undefined,
  onAuthStateChanged: () => () => undefined,
};
export const db = { __stubDb: true };
`,
);

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  define(key, window[key]);
}

const el = (id) => window.document.getElementById(id);
const text = (id) => el(id)?.textContent ?? "";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real hook, mounted ──────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import useCourseSketch from "./src/course/useCourseSketch";
import { parseSketchScene, sketchDocId, toFirestoreSketch, createSketchScene } from "./utils/sketchScene.js";

export { act, parseSketchScene, sketchDocId, toFirestoreSketch, createSketchScene };
export const latest: { ctl: any; renders: number } = { ctl: null, renders: 0 };

type Props = { uid: string | null; productId: string | null; moduleId: string | null; debounceMs?: number };

export function mount(target: HTMLElement, props: Props) {
  function SketchHarness({ uid, productId, moduleId, debounceMs }: Props) {
    const ctl = useCourseSketch({ uid, productId, moduleId, debounceMs });
    latest.ctl = ctl;
    latest.renders += 1;
    return (
      <div>
        <span id="status">{ctl.status}</span>
        <span id="error">{ctl.errorMessage ?? ""}</span>
        <span id="loading">{String(ctl.loading)}</span>
        <span id="scoped">{String(ctl.scoped)}</span>
        <span id="pending">{String(ctl.pendingSync)}</span>
        <span id="key">{ctl.sceneKey}</span>
        <span id="count">{String(ctl.getScene().elements.length)}</span>
        <span id="ids">{ctl.getScene().elements.map((e: any) => e.id).join(",")}</span>
      </div>
    );
  }
  const root = createRoot(target);
  act(() => { root.render(<SketchHarness {...props} />); });
  return {
    render(next: Props) { act(() => { root.render(<SketchHarness {...next} />); }); },
    unmount() { act(() => { root.unmount(); }); },
  };
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
  plugins: [
    {
      name: "sketch-io-boundaries",
      setup(b) {
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE_STUB, external: true }));
        b.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP_STUB, external: true }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const fsx = await import(pathToFileURL(FIRESTORE_STUB).href);
const appStub = await import(pathToFileURL(APP_STUB).href);

const { act } = fixture;

after(() => {
  // jsdom's rAF loop (pretendToBeVisual) would otherwise keep the runner alive
  // after the last test; React's scheduler MessageChannel does the same.
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const UID = "u1";
const PRODUCT = "p1";
const MODULE_A = "mod-a";
const MODULE_B = "mod-b";
const DEBOUNCE = 40;

/** A freehand stroke, with the nested `points` arrays Firestore refuses. */
const stroke = (id, version = 1) => ({
  id,
  type: "freedraw",
  version,
  versionNonce: 900 + version,
  x: 1,
  y: 2,
  points: [
    [0, 0],
    [5, 7],
  ],
});

function freshWorld({ uid = UID } = {}) {
  fsx.reset();
  window.localStorage.clear();
  appStub.authState.uid = uid;
  fixture.latest.renders = 0;
  const target = window.document.createElement("div");
  target.id = "host";
  window.document.body.replaceChildren(target);
  return target;
}

/** A new mount point that keeps localStorage and the cloud store as they are. */
function newHost() {
  const target = window.document.createElement("div");
  target.id = "host";
  window.document.body.replaceChildren(target);
  return target;
}

async function settle(ms = 30) {
  await act(async () => {
    await sleep(ms);
  });
}

/** Excalidraw calls `onChange(elements, appState, files)`; so do we. */
function draw(elements, appState = { theme: "dark" }, files = {}) {
  act(() => {
    fixture.latest.ctl.updateScene(elements, appState, files);
  });
}

/** The live scene's element ids, read from the session (not from a render). */
const sceneIds = () => fixture.latest.ctl.getScene().elements.map((e) => e.id).join(",");

const sketchPath = (uid, productId, moduleId) =>
  `users/${uid}/sketches/${fixture.sketchDocId(uid, productId, moduleId)}`;

const cloudScene = (uid, productId, moduleId) => {
  const row = fsx.store.get(sketchPath(uid, productId, moduleId));
  return row ? fixture.parseSketchScene(row.scene) : null;
};

/* ── 1. the drawing reaches Firestore, as a string scene ──────────────────── */

test("a stroke is written to the learner's own module document, as a JSON string", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  assert.equal(text("loading"), "false");
  assert.equal(text("scoped"), "true");

  draw([stroke("s1")]);
  await settle(120);

  const expected = sketchPath(UID, PRODUCT, MODULE_A);
  assert.deepEqual(fsx.paths(), [expected], "exactly one document, in the learner's own namespace");
  const row = fsx.store.get(expected);
  assert.equal(typeof row.scene, "string", "the scene is a string — Firestore bans nested arrays");
  assert.equal(row.uid, UID);
  assert.equal(row.productId, PRODUCT);
  assert.equal(row.moduleId, MODULE_A);
  assert.equal(row.elementCount, 1);
  // …and it really is the drawing, structure and all.
  const scene = fixture.parseSketchScene(row.scene);
  assert.equal(scene.elements[0].id, "s1");
  assert.deepEqual(scene.elements[0].points, [[0, 0], [5, 7]]);
  assert.equal(scene.appState.theme, "dark");
  assert.equal(text("status"), "saved");
  app.unmount();
});

/* ── 2 + 3. debounce, and the no-op onChange storm ────────────────────────── */

test("a continuous drawing is debounced into one write, and hovers write nothing", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();

  // 25 onChange calls in a row — what a single pen stroke actually produces.
  for (let index = 1; index <= 25; index += 1) draw([stroke("s1", index)]);
  await settle(150);
  assert.equal(fsx.writes.length, 1, "one debounced write for the whole stroke");

  // Now the noise: Excalidraw fires onChange for selections, hovers and menu
  // opens with the SAME elements. Not one of them may reach the network.
  const before = fsx.writes.length;
  for (let index = 0; index < 10; index += 1) {
    draw([stroke("s1", 25)], { theme: "dark", openMenu: index % 2 ? "shape" : null });
  }
  await settle(150);
  assert.equal(fsx.writes.length, before, "an unchanged scene is never written");
  app.unmount();
});

/* ── 4. module scoping ────────────────────────────────────────────────────── */

test("module A's board never leaks into module B, and going back restores A", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  draw([stroke("a1"), stroke("a2")]);
  await settle(120);

  // The learner moves to a lesson in another module.
  app.render({ uid: UID, productId: PRODUCT, moduleId: MODULE_B, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("count"), "0", "module B opens on a blank board");
  assert.notEqual(text("key"), "", "the scene key names the scope");

  draw([stroke("b1")]);
  await settle(120);

  assert.deepEqual(
    fsx.paths().sort(),
    [sketchPath(UID, PRODUCT, MODULE_A), sketchPath(UID, PRODUCT, MODULE_B)].sort(),
    "two separate documents",
  );
  assert.deepEqual(cloudScene(UID, PRODUCT, MODULE_A).elements.map((e) => e.id), ["a1", "a2"]);
  assert.deepEqual(cloudScene(UID, PRODUCT, MODULE_B).elements.map((e) => e.id), ["b1"]);

  // …and back to A.
  app.render({ uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(80);
  assert.equal(text("ids"), "a1,a2", "module A's board came back");
  app.unmount();
});

test("the scene key is stable while the board is — it only moves with the scope", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  const first = text("key");
  // Re-rendering the player (a divider drag, a status change, anything) must
  // never move the key: that is what would remount the editor mid-stroke.
  app.render({ uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  app.render({ uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  draw([stroke("s1")]);
  await settle(120);
  assert.equal(text("key"), first, "same board ⇒ same key");
  app.render({ uid: UID, productId: PRODUCT, moduleId: MODULE_B, debounceMs: DEBOUNCE });
  await settle(60);
  assert.notEqual(text("key"), first, "a different module IS a different board");
  app.unmount();
});

/* ── 5. drawing must never cost a render ──────────────────────────────────── */

test("drawing does not re-render the player", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: 400 });
  await settle();
  const before = fixture.latest.renders;
  // 60 onChange calls — a few seconds of continuous drawing.
  for (let index = 1; index <= 60; index += 1) draw([stroke("s1", index)]);
  assert.equal(fixture.latest.renders, before, "not one render per stroke");
  // The live scene is still exact, even though React never heard about it.
  assert.equal(fixture.latest.ctl.getScene().elements[0].version, 60);
  await settle(600);
  app.unmount();
});

/* ── 6. a cloud failure never costs the learner their work ────────────────── */

test("a refused write keeps the board on the device, says so, and retries until it lands", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();

  fsx.state.failWrites = { code: "unavailable", message: "offline" };
  draw([stroke("s1")]);
  await settle(150);

  assert.equal(fsx.writes.length, 0, "nothing reached the cloud");
  assert.equal(text("status"), "error");
  assert.equal(text("pending"), "true");
  assert.match(text("error"), /Offline/i, "the state is named, not silent");
  // The work itself is safe on the device, and the outbox remembers it.
  const mirror = window.localStorage.getItem(`dc.sketch.v1.${UID}.${PRODUCT}.${MODULE_A}`);
  assert.equal(Boolean(mirror), true, "the device mirror holds the drawing");
  assert.equal(fixture.parseSketchScene(JSON.parse(mirror).scene).elements[0].id, "s1");
  assert.equal(window.localStorage.getItem(`dc.sketchOutbox.v1.${UID}.${PRODUCT}.${MODULE_A}`), "1");
  // The board on screen is untouched by the failure.
  assert.equal(text("ids"), "s1");

  // The connection comes back: the queued board lands without the learner
  // touching anything.
  fsx.state.failWrites = null;
  await act(async () => {
    window.dispatchEvent(new window.Event("online"));
    await sleep(80);
  });
  assert.equal(fsx.writes.length, 1, "the retry delivered the board");
  assert.equal(cloudScene(UID, PRODUCT, MODULE_A).elements[0].id, "s1");
  assert.equal(text("pending"), "false");
  assert.equal(window.localStorage.getItem(`dc.sketchOutbox.v1.${UID}.${PRODUCT}.${MODULE_A}`), null);
  app.unmount();
});

test("a refused READ leaves the device copy on screen instead of blanking the board", async () => {
  // First visit: draw something, so the device has a copy.
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  draw([stroke("s1"), stroke("s2")]);
  await settle(120);
  app.unmount();

  // Second visit, with the cloud refusing every read.
  fsx.state.failReads = { code: "permission-denied", message: "nope" };
  const again = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("ids"), "s1,s2", "the learner's drawing is still there");
  assert.equal(text("loading"), "false", "and the editor is allowed to open");
  assert.equal(text("status"), "error");
  assert.match(text("error"), /blocked|device/i);
  again.unmount();
});

/* ── 7. leaving must flush ────────────────────────────────────────────────── */

test("unmounting (tab switch / leaving the player) flushes the pending board", async () => {
  const target = freshWorld();
  // A long debounce, so nothing could have been written on a timer.
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: 5000 });
  await settle();
  draw([stroke("s1")]);
  assert.equal(fsx.writes.length, 0, "the debounce has not fired");

  app.unmount();
  await settle(60);

  assert.equal(fsx.writes.length, 1, "the unmount wrote it");
  assert.equal(cloudScene(UID, PRODUCT, MODULE_A).elements[0].id, "s1");
});

test("a page hide flushes too — the learner can close the tab mid-stroke", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: 5000 });
  await settle();
  draw([stroke("s1")]);
  await act(async () => {
    window.dispatchEvent(new window.Event("pagehide"));
    await sleep(60);
  });
  assert.equal(fsx.writes.length, 1);
  app.unmount();
});

/* ── 8. ownership ─────────────────────────────────────────────────────────── */

test("a uid the session cannot verify never writes into anybody's namespace", async () => {
  const target = freshWorld({ uid: "someone-else" });
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  draw([stroke("s1")]);
  await settle(150);

  assert.deepEqual(fsx.paths(), [], "no document was created at all");
  assert.equal(text("status"), "error");
  assert.match(text("error"), /session|device/i);
  // The learner still keeps their drawing locally.
  assert.equal(text("ids"), "s1");
  assert.equal(
    Boolean(window.localStorage.getItem(`dc.sketch.v1.${UID}.${PRODUCT}.${MODULE_A}`)),
    true,
  );
  app.unmount();
});

test("with no module the board is unscoped — and the drawing is kept on the device, not dropped", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: null, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("scoped"), "false");
  assert.equal(text("loading"), "false", "an unscoped board must not spin forever");
  draw([stroke("s1")]);
  // 350 ms is the device mirror's own tail — give it room to fire.
  await settle(450);
  assert.deepEqual(fsx.paths(), [], "no cloud board can be addressed without a module");
  assert.equal(sceneIds(), "s1", "and the scene is on screen");
  // The learner's work is NOT thrown away in the meantime: there is no board
  // document, so this device holds the draft instead.
  const draft = JSON.parse(window.localStorage.getItem(`dc.sketchDraft.v1.${UID}.${PRODUCT}`) || "null");
  assert.equal(fixture.parseSketchScene(draft?.scene)?.elements?.length, 1, "the device kept the draft");
  assert.equal(text("status"), "ready");

  // A tab switch (unmount, then remount with no lesson open) keeps it.
  app.unmount();
  const again = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: null, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(sceneIds(), "s1", "reopening the canvas brings the draft back");
  again.unmount();
});

test("a sketch drawn before a lesson was open joins the first empty board", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: null, debounceMs: DEBOUNCE });
  await settle(60);
  draw([stroke("before-1"), stroke("before-2")]);
  await settle(450);
  assert.deepEqual(fsx.paths(), []);
  app.unmount();

  // The learner picks a lesson: the module arrives, the board loads — and it
  // is empty, so it takes the draft. Nothing the learner drew is lost.
  const scopedHost = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(200);
  assert.equal(sceneIds(), "before-1,before-2", "the draft moved onto the module's board");
  const uploaded = cloudScene(UID, PRODUCT, MODULE_A);
  assert.equal(uploaded?.elements?.length, 2, "and reached the cloud as the module's board");
  assert.equal(
    window.localStorage.getItem(`dc.sketchDraft.v1.${UID}.${PRODUCT}`),
    null,
    "the draft was handed over, not copied",
  );
  assert.ok(
    window.localStorage.getItem(`dc.sketch.v1.${UID}.${PRODUCT}.${MODULE_A}`),
    "and written to the board's own device copy",
  );
  scopedHost.unmount();
});

test("a board that already has work never takes the draft", async () => {
  const target = freshWorld();
  const app = fixture.mount(target, { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(120);
  draw([stroke("mine")]);
  await settle(150);
  app.unmount();
  assert.equal(sceneIds(), "mine");

  // A draft left over from an unscoped session…
  window.localStorage.setItem(
    `dc.sketchDraft.v1.${UID}.${PRODUCT}`,
    JSON.stringify({ scene: JSON.stringify({ ...fixture.createSketchScene(), elements: [stroke("draft")] }), updatedAt: Date.now(), createdAt: Date.now() }),
  );
  // …must not overwrite the board's own drawing.
  const again = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(200);
  assert.equal(sceneIds(), "mine", "the board keeps its own work");
  assert.ok(window.localStorage.getItem(`dc.sketchDraft.v1.${UID}.${PRODUCT}`), "and the draft is still waiting for an empty board");
  again.unmount();
});

/* ── 9. a second device ───────────────────────────────────────────────────── */

test("a board drawn on another device opens here", async () => {
  freshWorld();
  // What the other device left behind, written exactly as the app writes it.
  const payload = fixture.toFirestoreSketch(
    { ...fixture.createSketchScene(), elements: [stroke("other-1"), stroke("other-2")] },
    { uid: UID, productId: PRODUCT, moduleId: MODULE_A, updatedAt: Date.now(), createdAt: Date.now() },
  );
  fsx.store.set(sketchPath(UID, PRODUCT, MODULE_A), payload);

  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("ids"), "other-1,other-2");
  assert.equal(text("status"), "ready");
  // Opening a board is not an edit: nothing is written back.
  assert.equal(fsx.writes.length, 0);
  app.unmount();
});

test("the newer copy wins: local work drawn offline is pushed over an older cloud board", async () => {
  freshWorld();
  // An OLD cloud board…
  const old = fixture.toFirestoreSketch(
    { ...fixture.createSketchScene(), elements: [stroke("old")] },
    { uid: UID, productId: PRODUCT, moduleId: MODULE_A, updatedAt: 1000, createdAt: 1000 },
  );
  fsx.store.set(sketchPath(UID, PRODUCT, MODULE_A), old);
  // …and a NEWER device copy, drawn while the learner was offline.
  window.localStorage.setItem(
    `dc.sketch.v1.${UID}.${PRODUCT}.${MODULE_A}`,
    JSON.stringify({
      scene: JSON.stringify({ ...fixture.createSketchScene(), elements: [stroke("fresh")] }),
      updatedAt: Date.now(),
      createdAt: 1000,
    }),
  );

  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(150);
  assert.equal(text("ids"), "fresh", "the learner's own newer work stays on screen");
  assert.equal(cloudScene(UID, PRODUCT, MODULE_A).elements[0].id, "fresh", "and is pushed up");
  app.unmount();
});
