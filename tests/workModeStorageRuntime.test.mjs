// Runtime proof that Work feature hooks use only their device stores.
// Firebase references are mocked and instrumented; the real React hooks,
// localStorage mirrors, Work Sketch Dexie database, and library adapter run.
import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "fake-indexeddb/auto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/work-mode-storage-runtime");
fs.mkdirSync(DIR, { recursive: true });
const FIRESTORE = path.join(DIR, "firestore.mjs");
const APP = path.join(DIR, "app.mjs");

fs.writeFileSync(FIRESTORE, `
export const records = new Map();
export const calls = { getDoc: 0, getDocs: 0, onSnapshot: 0, setDoc: 0, deleteDoc: 0, writeBatch: 0, batchCommit: 0 };
const ref = (kind, ...parts) => ({ kind, path: parts.join("/") });
export const doc = (_db, ...parts) => ref("doc", ...parts);
export const collection = (_db, ...parts) => ref("collection", ...parts);
export const where = (field, op, value) => ({ field, op, value });
export const orderBy = (field, direction) => ({ field, direction });
export const query = (target, ...filters) => ({ ...target, filters });
export const serverTimestamp = () => 1;
export async function getDoc(target) {
  calls.getDoc += 1;
  const value = records.get(target.path);
  return { exists: () => value != null, data: () => value };
}
export async function getDocs(target) {
  calls.getDocs += 1;
  const prefix = target.path + "/";
  const docs = [...records.entries()]
    .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
    .map(([key, value]) => ({ id: key.split("/").pop(), data: () => value }));
  return { docs, forEach: (visit) => docs.forEach(visit), empty: docs.length === 0, size: docs.length };
}
export function onSnapshot(_target, onData) {
  calls.onSnapshot += 1;
  queueMicrotask(() => onData?.({ docs: [], empty: true, size: 0 }));
  return () => undefined;
}
export async function setDoc(target, value) { calls.setDoc += 1; records.set(target.path, value); }
export async function deleteDoc(target) { calls.deleteDoc += 1; records.delete(target.path); }
export function writeBatch() {
  calls.writeBatch += 1;
  const pending = [];
  return {
    set(target, value) { pending.push(["set", target.path, value]); },
    delete(target) { pending.push(["delete", target.path]); },
    async commit() {
      calls.batchCommit += 1;
      for (const [kind, key, value] of pending) {
        if (kind === "set") records.set(key, value);
        else records.delete(key);
      }
    },
  };
}
export function reset() {
  records.clear();
  for (const key of Object.keys(calls)) calls[key] = 0;
}
`);
fs.writeFileSync(APP, `
export const authState = { uid: "work-device" };
export const auth = { get currentUser() { return authState.uid ? { uid: authState.uid } : null; } };
export const db = {};
`);

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const key of [
  "window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node",
  "Event", "CustomEvent", "MouseEvent", "FocusEvent", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "tsx",
    contents: `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import useCourseNotes from "./src/course/useCourseNotes";
import useCourseMindMap from "./src/course/useCourseMindMap";
import useWorkSketch from "./src/work/storage/useWorkSketch";
import {
  closeWorkSketchDb,
  workSketchDb,
  workSketchLibraryKey,
  workSketchLibraryStore,
  workSketchSceneKey,
} from "./src/work/storage/workSketchDb";
import useSketchLibrary from "./src/course/useSketchLibrary";
import { usePerfectFreehandSketch } from "./src/course/usePerfectFreehandSketch";
import useLumenChats from "./src/lumen/useLumenChats";
import { WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID } from "./src/work/workIdentity";
import { notesStorageKey } from "./src/course/notesStore";
import { quickSketchLocalKey } from "./src/utils/quickSketch";
import { addChildNode } from "./utils/mindMapTree";

export { act, addChildNode, notesStorageKey, quickSketchLocalKey, WORK_DEVICE_UID, WORK_MODULE_ID, WORK_PRODUCT_ID };
export { workSketchDb, workSketchLibraryKey, workSketchSceneKey };
export const latest: { notes: any; maps: any; sketch: any; quick: any; chats: any; library: any } = {
  notes: null, maps: null, sketch: null, quick: null, chats: null, library: null,
};

function Probe() {
  const notes = useCourseNotes({ uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, storageOnly: true, debounceMs: 5 });
  const maps = useCourseMindMap({
    uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, moduleId: WORK_MODULE_ID,
    rootTopic: "My ideas", storageOnly: true, debounceMs: 5,
  });
  const sketch = useWorkSketch();
  const quick = usePerfectFreehandSketch({
    uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID, moduleId: WORK_MODULE_ID,
    localOnly: true, debounceMs: 5,
  });
  const chats = useLumenChats({
    uid: WORK_DEVICE_UID, productId: WORK_PRODUCT_ID + "-ai", courseTitle: "Work", courseShort: "Work",
    storageOnly: true, debounceMs: 5,
  });
  const library = useSketchLibrary({ uid: WORK_DEVICE_UID, storageOnly: true, deviceStore: workSketchLibraryStore });
  latest.notes = notes;
  latest.maps = maps;
  latest.sketch = sketch;
  latest.quick = quick;
  latest.chats = chats;
  latest.library = library;
  return <div data-work-storage-runtime="" />;
}

export function mount(target: HTMLElement) {
  const root = createRoot(target);
  act(() => root.render(<Probe />));
  return { unmount: () => act(() => root.unmount()) };
}

export async function resetWorkDatabase() {
  const database = workSketchDb();
  await closeWorkSketchDb();
  await database.delete();
}
`,
  },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
  plugins: [{
    name: "firebase-boundary",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE, external: true }));
      buildApi.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP, external: true }));
    },
  }],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")));
const cloud = await import(pathToFileURL(FIRESTORE));
const app = await import(pathToFileURL(APP));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (ms = 35) => fixture.act(async () => { await sleep(ms); });
const workScope = {
  uid: fixture.WORK_DEVICE_UID,
  productId: fixture.WORK_PRODUCT_ID,
  moduleId: fixture.WORK_MODULE_ID,
};
const mindMapKey = `dc.mindMap.v1.${workScope.uid}.${workScope.productId}.${workScope.moduleId}.main`;
const chatStorageKey = `eduvora.lumenChats.v1:${workScope.uid}:${workScope.productId}-ai`;
const mounted = new Set();

const mount = () => {
  const host = window.document.createElement("div");
  window.document.body.replaceChildren(host);
  const root = fixture.mount(host);
  mounted.add(root);
  return root;
};
const unmount = async (root) => {
  root.unmount();
  mounted.delete(root);
  await settle(30);
};
const assertNoCloudIO = () => {
  assert.deepEqual(cloud.calls, {
    getDoc: 0, getDocs: 0, onSnapshot: 0, setDoc: 0, deleteDoc: 0, writeBatch: 0, batchCommit: 0,
  }, "Work feature hooks must never read from or write to Firestore");
};
const resetWorld = async () => {
  cloud.reset();
  window.localStorage.clear();
  app.authState.uid = fixture.WORK_DEVICE_UID;
  await fixture.resetWorkDatabase();
};

afterEach(async () => {
  for (const root of [...mounted]) await unmount(root);
  await resetWorld();
});
after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() || []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("Work Notes, Mind Map, both Sketch stores, and AI history stay local and reopen on-device", async () => {
  await resetWorld();

  // Remote content is intentionally present: Work must not read or show it.
  cloud.records.set("users/work-device/notes/cloud-note", {
    id: "cloud-note", uid: "work-device", productId: "workbench", text: "Cloud note must stay hidden", html: "<p>Cloud note must stay hidden</p>", createdAt: 1,
  });
  cloud.records.set("users/work-device/mindMaps/cloud-map", {
    uid: "work-device", productId: "workbench", moduleId: "personal-workspace", mapKey: "main",
    title: "Cloud map", rootTopic: "Cloud map", nodes: [], updatedAt: 1,
  });
  cloud.records.set("users/work-device/quickSketches/cloud-board", {
    uid: "work-device", productId: "workbench", moduleId: "personal-workspace", sketchKey: "main", strokes: [], updatedAt: 1,
  });
  cloud.records.set("users/work-device/aiChats/cloud-chat", {
    id: "cloud-chat", productId: "workbench-ai", title: "Cloud chat", messages: [{ role: "user", content: "Must stay hidden" }],
  });
  cloud.records.set("users/work-device/sketchLibraries/main", {
    items: [{ id: "cloud-library-item" }], updatedAt: 1,
  });

  const first = mount();
  await settle(120);
  assertNoCloudIO();
  assert.equal(fixture.latest.notes.notes.length, 0, "Work Notes must not import the cloud copy");
  assert.doesNotMatch(JSON.stringify(fixture.latest.maps.maps), /Cloud map/);
  assert.equal(fixture.latest.quick.strokes.length, 0, "Quick Sketch must not read a cloud board");
  assert.equal(fixture.latest.chats.chats.some((chat) => chat.title === "Cloud chat"), false);
  assert.equal(fixture.latest.library.itemCount, 0, "the Work personal library must not read the cloud copy");
  assert.equal(fixture.latest.sketch.loading, false, "Work Sketch must finish its device database read");

  let note;
  fixture.act(() => {
    note = fixture.latest.notes.add("<p>My private Work note</p>");
    fixture.latest.maps.setMind((mind) => fixture.addChildNode(mind, "root", "My local idea").mind);
    fixture.latest.sketch.onCanvasColorChange("#314159");
    fixture.latest.quick.updateStrokes([{
      id: "work-stroke",
      points: [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4, pressure: 0.7 }],
    }]);
    fixture.latest.quick.flush();
    fixture.latest.chats.setChats((chats) => chats.map((chat) => ({
      ...chat,
      title: "My private Work chat",
      messages: [{ id: "work-message", role: "user", content: "Keep this on my device", createdAt: 10, status: "complete" }],
    })));
    fixture.latest.chats.flush();
  });
  assert.ok(note?.id, "the Work note should be created locally");

  await fixture.act(async () => {
    await fixture.latest.library.adapter.save({ libraryItems: [{ id: "work-library-item", status: "published", elements: [] }] });
    fixture.latest.sketch.flush();
    await sleep(850); // the personal-library adapter coalesces its device write
  });
  await settle(100);
  assertNoCloudIO();

  const notes = JSON.parse(window.localStorage.getItem(fixture.notesStorageKey(workScope.uid, workScope.productId)) || "[]");
  assert.equal(notes[0]?.text, "My private Work note");
  const mindMap = JSON.parse(window.localStorage.getItem(mindMapKey) || "{}");
  assert.match(JSON.stringify(mindMap), /My local idea/);
  const quickKey = fixture.quickSketchLocalKey(workScope.uid, workScope.productId, workScope.moduleId, "main");
  assert.equal(JSON.parse(window.localStorage.getItem(quickKey) || "{}").strokes?.[0]?.id, "work-stroke");
  assert.match(window.localStorage.getItem(chatStorageKey) || "", /Keep this on my device/);

  const db = fixture.workSketchDb();
  const scene = await db.scenes.get(fixture.workSketchSceneKey("work-device:workbench:personal-workspace", "main"));
  assert.ok(scene, "Work Sketch scene must be in IndexedDB");
  assert.equal(scene.scene.appState.viewBackgroundColor, "#314159");
  const library = await db.libraries.get(fixture.workSketchLibraryKey(workScope.uid));
  assert.equal(library?.items?.[0]?.id, "work-library-item", "Work's personal library must be in IndexedDB");

  await unmount(first);
  const reopened = mount();
  await settle(160);
  assertNoCloudIO();
  assert.match(JSON.stringify(fixture.latest.notes.notes), /My private Work note/);
  assert.match(JSON.stringify(fixture.latest.maps.mind), /My local idea/);
  assert.equal(fixture.latest.quick.strokes[0]?.id, "work-stroke");
  assert.match(JSON.stringify(fixture.latest.chats.chats), /Keep this on my device/);
  assert.equal(fixture.latest.library.itemCount, 1);
  assert.equal(fixture.latest.sketch.loading, false);
  assert.equal(fixture.latest.sketch.canvasColor, "#314159");
  await unmount(reopened);
});
