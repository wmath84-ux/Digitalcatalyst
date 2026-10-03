// Real React 19 hook + real payload/model/mirror; only Firebase I/O is replaced.
// Regression cases deliberately exercise batching, slow reads, in-flight
// writes, scope changes and unmounts that the previous source contracts missed.
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/mind-map-sync-runtime");
fs.mkdirSync(DIR, { recursive: true });
const FIRESTORE = path.join(DIR, "firestore.mjs");
const APP = path.join(DIR, "app.mjs");
fs.writeFileSync(APP, `
export const authState = { uid: "u1" };
export const auth = { get currentUser() { return authState.uid ? { uid: authState.uid } : null; } };
export const db = {};
`);
fs.writeFileSync(FIRESTORE, `
export const store = new Map();
export const submitted = [];
export const committed = [];
export const state = { readDelay: 0, writeDelay: 0, failReads: null, failWrites: null };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clone = (x) => x == null ? x : JSON.parse(JSON.stringify(x));
const fail = (code) => Object.assign(new Error(code), { code });
export const doc = (_db, ...parts) => ({ path: parts.join("/") });
export const collection = doc;
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
export async function getDoc(ref) {
  const data = clone(store.get(ref.path));
  const error = state.failReads;
  if (state.readDelay) await sleep(state.readDelay);
  if (error) throw fail(error);
  return { exists: () => data != null, data: () => data };
}
export async function getDocs(ref) {
  const prefix = ref.path + "/";
  const docs = Array.from(store.entries()).filter(([key, data]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/") &&
    (ref.filters || []).every(f => data[f.field] === f.value)).map(([key, value]) => ({ id: key.split("/").pop(), data: () => clone(value) }));
  const error = state.failReads;
  if (state.readDelay) await sleep(state.readDelay);
  if (error) throw fail(error);
  return { docs };
}
export async function setDoc(ref, data) {
  submitted.push({ kind: "set", path: ref.path, data: clone(data) });
  const error = state.failWrites;
  if (state.writeDelay) await sleep(state.writeDelay);
  if (error) throw fail(error);
  store.set(ref.path, clone(data));
  committed.push({ kind: "set", path: ref.path, data: clone(data) });
}
export async function deleteDoc(ref) {
  submitted.push({ kind: "delete", path: ref.path });
  const error = state.failWrites;
  if (state.writeDelay) await sleep(state.writeDelay);
  if (error) throw fail(error);
  store.delete(ref.path);
  committed.push({ kind: "delete", path: ref.path });
}
export function reset() { store.clear(); submitted.length = 0; committed.length = 0; Object.assign(state, { readDelay: 0, writeDelay: 0, failReads: null, failWrites: null }); }
`);

const dom = new JSDOM("<!doctype html><body><div id='host'></div></body>", { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
for (const key of ["window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
await build({
  stdin: { resolveDir: ROOT, loader: "tsx", contents: `
import * as React from "react";
import { createRoot } from "react-dom/client";
import useCourseMindMap from "./src/course/useCourseMindMap";
import { addChildNode, createMindMap, mindMapDocId, setMindMapTitle, toFirestoreMindMap } from "./utils/mindMapTree";
export { act } from "react";
export { addChildNode, createMindMap, mindMapDocId, setMindMapTitle, toFirestoreMindMap };
export const latest: { ctl: any } = { ctl: null };
function Probe(props: any) {
  const ctl = useCourseMindMap(props);
  latest.ctl = ctl;
  return <div><span id="status">{ctl.status}</span><span id="error">{ctl.errorMessage}</span>
    <span id="topic">{ctl.mind.rootTopic}</span><span id="active">{ctl.activeMapKey}</span>
    <ul id="nodes">{ctl.mind.nodes.map(n => <li key={n.id}>{n.topic}</li>)}</ul>
    <ul id="maps">{ctl.maps.map(m => <li key={m.mapKey} data-key={m.mapKey}>{m.title}</li>)}</ul>
  </div>;
}
export function mount(host: HTMLElement, props: any, strict = true) {
  const root = createRoot(host);
  const render = (p: any) => root.render(strict ? <React.StrictMode><Probe {...p}/></React.StrictMode> : <Probe {...p}/>);
  return { render, unmount: () => root.unmount(), start: () => render(props) };
}
` },
  outfile: path.join(DIR, "fixture.mjs"), bundle: true, platform: "node", format: "esm", jsx: "automatic", logLevel: "silent",
  plugins: [{ name: "firebase-boundaries", setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE, external: true }));
    b.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP, external: true }));
  } }],
});
const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")));
const cloud = await import(pathToFileURL(FIRESTORE));
const app = await import(pathToFileURL(APP));
const { act } = fixture;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const settle = async (ms = 25) => act(async () => { await sleep(ms); });
const text = (id) => document.getElementById(id)?.textContent || "";
const ctl = () => fixture.latest.ctl;
const input = (extra = {}) => ({ uid: "u1", productId: "p1", moduleId: "course", rootTopic: "Study", debounceMs: 5, ...extra });
const mapPath = (scope = input(), key = "main") => `users/${scope.uid}/mindMaps/${fixture.mindMapDocId(scope.uid, scope.productId, scope.moduleId, key)}`;
const localKey = (scope = input(), key = "main") => `dc.mindMap.v1.${scope.uid}.${scope.productId}.${scope.moduleId}.${key}`;
const outboxKey = (scope = input()) => `dc.mindMapOutbox.v1.${scope.uid}.${scope.productId}.${scope.moduleId}`;
const branch = (label) => act(() => ctl().setMind(mind => fixture.addChildNode(mind, "root", label).mind));
const mounted = new Set();
const mount = (props = input(), strict = true) => {
  const host = document.createElement("div"); document.body.replaceChildren(host);
  const board = fixture.mount(host, props, strict);
  act(() => board.start()); mounted.add(board); return board;
};
const unmount = (board) => { act(() => board.unmount()); mounted.delete(board); };
const fresh = () => { cloud.reset(); window.localStorage.clear(); app.authState.uid = "u1"; };
const seed = (scope, key, mind, updatedAt = 10) => {
  const payload = fixture.toFirestoreMindMap(mind, { uid: scope.uid, productId: scope.productId, moduleId: scope.moduleId, mapKey: key, updatedAt });
  cloud.store.set(mapPath(scope, key), payload); return payload;
};
afterEach(async () => { for (const board of mounted) unmount(board); await settle(120); });
after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() || []) if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("a branch reaches the correct Firestore document and re-renders on a cold open", async () => {
  fresh(); const board = mount(); await settle();
  branch("Newton's third law");
  assert.match(text("nodes"), /Newton/);
  assert.equal(JSON.parse(localStorage.getItem(localKey())).nodes[0].topic, "Newton's third law", "mirror must precede debounce");
  await settle(50);
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "Newton's third law");
  assert.equal(text("status"), "saved");
  unmount(board);
  localStorage.clear();
  mount(); await settle();
  assert.match(text("nodes"), /Newton/);
});

test("New map always returns/selects a real key, including repeated React 19 batched creates", async () => {
  fresh(); mount(); await settle();
  const keys = [];
  act(() => { for (const name of ["First", "Second", "Third"]) keys.push(ctl().createMap(name)); });
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.every(Boolean), "previous implementation assigned the return value inside a deferred state updater");
  assert.equal(ctl().activeMapKey, keys[2]);
  branch("Third branch"); await settle(60);
  assert.equal(cloud.store.get(mapPath(input(), keys[2])).nodes[0].topic, "Third branch");
  act(() => ctl().createMap("Fourth")); await settle();
  assert.equal(ctl().mind.title, "Fourth");
});

test("slow initial reads cannot replace a branch drawn while loading", async () => {
  fresh(); cloud.state.readDelay = 80;
  seed(input(), "main", fixture.createMindMap("Old cloud topic"));
  mount(input({ debounceMs: 2 }));
  branch("Typed before the read answered");
  await settle(150);
  assert.match(text("nodes"), /Typed before/);
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "Typed before the read answered");
});

test("unmount inside the debounce window mirrors immediately and flushes the outgoing map", async () => {
  fresh(); const board = mount(input({ debounceMs: 60000 })); await settle();
  branch("Last second branch");
  assert.equal(cloud.submitted.length, 0);
  assert.match(localStorage.getItem(localKey()), /Last second/);
  unmount(board); await settle();
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "Last second branch");
});

test("course/module switches flush captured scopes; old acknowledgements cannot mark a new map saved", async () => {
  fresh(); const board = mount(input({ debounceMs: 60000 })); await settle();
  branch("Only in p1"); cloud.state.writeDelay = 80;
  const other = input({ productId: "p2", rootTopic: "Other course", debounceMs: 60000 });
  act(() => board.render(other)); await settle(15);
  assert.equal(text("nodes"), "");
  assert.equal(text("topic"), "Other course");
  await settle(110);
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "Only in p1");
  assert.equal(cloud.store.get(mapPath(other)), undefined, "outgoing work leaked into the new document");
  assert.equal(text("status"), "ready", "old save falsely acknowledged the new scope");
  branch("Only in p2"); unmount(board); await settle(110);
  assert.equal(cloud.store.get(mapPath(other)).nodes[0].topic, "Only in p2");
});

test("a slow write is serialised with a later edit and never leaves the older revision in Firestore", async () => {
  fresh(); mount(); await settle(); cloud.state.writeDelay = 70;
  branch("First revision"); await settle(15);
  branch("Second revision"); await settle(180);
  assert.deepEqual(cloud.store.get(mapPath()).nodes.map(n => n.topic), ["First revision", "Second revision"]);
  assert.equal(text("status"), "saved");
  assert.deepEqual(JSON.parse(localStorage.getItem(outboxKey())).uploads, []);
});

test("an offline newer draft beats an older cloud map and all inactive pending maps recover", async () => {
  fresh(); const board = mount(); await settle(); cloud.state.failWrites = "unavailable";
  branch("New offline branch"); await settle(30);
  let second;
  act(() => { second = ctl().createMap("Offline second"); });
  branch("Inactive recovery"); await settle(30);
  assert.match(text("error"), /unavailable/);
  unmount(board); await settle();
  seed(input(), "main", fixture.createMindMap("Old remote map"));
  cloud.state.failWrites = null;
  // Reopen main: second must sync too, even though it is not selected.
  localStorage.setItem("dc.mindMapActive.v1.u1.p1.course", "main");
  mount(); await settle(100);
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "New offline branch");
  assert.equal(cloud.store.get(mapPath(input(), second)).nodes[0].topic, "Inactive recovery");
  assert.match(text("nodes"), /New offline/);
});

test("a failed upload retains its outbox and no retry timer survives unmount", async () => {
  fresh(); mount(); await settle(); cloud.state.failWrites = "permission-denied";
  branch("Keep the refused map"); await settle(30);
  assert.match(text("error"), /permission-denied/);
  assert.deepEqual(JSON.parse(localStorage.getItem(outboxKey())).uploads, ["main"]);
  for (const board of mounted) unmount(board);
  await settle(30); const count = cloud.submitted.length;
  await settle(1500);
  assert.equal(cloud.submitted.length, count, "dead controller kept retrying");
  cloud.state.failWrites = null; mount(); await settle(80);
  assert.equal(cloud.store.get(mapPath()).nodes[0].topic, "Keep the refused map");
});

test("delete waits for an in-flight upload and cannot resurrect the old map", async () => {
  fresh(); mount(); await settle(); cloud.state.writeDelay = 70;
  let key; act(() => { key = ctl().createMap("Delete me"); });
  act(() => ctl().deleteMap(key));
  await settle(180);
  assert.equal(cloud.store.get(mapPath(input(), key)), undefined);
  const ops = cloud.committed.filter(op => op.path === mapPath(input(), key)).map(op => op.kind);
  assert.deepEqual(ops, ["set", "delete"]);
});

test("deleting the last main map keeps a writable replacement, ordered AFTER the old deletion", async () => {
  fresh(); mount(); await settle();
  branch("Old deleted content"); await settle(40); cloud.state.writeDelay = 60;
  act(() => ctl().deleteMap("main"));
  branch("New replacement content"); await settle(200);
  assert.deepEqual(cloud.store.get(mapPath()).nodes.map(n => n.topic), ["New replacement content"]);
  assert.match(text("nodes"), /New replacement/);
});

test("renaming an inactive cloud-only map preserves every branch", async () => {
  fresh(); const mind = fixture.addChildNode(fixture.createMindMap("Remote"), "root", "Do not erase").mind;
  seed(input(), "remote-map", mind);
  mount(); await settle();
  act(() => ctl().renameMap("remote-map", "Renamed")); await settle(70);
  const saved = cloud.store.get(mapPath(input(), "remote-map"));
  assert.equal(saved.title, "Renamed"); assert.equal(saved.nodes[0].topic, "Do not erase");
});

test("unverified user cannot write a different owner's namespace; reconnect/pagehide flush safely", async () => {
  fresh(); mount(input({ uid: "another-user", debounceMs: 60000 })); await settle();
  branch("Private device copy");
  act(() => window.dispatchEvent(new window.Event("pagehide"))); await settle();
  assert.equal(cloud.submitted.length, 0);
  assert.match(text("error"), /sign-in/i);
  app.authState.uid = "another-user";
  act(() => window.dispatchEvent(new window.Event("online"))); await settle();
  assert.ok(cloud.store.get(mapPath(input({ uid: "another-user" }))));
  assert.equal(text("status"), "saved");
});

test("blank Course Player scopes are read-only", async () => {
  fresh(); const mounted = mount(input({ productId: "" })); await settle();
  branch("Cannot save without scope");
  let key; act(() => { key = ctl().createMap("Should not exist"); });
  assert.equal(key, null); assert.equal(cloud.submitted.length, 0); assert.equal(text("nodes"), "");
  unmount(mounted);
});


test("a late editor teardown after switching modules still saves ONLY its captured outgoing map", async () => {
  fresh(); const first = input({ moduleId: "first-module", debounceMs: 60_000 }); const board = mount(first); await settle();
  branch("Original first branch"); const outgoing = ctl().setMind;
  act(() => board.render(input({ moduleId: "second-module", debounceMs: 60_000 }))); await settle();
  act(() => outgoing(mind => fixture.setMindMapTitle(mind, "Final first-module draft"))); await settle(60);
  assert.equal(cloud.store.get(mapPath(first)).title, "Final first-module draft");
  assert.equal(cloud.store.get(mapPath(input({ moduleId: "second-module" }))), undefined);
  assert.equal(ctl().mind.title, "");
});

test("a late node commit after selecting another map cannot target the new active key", async () => {
  fresh(); mount(); await settle(); branch("Main branch"); await settle(40);
  const outgoing = ctl().setMind;
  let next; act(() => { next = ctl().createMap("Second map"); }); await settle(40);
  act(() => outgoing(mind => fixture.setMindMapTitle(mind, "Main after teardown")));
  act(() => ctl().flush()); await settle(60);
  assert.equal(cloud.store.get(mapPath()).title, "Main after teardown");
  assert.equal(cloud.store.get(mapPath(input(), next)).title, "Second map");
  assert.equal(ctl().mind.title, "Second map");
});

test("callbacks belonging to a deleted main draft cannot mutate its replacement", async () => {
  fresh(); mount(); await settle(); branch("Deleted content"); await settle(40);
  const deletedEditor = ctl().setMind;
  act(() => ctl().deleteMap("main"));
  branch("Replacement content");
  act(() => deletedEditor(mind => fixture.setMindMapTitle(mind, "Deleted editor's late title")));
  act(() => ctl().flush()); await settle(90);
  assert.equal(ctl().mind.title, "");
  assert.deepEqual(ctl().mind.nodes.map(node => node.topic), ["Replacement content"]);
  assert.notEqual(cloud.store.get(mapPath()).title, "Deleted editor's late title");
});

test("reconnect retries failed map/library reads, restoring existing remote maps without overwriting them", async () => {
  fresh();
  const mind = fixture.addChildNode(fixture.createMindMap("Existing remote main"), "root", "Already saved remotely").mind;
  seed(input(), "main", mind); seed(input(), "remote-second", fixture.createMindMap("Existing remote second"));
  cloud.state.failReads = "unavailable"; mount(); await settle(40);
  assert.equal(text("status"), "error");
  cloud.state.failReads = null;
  act(() => window.dispatchEvent(new window.Event("online"))); await settle(70);
  assert.match(text("nodes"), /Already saved remotely/);
  assert.ok(ctl().maps.some(map => map.mapKey === "remote-second"));
  assert.equal(text("error"), "");
  assert.equal(cloud.submitted.filter(op => op.kind === "set").length, 0, "read recovery uploaded an unverified empty seed");
});
