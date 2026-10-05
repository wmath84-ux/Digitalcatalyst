// tests/courseSketchMultiBoardRuntime.test.mjs
//
// Runtime proof for the Sketch fixes of 2026-10-05 — same harness as
// tests/courseSketchCloudSyncRuntime.test.mjs (the real hook, real React 19,
// jsdom, an in-memory Firestore; no Excalidraw bundle):
//
//   1. the scene key moves when the load finishes, so an editor that was on
//      screen during the load mounts on the LOADED board, never the blank one;
//   2. a change from an editor mounted on an older scene is ignored;
//   3. a learner who draws before the auth session restores never overwrites
//      the cloud board — the two are merged — and a late session still reads;
//   4. "+" creates a blank board with a unique key, registers it at once,
//      guards double taps, and never touches existing boards;
//   5. the open board + the list survive a reload and reach a new device;
//   6. closing a board mid-write still delivers the newer revision;
//   7. "pending" is reported while an edit is not written yet;
//   8. corrupt device/cloud data opens gracefully.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-course-sketch-boards-runtime");
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
const listeners = new Set();
export const signInAs = (uid) => {
  authState.uid = uid;
  for (const fn of [...listeners]) fn(uid ? { uid } : null);
};
export const listenerCount = () => listeners.size;
export const auth = {
  get currentUser() {
    return authState.uid ? { uid: authState.uid, getIdToken: async () => "stub-token" } : null;
  },
  authStateReady: async () => undefined,
  onAuthStateChanged: (fn) => {
    listeners.add(fn);
    fn(authState.uid ? { uid: authState.uid } : null);
    return () => listeners.delete(fn);
  },
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
export const mountedWith = new Map<string, string>();

type Props = { uid: string | null; productId: string | null; moduleId: string | null; debounceMs?: number };

export function mount(target: HTMLElement, props: Props) {
  function SketchHarness({ uid, productId, moduleId, debounceMs }: Props) {
    const ctl = useCourseSketch({ uid, productId, moduleId, debounceMs });
    latest.ctl = ctl;
    latest.renders += 1;
    // Exactly what SketchPanel does: initialData is computed once per
    // sceneKey. Record it for every key the harness sees while NOT loading.
    if (!ctl.loading && !mountedWith.has(ctl.sceneKey)) {
      mountedWith.set(ctl.sceneKey, ctl.getScene().elements.map((e: any) => e.id).join(","));
    }
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
        <span id="board">{ctl.activeBoardKey}</span>
        <span id="boards">{ctl.boards.map((b: any) => b.sketchKey + ":" + b.title).join("|")}</span>
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
  fixture.mountedWith.clear();
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

const sketchPath = (uid, productId, moduleId) =>
  `users/${uid}/sketches/${fixture.sketchDocId(uid, productId, moduleId)}`;

const cloudScene = (uid, productId, moduleId) => {
  const row = fsx.store.get(sketchPath(uid, productId, moduleId));
  return row ? fixture.parseSketchScene(row.scene) : null;
};

const boardPath = (uid, productId, moduleId, key) =>
  `users/${uid}/sketches/${fixture.sketchDocId(uid, productId, moduleId, key)}`;

const seedCloud = (elements, { key = "main", updatedAt = Date.now(), title } = {}) => {
  const payload = fixture.toFirestoreSketch(
    { ...fixture.createSketchScene(), elements },
    { uid: UID, productId: PRODUCT, moduleId: MODULE_A, sketchKey: key, updatedAt, createdAt: updatedAt, title },
  );
  fsx.store.set(boardPath(UID, PRODUCT, MODULE_A, key), payload);
  return payload;
};

/* ── the load race: the editor never mounts on the pre-load scene ─────────── */

test("the scene key moves when the load finishes, so the editor mounts on the CLOUD board", async () => {
  freshWorld();
  seedCloud([stroke("cloud-1"), stroke("cloud-2")]);
  // A slow cloud read: the panel is already on screen while it runs.
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  const keyWhileLoading = text("key");
  assert.equal(text("loading"), "true");
  await settle(60);
  assert.equal(text("loading"), "false");
  assert.notEqual(text("key"), keyWhileLoading, "load completion is a new scene identity");
  // Every scene an editor could have mounted with is the cloud board — never
  // the blank board that existed while the read was in flight.
  assert.deepEqual([...fixture.mountedWith.values()], ["cloud-1,cloud-2"]);
  assert.equal(fsx.writes.length, 0, "opening is not an edit");
  app.unmount();
});

test("a change from an editor mounted on an OLDER scene is ignored", async () => {
  freshWorld();
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  const live = text("key");
  act(() => {
    fixture.latest.ctl.updateScene([stroke("stale")], {}, {}, live.replace(/#\d+$/, "#0"));
  });
  await settle(120);
  assert.equal(text("ids"), "", "the stale editor's scene never replaced the live one");
  assert.equal(fsx.writes.length, 0, "and was never written");
  // The live editor still saves normally.
  act(() => {
    fixture.latest.ctl.updateScene([stroke("live")], {}, {}, live);
  });
  await settle(120);
  assert.equal(cloudScene(UID, PRODUCT, MODULE_A).elements[0].id, "live");
  app.unmount();
});

/* ── late sign-in: never overwrite a board the hook has not read yet ─────── */

test("drawing before the auth session restores MERGES with the cloud board instead of overwriting it", async () => {
  freshWorld({ uid: null });
  seedCloud([stroke("saved-elsewhere")]);
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(40);
  assert.equal(text("loading"), "false", "the device copy (blank) opens without waiting");
  draw([stroke("drawn-early")]);
  await settle(150);
  assert.equal(fsx.writes.length, 0, "nothing may be written before the cloud copy is known");
  assert.match(text("status"), /error|pending/);

  // The Firebase session finishes restoring.
  await act(async () => {
    appStub.signInAs(UID);
    await sleep(200);
  });
  const ids = text("ids").split(",").sort();
  assert.deepEqual(ids, ["drawn-early", "saved-elsewhere"], "both survive on screen");
  assert.deepEqual(
    cloudScene(UID, PRODUCT, MODULE_A).elements.map((e) => e.id).sort(),
    ["drawn-early", "saved-elsewhere"],
    "and in the cloud",
  );
  assert.equal(text("status"), "saved");
  app.unmount();
});

test("a cold open whose auth restores late still READS the cloud board (no blank board)", async () => {
  freshWorld({ uid: null });
  seedCloud([stroke("c1"), stroke("c2")]);
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(40);
  assert.equal(text("ids"), "");
  await act(async () => {
    appStub.signInAs(UID);
    await sleep(80);
  });
  assert.equal(text("ids"), "c1,c2");
  assert.equal(fsx.writes.length, 0, "nothing was written back");
  app.unmount();
});

/* ── "+" — multiple boards ─────────────────────────────────────────────────── */

test("+ creates a blank board with a unique id, registers it at once, and never touches the first board", async () => {
  freshWorld();
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  draw([stroke("first-1")]);
  await settle(120);
  const mainPath = boardPath(UID, PRODUCT, MODULE_A, "main");
  const mainBefore = JSON.stringify(fsx.store.get(mainPath));

  let key = null;
  act(() => { key = fixture.latest.ctl.createBoard(); });
  assert.match(key, /^[a-z0-9-]+$/);
  assert.notEqual(key, "main");
  // A double-click is ONE board.
  let second = "x";
  act(() => { second = fixture.latest.ctl.createBoard(); });
  assert.equal(second, null, "the repeated tap is ignored");

  await settle(80);
  assert.equal(text("board"), key, "the new board is active");
  assert.equal(text("ids"), "", "and blank");
  assert.equal(text("loading"), "false", "and opens immediately");
  const newPath = boardPath(UID, PRODUCT, MODULE_A, key);
  assert.ok(fsx.store.has(newPath), "registered in the cloud straight away");
  assert.equal(fsx.store.get(newPath).elementCount, 0);
  assert.equal(fsx.store.get(newPath).sketchKey, key);
  assert.equal(fsx.store.get(newPath).title, "Canvas 2");
  assert.equal(JSON.stringify(fsx.store.get(mainPath)), mainBefore, "the first board is untouched");
  assert.equal(text("boards"), `main:Canvas 1|${key}:Canvas 2`);

  // Draw on the new board, go back to the first: nothing crossed over.
  draw([stroke("second-1")]);
  await settle(120);
  act(() => { fixture.latest.ctl.selectBoard("main"); });
  await settle(80);
  assert.equal(text("ids"), "first-1");
  assert.deepEqual(cloudScene(UID, PRODUCT, MODULE_A).elements.map((e) => e.id), ["first-1"]);
  assert.deepEqual(
    fixture.parseSketchScene(fsx.store.get(newPath).scene).elements.map((e) => e.id),
    ["second-1"],
  );
  app.unmount();
});

test("the open board and the board list survive a reload — and a new device lists them from the cloud", async () => {
  freshWorld();
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle();
  let key = null;
  act(() => { key = fixture.latest.ctl.createBoard(); });
  await settle(60);
  draw([stroke("b2-1"), stroke("b2-2")]);
  await settle(120);
  app.unmount();
  await settle(30);

  // Reload on the same device: the same board reopens.
  const again = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("board"), key);
  assert.equal(text("ids"), "b2-1,b2-2");
  again.unmount();
  await settle(30);

  // A different device: no localStorage at all. The list comes from the cloud.
  window.localStorage.clear();
  const other = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("boards"), `main:Canvas 1|${key}:Canvas 2`);
  act(() => { fixture.latest.ctl.selectBoard(key); });
  await settle(60);
  assert.equal(text("ids"), "b2-1,b2-2");
  assert.equal(fsx.writes.filter((w) => w.path.endsWith(key)).length >= 1, true);
  other.unmount();
});

/* ── closing mid-write ─────────────────────────────────────────────────────── */

test("closing the board while a write is in flight still delivers the newer revision", async () => {
  freshWorld();
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: 20 });
  await settle();
  fsx.state.writeDelayMs = 120;
  draw([stroke("s1")]);
  await settle(50); // the write for s1 is now in flight
  draw([stroke("s1"), stroke("s2")]);
  app.unmount(); // tab switch / leave the player, mid-write
  await settle(400);
  assert.deepEqual(cloudScene(UID, PRODUCT, MODULE_A).elements.map((e) => e.id), ["s1", "s2"]);
});

/* ── honest save state ─────────────────────────────────────────────────────── */

test("an edit that has not been written yet says so — never 'saved'", async () => {
  freshWorld();
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: 1500 });
  await settle();
  draw([stroke("s1")]);
  await settle(450);
  assert.equal(text("status"), "pending");
  assert.equal(fsx.writes.length, 0);
  await settle(1300);
  assert.equal(text("status"), "saved");
  app.unmount();
});

/* ── corrupt data ──────────────────────────────────────────────────────────── */

test("a corrupt device copy or cloud document opens gracefully instead of crashing", async () => {
  freshWorld();
  window.localStorage.setItem(`dc.sketch.v1.${UID}.${PRODUCT}.${MODULE_A}`, "{not json");
  window.localStorage.setItem(`dc.sketchIndex.v1.${UID}.${PRODUCT}.${MODULE_A}`, "[[[");
  fsx.store.set(boardPath(UID, PRODUCT, MODULE_A, "main"), {
    uid: UID, productId: PRODUCT, moduleId: MODULE_A, sketchKey: "main", scene: "{broken", updatedAt: 5, createdAt: 5,
  });
  const app = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, moduleId: MODULE_A, debounceMs: DEBOUNCE });
  await settle(60);
  assert.equal(text("loading"), "false");
  assert.equal(text("ids"), "");
  assert.equal(text("boards"), "main:Canvas 1");
  draw([stroke("recovered")]);
  await settle(120);
  assert.equal(cloudScene(UID, PRODUCT, MODULE_A).elements[0].id, "recovered");
  app.unmount();
});
