// tests/courseNotesCloudSyncRuntime.test.mjs
//
// RUNTIME proof for the reported bug (owner, 2026-09-28):
//
//   "Sanctuary ke notes aur mind map save nahi ho rahe — properly Firebase me
//    save hone chahiye aur render hone chahiye."
//
// tests/courseNotesCloudSyncContract.test.mjs pins the SHAPE of the fix in the
// source. This file runs the real thing: the actual `useCourseNotes` hook,
// the actual `cloudNotes` Firestore layer, the actual `utils/courseNotes.js`
// normaliser and the actual `notesStore` device mirror, mounted in real
// React 19 inside jsdom, against an in-memory Firestore.
//
// Firebase I/O is mocked; these prove SDK calls/races, not a production
// round-trip or rules permissions. The BoardPortals integration cases also
// replace UI-only panels with probes while keeping both real persistence hooks:
// (the emulator suite separately exercises the actual SDK/security rules).
//   • `firebase/firestore` — an in-memory collection that records every
//     document written, so target paths, payloads and ordering are observable;
//   • `../../firebase` — the app's `db` / `auth` singletons.
//
// What is proved here, in behaviour rather than in text:
//   1. a note typed on the board is written to `users/{uid}/notes/{id}`;
//   2. a note written by ANOTHER device is rendered without a refresh;
//   3. the localStorage mirror holds every note (offline / cold open);
//   4. a delete reaches the cloud immediately and a tombstone beats a stale
//      cloud copy, so a deleted note can never come back;
//   5. an offline write is kept and retried until it lands;
//   6. a refused listener still paints the device copy and says
//      `permission-denied` out loud instead of showing an empty board;
//   7. leaving the board flushes whatever is still pending;
//   8. notes never mix between courses, and a uid the session cannot verify
//      never writes into another learner's namespace;
//   9. the controller identity is stable, so the 3D Sanctuary board does not
//      rebuild its panel on every note change;
//  10. the unmount draft rescue (`appendCloudNote` / `patchCloudNote`) reaches
//      the cloud with no hook mounted at all.

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
const DIR = path.join(ROOT, "node_modules", ".tmp-course-notes-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── stub: an in-memory Firestore ─────────────────────────────────────────── */

const FIRESTORE_STUB = path.join(DIR, "firestoreStub.mjs");
fs.writeFileSync(
  FIRESTORE_STUB,
  `
export const store = new Map();          // "users/u1/notes/<id>" -> document data
export const commits = [];               // every op that reached the "server"
export const state = { failWrites: null, failReads: null, writeDelayMs: 0, activeWrites: 0, maxActiveWrites: 0 };
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const listeners = [];

const asPath = (ref) => (typeof ref === "string" ? ref : String((ref && ref.path) || ""));
const fail = (spec) => {
  const error = new Error(spec.message || "stub failure");
  error.code = spec.code;
  return error;
};

export function collection(_db, ...segments) { return { type: "collection", path: segments.join("/") }; }
export function doc(_db, ...segments) { return { type: "doc", path: segments.join("/") }; }
export function where(field, op, value) { return { kind: "where", field, op, value }; }
export function orderBy(field, dir) { return { kind: "orderBy", field, dir }; }
export function limit(n) { return { kind: "limit", n }; }
export function query(target, ...constraints) { return { ...target, constraints }; }
export function serverTimestamp() { return new Date(0); }
export const listenerCount = () => listeners.length;

const children = (basePath) =>
  Array.from(store.entries()).filter(
    ([key]) => key.startsWith(basePath + "/") && !key.slice(basePath.length + 1).includes("/"),
  );

const matches = (data, constraints) =>
  (constraints || []).every((constraint) => {
    if (constraint.kind !== "where") return true;
    if (constraint.op !== "==") throw new Error("the stub only implements ==");
    return String((data || {})[constraint.field] ?? "") === String(constraint.value);
  });

export function snapshotOf(q) {
  const basePath = asPath(q);
  let rows = children(basePath).filter(([, data]) => matches(data, q.constraints));
  const sort = (q.constraints || []).find((c) => c.kind === "orderBy");
  if (sort) {
    const sign = sort.dir === "asc" ? 1 : -1;
    rows = rows.sort(
      (a, b) => sign * (Number((a[1] || {})[sort.field] ?? 0) - Number((b[1] || {})[sort.field] ?? 0)),
    );
  }
  const cap = (q.constraints || []).find((c) => c.kind === "limit");
  if (cap) rows = rows.slice(0, cap.n);
  return {
    empty: rows.length === 0,
    size: rows.length,
    docs: rows.map(([key, data]) => ({
      id: key.split("/").pop(),
      ref: { path: key },
      exists: () => true,
      data: () => data,
    })),
  };
}

/** Push a fresh snapshot to every live listener — a write from another device. */
export function notify() {
  for (const listener of [...listeners]) {
    if (state.failReads) listener.onError && listener.onError(fail(state.failReads));
    else listener.onData(snapshotOf(listener.query));
  }
}

export function onSnapshot(q, onData, onError) {
  const listener = { query: q, onData, onError };
  listeners.push(listener);
  if (state.failReads) Promise.resolve().then(() => onError && onError(fail(state.failReads)));
  else Promise.resolve().then(() => onData(snapshotOf(q)));
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

export async function getDocs(q) {
  if (state.failReads) throw fail(state.failReads);
  return snapshotOf(q);
}
export async function getDoc(ref) {
  if (state.failReads) throw fail(state.failReads);
  const data = store.get(asPath(ref));
  return { exists: () => Boolean(data), data: () => data };
}

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) { ops.push({ kind: "set", path: asPath(ref), data }); },
    delete(ref) { ops.push({ kind: "delete", path: asPath(ref) }); },
    async commit() {
      const error = state.failWrites;
      state.activeWrites++;
      state.maxActiveWrites = Math.max(state.maxActiveWrites, state.activeWrites);
      try {
        if (state.writeDelayMs) await delay(state.writeDelayMs);
        if (error) throw fail(error);
        for (const op of ops) {
          if (op.kind === "set") store.set(op.path, { ...(store.get(op.path) || {}), ...op.data });
          else store.delete(op.path);
          commits.push(op);
        }
        notify();
      } finally { state.activeWrites--; }
    },
  };
}

export async function setDoc(ref, data) {
  if (state.failWrites) throw fail(state.failWrites);
  const key = asPath(ref);
  store.set(key, { ...(store.get(key) || {}), ...data });
  commits.push({ kind: "set", path: key, data });
  notify();
}

export async function deleteDoc(ref) {
  if (state.failWrites) throw fail(state.failWrites);
  const key = asPath(ref);
  store.delete(key);
  commits.push({ kind: "delete", path: key });
  notify();
}

export const reset = () => {
  store.clear();
  commits.length = 0;
  listeners.length = 0;
  state.failWrites = null;
  state.failReads = null;
  state.writeDelayMs = 0;
  state.activeWrites = 0;
  state.maxActiveWrites = 0;
};
export const noteDoc = (uid, id) => store.get(\`users/\${uid}/notes/\${id}\`);
export const noteIds = (uid, productId) =>
  children(\`users/\${uid}/notes\`)
    .filter(([, data]) => String(data.productId ?? "") === String(productId))
    .map(([key]) => key.split("/").pop());
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

const BOARD_PANELS = path.join(DIR, "boardPanels.tsx");
fs.writeFileSync(BOARD_PANELS, `
import * as React from "react";
export function NotesPanel(props: any) {
  (window as any).__sanctuaryNotes = props;
  return <div data-board-notes>{props.notes.map((note: any) => <p key={note.id}>{note.text}</p>)}</div>;
}
// Mirrors the actual node editor's passive commit-on-teardown lifecycle.
function PendingNodeEditor(props: any) {
  React.useEffect(() => () => {
    const topic = (window as any).__sanctuaryNodeCleanupDraft;
    if (!topic) return;
    (window as any).__sanctuaryNodeCleanupDraft = null;
    props.onMindChange((current: any) => ({ ...current, rootTopic: topic }));
    props.onFlush();
  }, []);
  return null;
}
export function MindMapPanel(props: any) {
  (window as any).__sanctuaryMap = props;
  return <div data-board-map>{props.mind.nodes.map((node: any) => <p key={node.id}>{node.topic}</p>)}
    <PendingNodeEditor key={props.activeMapKey} onMindChange={props.onMindChange} onFlush={props.onFlush}/>
  </div>;
}
export function ReadingBoard(props: any) {
  (window as any).__sanctuaryReading = props;
  return <div data-board-reading>{props.courseId || "No course picked"}</div>;
}
export function BoardFrame(props: any) { return <section><header>{props.subtitle}</header>{props.children}</section>; }
`);
const NOTE_PANEL = path.join(DIR, "notePanel.ts");
const MAP_PANEL = path.join(DIR, "mapPanel.ts");
const READING_PANEL = path.join(DIR, "readingPanel.ts");
fs.writeFileSync(NOTE_PANEL, 'export { NotesPanel as default } from "./boardPanels";');
fs.writeFileSync(MAP_PANEL, 'export { MindMapPanel as default } from "./boardPanels";');
fs.writeFileSync(READING_PANEL, 'export { ReadingBoard as default, BoardFrame } from "./boardPanels";');

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

const host = () => window.document.getElementById("host");
const el = (id) => window.document.getElementById(id);
const text = (id) => (el(id)?.textContent ?? "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real hook, mounted ──────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import BoardPortals from "./src/nature3d/boards/StudyBoards";
import { addChildNode } from "./utils/mindMapTree";
import { getCoursePanelSession, setNotesSessionView } from "./src/course/coursePanelSession";
import useCourseNotes from "./src/course/useCourseNotes";
import { appendCloudNote, patchCloudNote } from "./src/course/cloudNotes";
import { toFirestoreNote, MAX_NOTES_PER_COURSE } from "./utils/courseNotes";
import { persistLocalNotes, persistDeletedNoteIds, notesStorageKey, notesDeletedKey } from "./src/course/notesStore";

export { addChildNode, getCoursePanelSession, setNotesSessionView };
export { act, appendCloudNote, patchCloudNote, toFirestoreNote, persistLocalNotes, persistDeletedNoteIds, notesStorageKey, notesDeletedKey, MAX_NOTES_PER_COURSE };
export const latest: { ctl: any } = { ctl: null };
export function mountBoards(target: HTMLElement, props: any) {
  const hosts: any = {};
  for (const slot of ["reading","notes","mindmap"]) {
    hosts[slot] = document.createElement("div");
    hosts[slot].dataset.testSlot=slot;target.appendChild(hosts[slot]);
  }
  const reactHost=document.createElement("div");target.appendChild(reactHost);
  const root=createRoot(reactHost);
  const render=(next: any)=>act(()=>root.render(<BoardPortals {...next} hosts={hosts}/>));
  render(props);
  return { render, unmount:()=>act(()=>root.unmount()) };
}

type Props = { uid: string | null; productId: string | number | null; debounceMs?: number };

export function mount(target: HTMLElement, props: Props) {
  function Board({ uid, productId, debounceMs }: Props) {
    const ctl = useCourseNotes({ uid, productId, debounceMs });
    latest.ctl = ctl;
    return (
      <div>
        <span id="status">{ctl.status}</span>
        <span id="error">{ctl.errorMessage ?? ""}</span>
        <span id="loading">{String(ctl.loading)}</span>
        <span id="synced">{String(ctl.synced)}</span>
        <span id="count">{String(ctl.notes.length)}</span>
        <ul id="notes">
          {ctl.notes.map((note) => (
            <li key={note.id} id={\`note-\${note.id}\`} data-text={note.text} data-html={note.html ?? ""}>
              {note.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const root = createRoot(target);
  act(() => { root.render(<Board {...props} />); });
  return {
    render(next: Props) { act(() => { root.render(<Board {...next} />); }); },
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
      name: "notes-io-boundaries",
      setup(b) {
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE_STUB, external: true }));
        b.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP_STUB, external: true }));
        b.onResolve({ filter: /course\/NotesPanel$/ }, () => ({ path: NOTE_PANEL }));
        b.onResolve({ filter: /course\/MindMapPanel$/ }, () => ({ path: MAP_PANEL }));
        b.onResolve({ filter: /\/ReadingBoard$/ }, () => ({ path: READING_PANEL }));
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
  // after the last test — the repo's other runtime tests close the window too.
  dom.window.close();
  // React's scheduler drives itself through a Node `MessageChannel`, and Node
  // re-refs a port the moment React attaches `onmessage` to it, so the pair
  // outlives every root and pins the runner open after the last assertion.
  // Un-ref'ing them here changes nothing about the tests (messages are still
  // delivered while the runner is alive) and lets the process exit.
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const UID = "u1";
const PRODUCT = "p1";

/** Clean world + a fresh host element for each test. */
function freshWorld({ uid = UID } = {}) {
  fsx.reset();
  window.localStorage.clear();
  appStub.authState.uid = uid;
  const target = window.document.createElement("div");
  target.id = "host";
  window.document.body.replaceChildren(target);
  return target;
}

/** A fresh mount point that keeps localStorage and the cloud store as they are
 *  ("the learner opens the board again later"). */
function newHost() {
  const target = window.document.createElement("div");
  target.id = "host";
  window.document.body.replaceChildren(target);
  return target;
}

/** Seed a cloud document the way `toFirestoreNote` really writes it. */
function seedCloudNote(uid, productId, note) {
  const payload = fixture.toFirestoreNote(note, { uid, productId });
  fsx.store.set(`users/${uid}/notes/${payload.id}`, payload);
  return payload;
}

/** Let the listener's microtask + any debounce settle. */
async function settle(ms = 30) {
  await act(async () => {
    await sleep(ms);
  });
}

/* ── 1. the reported bug: does a note reach Firebase? ─────────────────────── */

test("a note saved on the board is written to Firestore and rendered", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle();
  assert.equal(text("status"), "ready", "the cloud listener never answered");

  let saved;
  act(() => {
    saved = fixture.latest.ctl.add("<p>Newton's third law</p>");
  });
  assert.ok(saved, "add() returned nothing for a non-empty note");
  // Painted on the board the moment it is typed — before the cloud answers.
  assert.equal(el(`note-${saved.id}`)?.getAttribute("data-text"), "Newton's third law");

  await settle(60);

  const docData = fsx.noteDoc(UID, saved.id);
  assert.ok(docData, "the note never reached users/{uid}/notes — this is the reported bug");
  assert.equal(docData.uid, UID);
  assert.equal(docData.productId, PRODUCT);
  assert.equal(docData.id, saved.id);
  assert.equal(docData.text, "Newton's third law");
  assert.match(docData.html, /Newton's third law/);
  assert.deepEqual(docData.links, []);
  assert.equal(typeof docData.createdAt, "number");
  assert.equal(docData.schemaVersion, 1);
  assert.equal(text("status"), "saved");
  assert.equal(text("synced"), "true");
  assert.equal(text("error"), "");

  // The device mirror carries the same note (offline / cold open).
  const mirror = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(UID, PRODUCT)));
  assert.equal(mirror.length, 1);
  assert.equal(mirror[0].id, saved.id);

  board.unmount();
});

/* ── 2. rendering + cross-device sync ─────────────────────────────────────── */

test("notes already in Firestore are rendered, and a write from another device appears live", async () => {
  const target = freshWorld();
  seedCloudNote(UID, PRODUCT, {
    id: "from-the-phone",
    text: "Written on the phone",
    html: "<p>Written on the phone</p>",
    createdAt: 1000,
  });

  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle();

  assert.equal(text("count"), "1", "a note already in Firebase was not rendered");
  assert.equal(el("note-from-the-phone")?.getAttribute("data-text"), "Written on the phone");

  // Another device writes a second note: the listener must pick it up with no
  // refresh and no remount.
  await act(async () => {
    seedCloudNote(UID, PRODUCT, {
      id: "from-the-laptop",
      text: "Written on the laptop",
      html: "<p>Written on the laptop</p>",
      createdAt: 2000,
    });
    fsx.notify();
    await sleep(0);
  });

  assert.equal(text("count"), "2", "the live listener did not deliver the other device's note");
  assert.ok(el("note-from-the-laptop"), "the new note is in Firestore but not on the board");

  board.unmount();
  assert.equal(fsx.listenerCount(), 0, "the listener was not released on unmount");
});

/* ── 3. delete ────────────────────────────────────────────────────────────── */

test("a delete reaches the cloud at once and a tombstone beats a stale cloud copy", async () => {
  const target = freshWorld();
  seedCloudNote(UID, PRODUCT, { id: "keep-me", text: "Keep", html: "<p>Keep</p>", createdAt: 1 });
  seedCloudNote(UID, PRODUCT, { id: "drop-me", text: "Drop", html: "<p>Drop</p>", createdAt: 2 });
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 60_000 });
  await settle();
  assert.equal(text("count"), "2");

  // debounceMs is a minute: if the delete waited for the debounce the note
  // would survive a refresh — the exact "delete kaam nahi karta" symptom.
  act(() => fixture.latest.ctl.remove("drop-me"));
  assert.equal(text("count"), "1");
  assert.equal(el("note-drop-me"), null);
  assert.equal(fsx.noteDoc(UID, "drop-me"), undefined, "the delete never reached Firestore");
  assert.ok(fsx.noteDoc(UID, "keep-me"), "the wrong document was deleted");
  await settle(10);
  // Firestore confirmed it, so the tombstone is pruned rather than left to grow.
  assert.deepEqual(JSON.parse(window.localStorage.getItem(fixture.notesDeletedKey(UID, PRODUCT)) || "[]"), []);
  board.unmount();

  // ── resurrection guard ───────────────────────────────────────────────────
  // A device that deleted a note while offline holds a tombstone; a later
  // cloud snapshot that still carries the document must NOT put it back.
  freshWorld();
  seedCloudNote(UID, PRODUCT, { id: "already-deleted", text: "Ghost", html: "<p>Ghost</p>", createdAt: 3 });
  window.localStorage.setItem(fixture.notesDeletedKey(UID, PRODUCT), JSON.stringify(["already-deleted"]));
  const second = fixture.mount(freshWorld({ uid: UID }), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(60);
  assert.equal(el("note-already-deleted"), null, "a tombstoned note was resurrected by the cloud copy");
  assert.equal(fsx.noteDoc(UID, "already-deleted"), undefined, "the tombstoned document was never cleaned up");
  second.unmount();
});

/* ── 4. offline / refused writes ──────────────────────────────────────────── */

test("an offline write is kept on the device and retried until it lands", async () => {
  const target = freshWorld();
  fsx.state.failWrites = { code: "unavailable", message: "Backend unavailable" };
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle();

  let saved;
  act(() => {
    saved = fixture.latest.ctl.add("<p>Offline note</p>");
  });
  await settle(60);

  assert.equal(text("status"), "error");
  assert.match(text("error"), /unavailable/i, "the learner is not told what actually failed");
  // Still on the board, still on the device — nothing was dropped.
  assert.equal(el(`note-${saved.id}`)?.getAttribute("data-text"), "Offline note");
  const mirror = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(UID, PRODUCT)));
  assert.equal(mirror.length, 1);
  assert.equal(fsx.noteDoc(UID, saved.id), undefined);

  // The connection comes back: the queued retry lands it without any user action.
  fsx.state.failWrites = null;
  await settle(1800);
  assert.ok(fsx.noteDoc(UID, saved.id), "the queued note never reached Firestore after the retry");
  assert.equal(text("status"), "saved");
  assert.equal(text("error"), "");
  board.unmount();
});

test("a refused listener still paints the device copy and names the refusal", async () => {
  const target = freshWorld();
  // A note from a previous session (or from a build with no cloud store).
  fixture.persistLocalNotes(UID, PRODUCT, [
    { id: "legacy-1", text: "Saved before the rules were fixed", html: "<p>Saved before the rules were fixed</p>", createdAt: 5, links: [] },
  ]);
  fsx.state.failReads = { code: "permission-denied", message: "Missing or insufficient permissions" };

  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(40);

  assert.equal(text("status"), "error");
  assert.match(text("error"), /permission-denied/, "the refusal is not named, so it reads as 'notes save nahi ho rahe'");
  assert.equal(el("note-legacy-1")?.getAttribute("data-text"), "Saved before the rules were fixed",
    "a refused listener stranded the board instead of painting the device copy");

  // The rules get deployed: one retry recovers, and the device-only note is
  // pushed up — this is what migrates every note that predates the cloud store.
  fsx.state.failReads = null;
  act(() => fixture.latest.ctl.reload());
  await settle(120);

  // "ready" once the listener answers, "saved" once the migrated note has
  // actually landed — either way the refusal is gone and the board is live.
  assert.ok(["ready", "saved"].includes(text("status")), `unexpected status: ${text("status")}`);
  assert.equal(text("error"), "");
  assert.ok(fsx.noteDoc(UID, "legacy-1"), "the device-only note was never migrated to Firestore");
  assert.equal(fsx.noteDoc(UID, "legacy-1").productId, PRODUCT);
  board.unmount();
});

/* ── 5. leaving the board ─────────────────────────────────────────────────── */

test("leaving the board flushes whatever is still pending", async () => {
  const target = freshWorld();
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 600_000 });
  await settle();

  let saved;
  act(() => {
    saved = fixture.latest.ctl.add("<p>Written a second before closing</p>");
  });
  assert.equal(fsx.noteDoc(UID, saved.id), undefined, "the debounce was skipped");

  board.unmount();
  await act(async () => {
    await sleep(40);
  });
  assert.ok(fsx.noteDoc(UID, saved.id), "a note was lost when the learner left the board");
  assert.equal(fsx.noteDoc(UID, saved.id).text, "Written a second before closing");
});

test("a torn-down board stops retrying, and the next mount finishes the job", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle();
  fsx.state.failWrites = { code: "unavailable", message: "Backend unavailable" };

  let saved;
  act(() => {
    saved = fixture.latest.ctl.add("<p>Left mid-failure</p>");
  });
  await settle(60);
  assert.equal(text("status"), "error");
  assert.equal(fsx.noteDoc(UID, saved.id), undefined);

  board.unmount();

  // The learner is gone: nothing may keep waking itself up (a retry loop on a
  // dead controller is what pinned the test runner open for half a minute),
  // and the pending note must still be on the device.
  await act(async () => {
    await sleep(2500);
  });
  assert.equal(fsx.noteDoc(UID, saved.id), undefined, "a torn-down controller kept retrying");
  const mirror = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(UID, PRODUCT)));
  assert.equal(mirror.length, 1, "the note that never reached the cloud was dropped instead of mirrored");

  // Opening the board again with a working network finishes the save.
  fsx.state.failWrites = null;
  const again = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(120);
  assert.ok(fsx.noteDoc(UID, saved.id), "the next mount did not push the mirrored note up");
  assert.equal(el(`note-${saved.id}`)?.getAttribute("data-text"), "Left mid-failure");
  again.unmount();
});

/* ── 6. scope + ownership ─────────────────────────────────────────────────── */

test("notes never mix between courses, and an empty scope never writes", async () => {
  const target = freshWorld();
  const board = fixture.mount(target, { uid: UID, productId: "course-a", debounceMs: 5 });
  await settle();
  let noteA;
  act(() => { noteA = fixture.latest.ctl.add("<p>Course A note</p>"); });
  await settle(40);
  board.render({ uid: UID, productId: "course-b", debounceMs: 5 });
  await settle(40);
  assert.equal(text("count"), "0", "course B inherited course A's notes");
  let noteB;
  act(() => { noteB = fixture.latest.ctl.add("<p>Course B note</p>"); });
  await settle(40);
  assert.equal(fsx.noteDoc(UID, noteA.id).productId, "course-a");
  assert.equal(fsx.noteDoc(UID, noteB.id).productId, "course-b");
  board.render({ uid: UID, productId: "course-a", debounceMs: 5 });
  await settle(40);
  assert.equal(text("count"), "1");
  assert.equal(el(`note-${noteA.id}`) ? "a" : "missing", "a");
  assert.equal(el(`note-${noteB.id}`), null, "course A now shows course B's note");

  // An empty product id is NOT a scope: it would pool every unpicked course's
  // notes into one document set.
  board.render({ uid: UID, productId: "", debounceMs: 5 });
  await settle(20);
  assert.equal(text("status"), "idle");
  assert.equal(text("count"), "0");
  act(() => fixture.latest.ctl.add("<p>Nowhere note</p>"));
  await settle(20);
  const notePaths = fsx.paths().filter((key) => key.includes("/notes/"));
  assert.equal(notePaths.length, 2, "an unscoped note was written somewhere");
  assert.ok(fsx.noteDoc(UID, noteA.id) && fsx.noteDoc(UID, noteB.id));
  board.unmount();
});

test("a uid this session cannot verify never writes into another learner's namespace", async () => {
  const target = freshWorld({ uid: UID });
  // The signed-in token says u1, but something hands the hook u2.
  const board = fixture.mount(target, { uid: "u2", productId: PRODUCT, debounceMs: 5 });
  await settle(40);
  act(() => fixture.latest.ctl.add("<p>Somebody else's note</p>"));
  await settle(60);
  assert.deepEqual(fsx.paths(), [], "a write escaped the signed-in learner's namespace");
  assert.equal(text("status"), "error");
  assert.match(text("error"), /sign-in|session/i);
  board.unmount();
});

/* ── 7. stability for the 3D boards ───────────────────────────────────────── */

test("the controller identity is stable, so the 3D board does not rebuild its panel", async () => {
  const target = freshWorld();
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle();
  const before = fixture.latest.ctl;
  await settle();
  const after = fixture.latest.ctl;
  for (const key of ["add", "edit", "remove", "link", "commit", "flush", "reload"]) {
    assert.equal(before[key], after[key], `${key}() is a new function on every render — the 3D panel would rebuild`);
  }
  act(() => fixture.latest.ctl.add("<p>Stable</p>"));
  await settle(40);
  const third = fixture.latest.ctl;
  assert.equal(before.add, third.add);
  assert.equal(before.remove, third.remove);
  board.unmount();
});

/* ── 8. the unmount draft rescue ──────────────────────────────────────────── */

test("a draft rescued while no hook is mounted still reaches Firestore", async () => {
  freshWorld();
  const note = { id: "rescued-1", text: "Left in the editor", html: "<p>Left in the editor</p>", createdAt: Date.now(), links: [] };

  const appended = fixture.appendCloudNote(UID, PRODUCT, note);
  assert.equal(appended?.id, "rescued-1");
  const mirror = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(UID, PRODUCT)));
  assert.equal(mirror[0].id, "rescued-1", "the mirror was not written synchronously");
  await act(async () => {
    await sleep(30);
  });
  assert.ok(fsx.noteDoc(UID, "rescued-1"), "the rescued draft never reached Firestore");

  fixture.patchCloudNote(UID, PRODUCT, "rescued-1", "<p>Left in the editor, edited</p>");
  await act(async () => {
    await sleep(30);
  });
  const patched = fsx.noteDoc(UID, "rescued-1");
  assert.match(patched.html, /edited/);
  assert.equal(patched.text, "Left in the editor, edited");
  assert.ok(patched.updatedAt >= patched.createdAt);

  // A refused cloud write must not lose the draft: the mirror keeps it.
  fsx.state.failWrites = { code: "permission-denied", message: "Missing or insufficient permissions" };
  fixture.appendCloudNote(UID, PRODUCT, { id: "rescued-2", text: "Offline draft", html: "<p>Offline draft</p>", createdAt: Date.now(), links: [] });
  await act(async () => {
    await sleep(30);
  });
  assert.equal(fsx.noteDoc(UID, "rescued-2"), undefined);
  const kept = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(UID, PRODUCT)));
  assert.ok(kept.some((row) => row.id === "rescued-2"), "an offline draft was dropped instead of mirrored");

  // And the next mount pushes it up.
  fsx.state.failWrites = null;
  // A NEW host, but the same device: the mirror and the cloud store stay as
  // they are, because this is the "next time the learner opens the board" case.
  const board = fixture.mount(newHost(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(120);
  assert.ok(fsx.noteDoc(UID, "rescued-2"), "the mirrored draft was never migrated on the next mount");
  assert.ok(el("note-rescued-2"), "the migrated draft is not rendered");
  board.unmount();
});

/* ── 9. edit + link symmetry ──────────────────────────────────────────────── */

test("an edit and a wire both write every document they changed", async () => {
  const target = freshWorld();
  seedCloudNote(UID, PRODUCT, { id: "n1", text: "One", html: "<p>One</p>", createdAt: 1 });
  seedCloudNote(UID, PRODUCT, { id: "n2", text: "Two", html: "<p>Two</p>", createdAt: 2 });
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(40);

  act(() => fixture.latest.ctl.edit("n1", "<p>One, edited</p>"));
  await settle(40);
  assert.equal(fsx.noteDoc(UID, "n1").html, "<p>One, edited</p>");
  assert.equal(fsx.noteDoc(UID, "n1").text, "One, edited");
  assert.equal(el("note-n1")?.getAttribute("data-text"), "One, edited");

  // Wires are symmetric: linking n1 → n2 writes BOTH documents.
  act(() => fixture.latest.ctl.link("n1", ["n2"]));
  await settle(40);
  assert.deepEqual(fsx.noteDoc(UID, "n1").links, ["n2"]);
  assert.deepEqual(fsx.noteDoc(UID, "n2").links, ["n1"], "the far end of the wire was never written to the cloud");
  board.unmount();
});

// ── Additional 2026-09-30 regressions: save queues must not follow the camera
// or whichever course/account happens to be rendered when an async job ends.

test("a course switch inside debounce flushes the OUTGOING scope and clears the new board", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 60_000 });
  await settle();
  let note;
  act(() => { note = fixture.latest.ctl.add("<p>Only in the first course</p>"); });
  board.render({ uid: UID, productId: "p2", debounceMs: 60_000 });
  await settle(40);
  assert.equal(fsx.noteDoc(UID, note.id).productId, PRODUCT, "pending note was redirected to the new course");
  assert.equal(text("count"), "0", "old course notes remained on the new board");
  assert.deepEqual(fsx.noteIds(UID, "p2"), []);
  board.unmount();
});

test("old in-flight acknowledgements/failures cannot change a new scope's notes or status", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); fsx.state.writeDelayMs = 80;
  let note; act(() => { note = fixture.latest.ctl.add("<p>Outgoing write</p>"); });
  await settle(15);
  board.render({ uid: UID, productId: "p2", debounceMs: 5 });
  await settle(120);
  assert.equal(fsx.noteDoc(UID, note.id).productId, PRODUCT);
  assert.equal(text("count"), "0");
  assert.equal(text("status"), "ready", "old save falsely acknowledged the new board");
  board.unmount();
});

test("edits during an upload are serialised, and the latest revision is the one left in Firestore", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); fsx.state.writeDelayMs = 70;
  let note; act(() => { note = fixture.latest.ctl.add("<p>First version</p>"); });
  await settle(15);
  act(() => fixture.latest.ctl.edit(note.id, "<p>Latest version</p>"));
  await settle(200);
  assert.equal(fsx.state.maxActiveWrites, 1, "writes overlapped and can commit in the wrong order");
  assert.equal(fsx.noteDoc(UID, note.id).text, "Latest version");
  assert.equal(el(`note-${note.id}`)?.getAttribute("data-text"), "Latest version");
  assert.equal(text("status"), "saved"); board.unmount();
});

test("deleting during an upload waits for it and cannot resurrect the note", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); fsx.state.writeDelayMs = 65;
  let note; act(() => { note = fixture.latest.ctl.add("<p>Remove during upload</p>"); });
  await settle(15);
  act(() => fixture.latest.ctl.remove(note.id));
  assert.equal(text("count"), "0"); await settle(180);
  assert.equal(fsx.noteDoc(UID, note.id), undefined);
  assert.deepEqual(fsx.commits.filter(op => op.path.endsWith(`/${note.id}`)).map(op => op.kind), ["set", "delete"]);
  assert.equal(text("count"), "0"); board.unmount();
});

test("unmount while a commit is running still flushes the later pending edit", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); fsx.state.writeDelayMs = 60;
  let note; act(() => { note = fixture.latest.ctl.add("<p>Before exit</p>"); });
  await settle(15);
  act(() => fixture.latest.ctl.edit(note.id, "<p>Last edit before exit</p>"));
  board.unmount(); await settle(170);
  assert.equal(fsx.noteDoc(UID, note.id).text, "Last edit before exit");
});

test("auth hydration is retried instead of installing a permanent empty/no-op listener", async () => {
  const target = freshWorld({ uid: null });
  seedCloudNote(UID, PRODUCT, { id: "existing", text: "Restored from Firebase", html: "<p>Restored from Firebase</p>", createdAt: 1 });
  const board = fixture.mount(target, { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); assert.equal(text("status"), "error"); assert.match(text("error"), /login/i);
  appStub.authState.uid = UID;
  act(() => window.dispatchEvent(new window.Event("online")));
  await settle(60);
  assert.equal(el("note-existing")?.getAttribute("data-text"), "Restored from Firebase");
  assert.equal(fsx.listenerCount(), 1); board.unmount();
});

test("the personal sanctuary bucket saves without a purchase or selected course", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: "__sanctuary__", debounceMs: 5 });
  await settle(); let note;
  act(() => { note = fixture.latest.ctl.add("<p>Personal sanctuary note</p>"); });
  await settle(40);
  assert.equal(fsx.noteDoc(UID, note.id).productId, "__sanctuary__");
  assert.equal(text("status"), "saved"); board.unmount();
});

// Real BoardPortals integration: these verify scope wiring, not just an
// isolated hook given an already-correct productId by a test.
test("the actual sanctuary portals save/render personal boards before any course is picked", async () => {
  const target = freshWorld();
  const props = { uid: UID, courses: [{ id: PRODUCT, title: "A course" }], myCourses: [], loading: false };
  const boards = fixture.mountBoards(target, props);
  await settle(40);
  assert.equal(window.__sanctuaryReading.courseId, null, "a catalogue course was auto-selected");
  act(() => window.__sanctuaryNotes.onAdd("<p>Written without picking a course</p>"));
  act(() => window.__sanctuaryMap.onMindChange(current => fixture.addChildNode(current, "root", "Personal diagram").mind));
  act(() => window.__sanctuaryMap.onFlush());
  await settle(50);
  assert.ok(fsx.noteIds(UID, "__sanctuary__").length === 1);
  const map = fsx.store.get(`users/${UID}/mindMaps/${UID}____sanctuary____course`);
  assert.equal(map.nodes[0].topic, "Personal diagram");
  assert.match(document.querySelector("[data-board-notes]").textContent, /Written without/);
  assert.match(document.querySelector("[data-board-map]").textContent, /Personal diagram/);
  assert.match(document.querySelector('[data-test-slot="notes"] header').textContent, /Firebase par save ho gaya/);

  act(() => window.__sanctuaryReading.onSelectCourse(PRODUCT));
  await settle(50);
  assert.equal(window.__sanctuaryNotes.notes.length, 0, "personal notes leaked into a course");
  assert.equal(window.__sanctuaryMap.mind.nodes.length, 0);
  act(() => window.__sanctuaryNotes.onAdd("<p>Course note</p>"));
  await settle(40);
  assert.equal(fsx.noteIds(UID, PRODUCT).length, 1);
  act(() => window.__sanctuaryReading.onSelectCourse(null));
  await settle(50);
  assert.match(document.querySelector("[data-board-notes]").textContent, /Written without/);
  assert.match(document.querySelector("[data-board-map]").textContent, /Personal diagram/);
  boards.unmount();
});

test("signed-out sanctuary portals show a sign-in message, never an editor that silently discards saves", async () => {
  const boards = fixture.mountBoards(freshWorld({ uid: null }), { uid: null, courses: [], myCourses: [], loading: false });
  await settle(40);
  assert.match(document.querySelector('[data-test-slot="notes"]').textContent, /Sign in to create and save/);
  assert.match(document.querySelector('[data-test-slot="mindmap"]').textContent, /Sign in to create and save/);
  assert.equal(document.querySelector("[data-board-notes]"), null);
  assert.equal(document.querySelector("[data-board-map]"), null);
  assert.equal(fsx.commits.length, 0); boards.unmount();
});

test("sanctuary editor drafts are isolated from the player's and other course/account sessions", () => {
  fixture.setNotesSessionView({ view: "compose", draft: "Course A draft", title: "A" }, "sanctuary.notes.u1.p1");
  assert.equal(fixture.getCoursePanelSession("sanctuary.notes.u1.p1").notes.draft, "Course A draft");
  assert.equal(fixture.getCoursePanelSession("sanctuary.notes.u1.p2").notes.view, "list");
  assert.equal(fixture.getCoursePanelSession("sanctuary.notes.u2.p1").notes.view, "list");
  assert.equal(fixture.getCoursePanelSession().notes.view, "list");
});


test("rich formatting and plain-text projection round-trip together, including a deliberately empty edit", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 5 });
  await settle(); const html = '<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em> 😀</p>'; let note;
  act(() => { note = fixture.latest.ctl.add(html); }); await settle(40);
  assert.equal(fsx.noteDoc(UID, note.id).html, html);
  assert.equal(fsx.noteDoc(UID, note.id).text, "Heading Bold and italic 😀");
  assert.equal(el(`note-${note.id}`)?.getAttribute("data-html"), html);
  act(() => fixture.latest.ctl.edit(note.id, "<p></p>")); await settle(40);
  assert.equal(fsx.noteDoc(UID, note.id).text, "", "erasing a note restored its old text");
  assert.equal(fsx.noteDoc(UID, note.id).html, "<p></p>"); board.unmount();
});


test("an outgoing editor's callbacks stay bound to its original notes bucket after a course switch", async () => {
  const board = fixture.mount(freshWorld(), { uid: UID, productId: PRODUCT, debounceMs: 60_000 }); await settle();
  const outgoing = fixture.latest.ctl;
  board.render({ uid: UID, productId: "p2", debounceMs: 60_000 }); await settle();
  let note; act(() => { note = outgoing.add("<p>Late outgoing draft</p>"); outgoing.flush(); }); await settle(40);
  assert.equal(fsx.noteDoc(UID, note.id).productId, PRODUCT);
  assert.equal(text("count"), "0"); assert.deepEqual(fsx.noteIds(UID, "p2"), []); board.unmount();
});


test("the real board scope change preserves a node editor's passive teardown save in its personal map", async () => {
  const props = { uid: UID, courses: [{ id: PRODUCT, title: "Chosen course" }], myCourses: [], loading: false };
  const boards = fixture.mountBoards(freshWorld(), props); await settle(40);
  act(() => window.__sanctuaryMap.onMindChange(current => fixture.addChildNode(current, "root", "Keep this branch").mind));
  window.__sanctuaryNodeCleanupDraft = "Last personal topic before switching";
  act(() => window.__sanctuaryReading.onSelectCourse(PRODUCT)); await settle(60);
  const saved = fsx.store.get(`users/${UID}/mindMaps/${UID}____sanctuary____course`);
  assert.equal(saved.rootTopic, "Last personal topic before switching");
  assert.equal(saved.nodes[0].topic, "Keep this branch");
  assert.equal(window.__sanctuaryMap.mind.rootTopic, "Chosen course");
  assert.equal(fsx.store.get(`users/${UID}/mindMaps/${UID}__${PRODUCT}__course`), undefined);
  boards.unmount();
});
