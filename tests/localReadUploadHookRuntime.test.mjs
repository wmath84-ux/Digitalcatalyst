import "fake-indexeddb/auto";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const dir = path.join(process.cwd(), "node_modules", ".tmp-local-read-hook");
fs.mkdirSync(dir, { recursive: true });
const stub = path.join(dir, "cloud.mjs");
fs.writeFileSync(stub, `
export const calls = { writes: 0, storage: 0 };
export const auth = { currentUser: { uid: "learner-1" } };
export const db = {};
export function collection() { return {}; }
export function doc() { return {}; }
export function onSnapshot(_ref, _next, fail) { fail({ code: "permission-denied" }); return () => {}; }
export async function setDoc() { calls.writes++; throw new Error("No cloud writes expected"); }
export const deleteDoc = setDoc, updateDoc = setDoc;
export async function getFirebaseStorage() { calls.storage++; throw new Error("No storage calls expected"); }
export function ref() { return {}; }
export const getDownloadURL = getFirebaseStorage, uploadBytes = getFirebaseStorage, uploadBytesResumable = getFirebaseStorage, deleteObject = getFirebaseStorage;
`);
const dom = new JSDOM("<!doctype html><div id='host'></div>", { url: "http://localhost" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useReadUploads } from "./src/course/useReadUploads";
    export { localReadDb } from "./src/course/localReadDb";
    export const latest = { ctl: null as any };
    export function mount(target: HTMLElement) {
      const root = createRoot(target);
      function Harness({ uid }: { uid: string }) { latest.ctl = useReadUploads(uid); return null; }
      const render = (uid: string) => flushSync(() => root.render(<Harness uid={uid} />));
      render("learner-1");
      return { render, unmount: () => flushSync(() => root.unmount()) };
    }
  ` },
  outfile: path.join(dir, "fixture.mjs"), bundle: true, platform: "node", format: "esm", jsx: "automatic", logLevel: "silent",
  plugins: [{ name: "cloud-boundaries", setup(builder) {
    builder.onResolve({ filter: /^firebase\/(storage|firestore)$|(?:^|\/)firebase$/ }, () => ({ path: stub, external: true }));
  } }],
});
const fixture = await import(pathToFileURL(path.join(dir, "fixture.mjs")).href);
const cloud = await import(pathToFileURL(stub).href);
const ctl = () => fixture.latest.ctl;
const file = (name = "Learnbook.PDF") => new File(["%PDF-1.7\nlocal"], name, { type: "application/pdf" });
const until = async (condition) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(condition(), "hook state settled");
};
let mounted;
beforeEach(async () => {
  mounted?.unmount();
  await fixture.localReadDb.pdfs.clear();
  cloud.auth.currentUser = { uid: "learner-1" };
  cloud.calls.writes = 0;
  cloud.calls.storage = 0;
  mounted = fixture.mount(document.getElementById("host"));
});
after(async () => {
  mounted?.unmount();
  await fixture.localReadDb.delete();
  dom.window.close();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

test("local shelf works despite cloud rules failure; rename/move/save/activity/delete never call Firebase", async () => {
  await until(() => ctl().state === "error");
  assert.equal(ctl().state, "error", "cloud access is deliberately denied");
  const [row] = await ctl().uploadLocalPdfs([file()], "Physics", "Chapter 1");
  await until(() => ctl().uploads.length === 1);
  assert.equal(ctl().uploads[0].submodule, "Chapter 1");
  assert.equal(ctl().localUploading, false);
  assert.equal(await ctl().renameUpload(row.id, "Renamed"), true);
  assert.equal(await ctl().setUploadModule(row.id, "Biology"), true);
  await until(() => ctl().uploads[0].name === "Renamed" && ctl().uploads[0].module === "Biology");
  assert.equal(await ctl().saveAnnotations(row.id, new TextEncoder().encode("%PDF-1.7\nmarks"), { pageCount: 8, annotationCount: 1 }), true);
  await until(() => ctl().uploads[0].hasAnnotations);
  ctl().recordActivity(row.id, 5, 8);
  window.dispatchEvent(new dom.window.Event("pagehide"));
  await until(() => ctl().uploads[0].lastPage === 5);
  mounted.unmount();
  mounted = fixture.mount(document.getElementById("host"));
  await until(() => ctl().uploads.length === 1);
  assert.equal(ctl().uploads[0].lastPage, 5);
  assert.equal(ctl().uploads[0].hasAnnotations, true);
  assert.equal(await ctl().removeUpload(row.id), true);
  await until(() => ctl().uploads.length === 0);
  assert.equal(cloud.calls.writes, 0);
  assert.equal(cloud.calls.storage, 0);
});

test("partial local batch retains completed rows and exposes a retryable file error", async () => {
  const rows = await ctl().uploadLocalPdfs([file(), new File(["HTML"], "fake.pdf"), file("Later.pdf")]);
  assert.equal(rows.length, 1);
  await until(() => ctl().uploads.length === 1);
  assert.match(ctl().localError, /PDF header/);
  assert.equal(ctl().localUploading, false);
  await ctl().uploadLocalPdfs([file("Later.pdf")]);
  await until(() => ctl().uploads.length === 2);
  assert.equal(ctl().localError, null);
  assert.equal(cloud.calls.writes, 0);
});

test("account switch hides another account's local shelf and refuses cross-account saves", async () => {
  const [row] = await ctl().uploadLocalPdfs([file()]);
  await until(() => ctl().uploads.length === 1);
  cloud.auth.currentUser = { uid: "learner-2" };
  mounted.render("learner-2");
  assert.equal(ctl().uploads.length, 0);
  assert.equal(await ctl().saveAnnotations(row.id, new TextEncoder().encode("%PDF-1.7\nwrong account")), false);
  cloud.auth.currentUser = { uid: "learner-1" };
  mounted.render("learner-1");
  await until(() => ctl().uploads.length === 1);
  cloud.auth.currentUser = null;
  assert.deepEqual(await ctl().uploadLocalPdfs([file()]), []);
  await until(() => Boolean(ctl().localError));
  assert.match(ctl().localError, /Sign in/);
  assert.equal(cloud.calls.writes, 0);
});
