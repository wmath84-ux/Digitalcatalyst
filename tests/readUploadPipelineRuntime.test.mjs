// tests/readUploadPipelineRuntime.test.mjs
//
// Runtime proof for the Read page's custom-PDF upload ("stuck at ~40 %").
// It runs the REAL `useReadUploads` hook in real React 19 inside jsdom; only
// the Firebase I/O edges are replaced:
//   • `firebase/storage`   — a controllable resumable task: the test decides
//                            when bytes move, when it completes or fails;
//   • `firebase/firestore` — an in-memory library (onSnapshot / setDoc …);
//   • `../../firebase`     — the app's `auth` / `db` / `getFirebaseStorage`.
//
// What the old pipeline did (and what is proved NOT to happen any more): after
// 3.5 s without a progress event — i.e. a normal phone handshake + first chunk
// — it cancelled the resumable task, pinned the bar at a hard-coded 45 %/40 %
// and raced two progress-less `uploadBytes` calls with no timeout.

import test, { after, beforeEach, mock } from "node:test";
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
const DIR = path.join(ROOT, "node_modules", ".tmp-read-upload-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── stub: Cloud Storage with a hand-driven resumable task ─────────────────── */

const STORAGE_STUB = path.join(DIR, "storageStub.mjs");
fs.writeFileSync(
  STORAGE_STUB,
  `
export const tasks = [];
export const calls = { uploadBytes: 0, getDownloadURL: 0 };
export const state = { downloadUrl: null, failDownloadUrl: null };
export function ref(_storage, path) { return { fullPath: path }; }
export async function uploadBytes() { calls.uploadBytes += 1; }
export async function getDownloadURL(target) {
  calls.getDownloadURL += 1;
  if (state.failDownloadUrl) { const e = new Error("stub"); e.code = state.failDownloadUrl; throw e; }
  return state.downloadUrl || "https://storage.example/" + encodeURIComponent(target.fullPath);
}
export function uploadBytesResumable(target, file, metadata) {
  const task = {
    target, file, metadata, observers: null, cancelled: false, paused: 0, resumed: 0,
    on(_event, next, error, complete) { task.observers = { next, error, complete }; return () => {}; },
    cancel() {
      if (task.cancelled) return false;
      task.cancelled = true;
      queueMicrotask(() => task.observers?.error({ code: "storage/canceled" }));
      return true;
    },
    pause() { task.paused += 1; return true; },
    resume() { task.resumed += 1; return true; },
    // test drivers
    progress(bytes, state = "running") { task.observers?.next({ bytesTransferred: bytes, totalBytes: file.size, state }); },
    complete() { task.observers?.complete(); },
    fail(code) { task.observers?.error({ code }); },
  };
  tasks.push(task);
  return task;
}
export const reset = () => {
  tasks.length = 0;
  calls.uploadBytes = 0;
  calls.getDownloadURL = 0;
  state.downloadUrl = null;
  state.failDownloadUrl = null;
};
`,
);

/* ── stub: Firestore ───────────────────────────────────────────────────────── */

const FIRESTORE_STUB = path.join(DIR, "firestoreStub.mjs");
fs.writeFileSync(
  FIRESTORE_STUB,
  `
export const store = new Map();
export const writes = [];
export const state = { hangWrites: false, failWrites: null };
const hung = [];
export function collection(_db, ...segments) { return { path: segments.join("/") }; }
export function doc(_db, ...segments) { return { path: segments.join("/") }; }
export function onSnapshot(_ref, next) { next({ forEach() {} }); return () => {}; }
export async function setDoc(ref, data) {
  if (state.hangWrites) return new Promise((resolve, reject) => hung.push({ resolve, reject, ref, data }));
  if (state.failWrites) { const e = new Error("stub"); e.code = state.failWrites; throw e; }
  store.set(ref.path, data);
  writes.push({ path: ref.path, data });
}
export async function updateDoc() {}
export async function deleteDoc() {}
export const releaseHung = (code) => {
  for (const item of hung.splice(0)) {
    if (code) { const e = new Error("stub"); e.code = code; item.reject(e); }
    else { store.set(item.ref.path, item.data); writes.push({ path: item.ref.path, data: item.data }); item.resolve(); }
  }
};
export const reset = () => { store.clear(); writes.length = 0; hung.length = 0; state.hangWrites = false; state.failWrites = null; };
`,
);

const APP_STUB = path.join(DIR, "appStub.mjs");
fs.writeFileSync(
  APP_STUB,
  `
export const tokenCalls = [];
export const auth = {
  get currentUser() {
    return { uid: "u1", getIdToken: async (force) => { tokenCalls.push(force); return "stub-token"; } };
  },
};
export const db = { __stubDb: true };
export async function getFirebaseStorage() { return { __stubStorage: true }; }
`,
);

/* ── DOM ───────────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, { url: "http://localhost/" });
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
for (const key of ["HTMLElement", "Element", "Node", "Event", "CustomEvent"]) define(key, window[key]);

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import useReadUploads from "./src/course/useReadUploads";

export const latest: { ctl: any; views: any[] } = { ctl: null, views: [] };

export function mount(target: HTMLElement) {
  function Harness() {
    const ctl = useReadUploads("u1");
    latest.ctl = ctl;
    if (ctl.uploading) latest.views.push(ctl.uploading);
    return null;
  }
  const root = createRoot(target);
  flushSync(() => root.render(<Harness />));
  return { unmount: () => flushSync(() => root.unmount()) };
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
      name: "read-upload-io-boundaries",
      setup(b) {
        b.onResolve({ filter: /^firebase\/storage$/ }, () => ({ path: STORAGE_STUB, external: true }));
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: FIRESTORE_STUB, external: true }));
        b.onResolve({ filter: /(?:^|\/)firebase$/ }, () => ({ path: APP_STUB, external: true }));
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const storage = await import(pathToFileURL(STORAGE_STUB).href);
const firestore = await import(pathToFileURL(FIRESTORE_STUB).href);

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ───────────────────────────────────────────────────────────────── */

const MB = 1024 * 1024;
const pdfFile = (name = "notes.pdf", size = 4 * MB, type = "application/pdf") => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return new File([bytes], name, { type });
};
/** Let promises + React state settle (real timers). */
const settle = async (rounds = 6) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};
const ctl = () => fixture.latest.ctl;
const task = (index = -1) => storage.tasks.at(index);
/** Wait until the hook has created its resumable task. */
const untilTask = async (count = 1) => {
  for (let index = 0; index < 50 && storage.tasks.length < count; index += 1) await settle(1);
  assert.equal(storage.tasks.length, count, "the resumable task was created");
  await settle(); // …and React has rendered the state that came with it
};

let mounted;
beforeEach(() => {
  mounted?.unmount();
  storage.reset();
  firestore.reset();
  fixture.latest.views.length = 0;
  mounted = fixture.mount(document.getElementById("host"));
});

/* ── tests ─────────────────────────────────────────────────────────────────── */

test("progress is the SDK's own byte ratio; upload and finishing are separate stages; one path only", async () => {
  const file = pdfFile("Physics.pdf", 4 * MB);
  const pending = ctl().uploadPdf(file, "Physics");
  await untilTask();
  assert.equal(task().metadata.contentType, "application/pdf");
  assert.equal(ctl().uploading.stage, "uploading");
  assert.equal(ctl().uploading.progress, 0);

  task().progress(1 * MB);
  await settle();
  assert.equal(ctl().uploading.progress, 0.25, "25 % is exactly 1 of 4 MB");
  assert.equal(ctl().uploading.bytesTransferred, 1 * MB);
  task().progress(4 * MB);
  await settle();
  assert.equal(ctl().uploading.progress, 1);

  firestore.state.hangWrites = true; // hold the library write to observe "finishing"
  task().complete();
  await settle(10);
  assert.equal(ctl().uploading.stage, "finalizing");
  assert.equal(ctl().uploading.progress, null, "finishing has no percentage → indeterminate");
  firestore.releaseHung();
  const row = await pending;
  await settle();
  assert.ok(row, "the upload resolved with its library row");
  assert.equal(row.module, "Physics");
  assert.equal(ctl().uploading, null);
  assert.equal(ctl().uploadError, null);
  assert.equal(storage.tasks.length, 1, "exactly one resumable task");
  assert.equal(storage.calls.uploadBytes, 0, "no duplicate progress-less upload");
  assert.equal(firestore.writes.length, 1);
  assert.match(firestore.writes[0].path, /^users\/u1\/readUploads\/[a-z0-9-]+$/i);
  assert.equal(firestore.writes[0].data.sizeBytes, file.size);
  for (const view of fixture.latest.views) {
    assert.notEqual(view.progress, 0.4, "never the old hard-coded 40 %");
    assert.notEqual(view.progress, 0.45, "never the old hard-coded 45 %");
  }
});

test("a slow first chunk (no progress for many seconds) is NOT cancelled or swapped for another upload", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = ctl().uploadPdf(pdfFile());
    await untilTask();
    mock.timers.tick(20_000); // the old code gave up after 3.5 s
    await settle();
    assert.equal(task().cancelled, false);
    assert.equal(storage.tasks.length, 1);
    assert.equal(storage.calls.uploadBytes, 0);
    assert.equal(ctl().uploading.progress, 0, "still the true 0 %, not a made-up number");
    task().progress(2 * MB);
    await settle();
    assert.equal(ctl().uploading.progress, 0.5);
    task().complete();
    assert.ok(await pending);
  } finally {
    mock.timers.reset();
  }
});

test("a dead upload is detected by the inactivity watchdog, reported with Retry, and Retry succeeds", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let pending;
  try {
    pending = ctl().uploadPdf(pdfFile("Dead.pdf"));
    await untilTask();
    task().progress(1 * MB);
    await settle();
    mock.timers.tick(50_000);
    task().progress(1.5 * MB); // still moving → the watchdog re-arms
    await settle();
    mock.timers.tick(50_000);
    await settle();
    assert.equal(task().cancelled, false, "slow but moving is never cut off");
    mock.timers.tick(11_000); // 61 s since the last byte
    await settle();
  } finally {
    mock.timers.reset();
  }
  assert.equal(await pending, null);
  await settle();
  assert.equal(task(0).cancelled, true, "the stalled task was cancelled — no zombie upload");
  assert.equal(ctl().uploading, null);
  assert.match(ctl().uploadError, /stopped moving/);
  assert.match(ctl().uploadError, /Retry/);
  assert.equal(ctl().retryableName, "Dead.pdf");

  const retried = ctl().retryUpload();
  await untilTask(2);
  task().progress(4 * MB);
  task().complete();
  const row = await retried;
  await settle();
  assert.ok(row);
  assert.equal(ctl().uploadError, null);
  assert.equal(ctl().retryableName, null);
});

test("Cancel stops the task, leaves no error, and the cancelled task's late events cannot touch the next upload", async () => {
  const first = ctl().uploadPdf(pdfFile("One.pdf"));
  await untilTask();
  task().progress(1 * MB);
  await settle();
  ctl().cancelUpload();
  assert.equal(await first, null);
  await settle();
  const old = task(0);
  assert.equal(old.cancelled, true);
  assert.equal(ctl().uploading, null);
  assert.equal(ctl().uploadError, null, "Cancel is the learner's choice, not an error");

  const second = ctl().uploadPdf(pdfFile("Two.pdf"));
  await untilTask(2);
  task().progress(1 * MB);
  await settle();
  // The cancelled task fires late events (as real SDK tasks can).
  old.observers.next({ bytesTransferred: 4 * MB, totalBytes: 4 * MB, state: "running" });
  old.observers.complete();
  old.observers.error({ code: "storage/unknown" });
  await settle();
  assert.equal(ctl().uploading.name, "Two.pdf");
  assert.equal(ctl().uploading.progress, 0.25, "the old task did not overwrite the new progress");
  assert.equal(ctl().uploadError, null);
  task().progress(4 * MB);
  task().complete();
  assert.equal((await second).name, "Two.pdf");
  assert.equal(firestore.writes.length, 1, "only the second upload wrote a library row");
});

test("a file that is not really a PDF is refused before any upload; a real PDF with no MIME type is accepted", async () => {
  const fake = new File([new TextEncoder().encode("<html>not a pdf</html>")], "renamed.pdf", { type: "application/pdf" });
  assert.equal(await ctl().uploadPdf(fake), null);
  await settle();
  assert.equal(storage.tasks.length, 0);
  assert.match(ctl().uploadError, /not a real PDF/);
  assert.equal(ctl().retryableName, null, "retrying would not help");

  const pending = ctl().uploadPdf(pdfFile("android.pdf", 512 * 1024, "application/octet-stream"));
  await untilTask();
  assert.equal(ctl().uploadError, null);
  task().progress(512 * 1024);
  task().complete();
  assert.ok(await pending);
});

test("bytes stored but the finishing step failed → Retry finishes WITHOUT uploading again", async () => {
  storage.state.failDownloadUrl = "storage/retry-limit-exceeded";
  const pending = ctl().uploadPdf(pdfFile("Half.pdf"));
  await untilTask();
  task().progress(4 * MB);
  task().complete();
  assert.equal(await pending, null);
  await settle();
  assert.match(ctl().uploadError, /check your connection/i);
  assert.equal(ctl().retryableName, "Half.pdf");

  storage.state.failDownloadUrl = null;
  const row = await ctl().retryUpload();
  await settle();
  assert.ok(row);
  assert.equal(storage.tasks.length, 1, "no second upload of the same bytes");
  assert.equal(firestore.writes.length, 1);
  assert.equal(firestore.writes[0].data.storagePath, task(0).target.fullPath, "the row points at the object already stored");
});

test("a library write that never answers cannot hang the upload: it completes as queued after 15 s", async () => {
  firestore.state.hangWrites = true;
  mock.timers.enable({ apis: ["setTimeout"] });
  let pending;
  try {
    pending = ctl().uploadPdf(pdfFile("Slow.pdf"));
    await untilTask();
    task().progress(4 * MB);
    task().complete();
    await settle(10);
    assert.equal(ctl().uploading.stage, "finalizing");
    mock.timers.tick(15_001);
    await settle();
  } finally {
    mock.timers.reset();
  }
  const row = await pending;
  await settle();
  assert.ok(row, "queued in Firestore's offline queue → reported as added");
  assert.equal(ctl().uploading, null);
  // A late refusal is still surfaced, with a finish-only Retry.
  firestore.releaseHung("permission-denied");
  await settle();
  assert.match(ctl().uploadError, /refused/);
  assert.equal(ctl().retryableName, "Slow.pdf");
});

test("going offline pauses the task (no false stall) and coming back resumes it", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = ctl().uploadPdf(pdfFile());
    await untilTask();
    task().progress(1 * MB);
    await settle();
    window.dispatchEvent(new window.Event("offline"));
    await settle();
    assert.equal(task().paused, 1);
    assert.equal(ctl().uploading.waitingForNetwork, true);
    mock.timers.tick(5 * 60_000);
    await settle();
    assert.equal(task().cancelled, false, "offline time never counts as a stall");
    window.dispatchEvent(new window.Event("online"));
    await settle();
    assert.equal(task().resumed, 1);
    assert.equal(ctl().uploading.waitingForNetwork, false);
    task().progress(4 * MB);
    task().complete();
    assert.ok(await pending);
  } finally {
    mock.timers.reset();
  }
});

test("Cancel during a multi-file pick stops the rest of the batch", async () => {
  const pending = ctl().uploadPdfs([pdfFile("A.pdf"), pdfFile("B.pdf"), pdfFile("C.pdf")]);
  await untilTask();
  task().progress(4 * MB);
  task().complete();
  await untilTask(2);
  assert.equal(ctl().uploading.fileIndex, 2);
  assert.equal(ctl().uploading.fileCount, 3);
  ctl().cancelUpload();
  const stored = await pending;
  await settle();
  assert.deepEqual(stored.map((row) => row.name), ["A.pdf"]);
  assert.equal(storage.tasks.length, 2, "C was never started");
  assert.equal(ctl().uploading, null);
});

test("leaving the panel mid-upload: the upload still lands, nothing writes into the unmounted hook", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const pending = ctl().uploadPdf(pdfFile("Away.pdf"));
    await untilTask();
    mounted.unmount();
    mounted = null;
    task().progress(4 * MB);
    task().complete();
    const row = await pending;
    await settle();
    assert.ok(row);
    assert.equal(firestore.writes.length, 1, "the file still appears in the library");
    assert.deepEqual(errors, []);
  } finally {
    console.error = original;
  }
});
