import "fake-indexeddb/auto";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  localReadDb, storeLocalReadPdf, listLocalReadUploads, patchLocalReadPdf,
  saveLocalReadAnnotations, removeLocalReadPdf, openLocalReadPdf, localReadError,
} from "../src/course/localReadDb.ts";
import { localReadReference, parseLocalReadReference } from "../utils/localReadReference.js";
import { readUploadModuleDraft } from "../utils/readUploads.js";
import { getReadResourcePresentation, normalizeReadResourceUrl } from "../utils/readResources.js";

const pdf = (name = "Learnbook _ Eduvora.PDF") => new File(["%PDF-1.7\noriginal"], name, { type: "application/pdf" });
beforeEach(async () => { await localReadDb.pdfs.clear(); });
after(async () => { await localReadDb.delete(); });

test("local upload atomically persists PDF + module metadata and survives DB reopen", async () => {
  const row = await storeLocalReadPdf("learner-1", pdf(), "Physics", "Chapter 1");
  assert.equal(row.storageKind, "local");
  assert.equal(row.module, "Physics");
  assert.equal(row.submodule, "Chapter 1");
  assert.equal(row.storagePath, "");
  assert.equal(row.url, localReadReference("learner-1", row.id));
  assert.equal("blob" in row, false);
  localReadDb.close();
  await localReadDb.open();
  const shelf = await listLocalReadUploads("learner-1");
  assert.equal(shelf.length, 1);
  assert.equal(shelf[0].id, row.id);
  const stored = await localReadDb.pdfs.get([row.uid, row.id]);
  assert.equal(await stored.blob.text(), "%PDF-1.7\noriginal");
  assert.deepEqual(await listLocalReadUploads("another-user"), []);
});

test("local rename, module move, page position and annotated bytes persist", async () => {
  const row = await storeLocalReadPdf("learner-1", pdf());
  await patchLocalReadPdf(row.uid, row.id, { name: "  New   name  ", module: " Chemistry ", pageCount: 12, lastPage: 50, lastOpenedAt: 123 });
  const bytes = new TextEncoder().encode("%PDF-1.7\nannotated");
  await saveLocalReadAnnotations(row.uid, row.id, bytes, { pageCount: 12, annotationCount: 2 });
  localReadDb.close();
  await localReadDb.open();
  const saved = (await listLocalReadUploads(row.uid))[0];
  assert.equal(saved.name, "New name");
  assert.equal(saved.module, "Chemistry");
  assert.equal(saved.lastPage, 12);
  assert.equal(saved.lastOpenedAt, 123);
  assert.equal(saved.hasAnnotations, true);
  assert.equal(saved.annotationCount, 2);
  assert.equal(saved.sizeBytes, bytes.length);
  assert.equal(saved.url, row.url, "annotation saves never change the viewer identity");
  const url = await openLocalReadPdf(row.url, row.uid);
  try { assert.equal(await (await fetch(url)).text(), "%PDF-1.7\nannotated"); }
  finally { URL.revokeObjectURL(url); }
});

test("owner-only resolving, missing-device errors, deletion of bytes and metadata", async () => {
  const row = await storeLocalReadPdf("learner-1", pdf());
  await assert.rejects(openLocalReadPdf(row.url, null), /Sign in/);
  await assert.rejects(openLocalReadPdf(row.url, "another-user"), /Sign in/);
  await assert.rejects(patchLocalReadPdf("another-user", row.id, { name: "hostile" }), /missing/);
  await removeLocalReadPdf("another-user", row.id);
  assert.equal((await listLocalReadUploads(row.uid)).length, 1);
  await removeLocalReadPdf(row.uid, row.id);
  assert.deepEqual(await listLocalReadUploads(row.uid), []);
  await assert.rejects(openLocalReadPdf(row.url, row.uid), /device where it was imported/);
});

test("invalid files/annotation saves cannot leave half-written records", async () => {
  for (const file of [new File([], "empty.pdf"), new File(["html"], "fake.pdf"), new File(["text"], "a.txt", { type: "text/plain" })]) {
    await assert.rejects(storeLocalReadPdf("learner-1", file));
  }
  assert.deepEqual(await listLocalReadUploads("learner-1"), []);
  const row = await storeLocalReadPdf("learner-1", pdf());
  await assert.rejects(saveLocalReadAnnotations(row.uid, row.id, new TextEncoder().encode("not a pdf")));
  const saved = await localReadDb.pdfs.get([row.uid, row.id]);
  assert.equal(saved.hasAnnotations, false);
  assert.equal(await saved.blob.text(), "%PDF-1.7\noriginal");
  assert.match(localReadError(new DOMException("Full", "QuotaExceededError")), /storage is full/);
  assert.match(localReadError(new DOMException("Blocked", "SecurityError")), /unavailable/);
});

test("My Study Library uses durable local references and routes them only to PDF.js", async () => {
  const row = await storeLocalReadPdf("learner-1", pdf(), "Physics");
  const draft = readUploadModuleDraft(row);
  assert.equal(draft.readSourceKind, "pdf_url");
  assert.equal(draft.url, row.url);
  assert.equal(draft.readStoragePath, "");
  const reopened = JSON.parse(JSON.stringify({ id: "resource-1", ...draft }));
  const presentation = getReadResourcePresentation(reopened);
  assert.equal(presentation.kind, "pdfjs");
  assert.equal(presentation.sourceUrl, row.url);
  assert.equal(normalizeReadResourceUrl(row.url, "embed_url"), "");
  assert.equal(normalizeReadResourceUrl("blob:https://eduvora.test/temporary", "pdf_url"), "");
  assert.equal(readUploadModuleDraft({ ...row, uid: "other" }), null);
  assert.equal(parseLocalReadReference("eduvora-local-pdf:uid/../../file"), null);
  assert.equal(parseLocalReadReference("eduvora-local-pdf:uid/file-123?url=https://evil.test"), null);
});

test("local repository has no cloud dependency; viewer resolves and revokes object URLs", () => {
  const source = readFileSync("src/course/localReadDb.ts", "utf8");
  assert.doesNotMatch(source, /firebase|uploadBytes|setDoc/);
  const viewer = readFileSync("src/course/PdfJsGenericViewer.tsx", "utf8");
  assert.match(viewer, /openLocalReadPdf\(src, auth.currentUser\?\.uid/);
  assert.match(viewer, /element.setAttribute\("src", viewerSrc\)/);
  assert.match(viewer, /URL.revokeObjectURL\(localBlobUrl\)/);
});
