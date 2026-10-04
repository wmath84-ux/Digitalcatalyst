// tests/readUploads.test.mjs
//
// "Your annotations" — the learner's own PDFs in the Course Player's Read tab.
//
// Two halves, exactly like the feature:
//
//   · RUNTIME — utils/readUploads.js is the pure model (ids, name/module
//     clamps, Storage paths, the Firestore payload the rules validate, the
//     parse that survives a hand-edited document, grouping/sorting, the
//     labels the UI prints). Every branch is driven directly here.
//   · CONTRACT — the rules files and the three runtime pieces (the hook, the
//     library panel, the annotation bridge in the viewer) must keep offering
//     the same guarantees: owner-only paths, a PDF-only 100 MiB ceiling, a
//     "+" in the library header, and annotations that actually get saved back
//     into the learner's own object.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  READ_UPLOAD_ANNOTATION_MAX,
  READ_UPLOAD_COLLECTION,
  READ_UPLOAD_MAX_BYTES,
  READ_UPLOAD_PAGE_MAX,
  READ_UPLOAD_STORAGE_ROOT,
  buildReadUploadStoragePath,
  createReadUploadId,
  formatReadUploadSize,
  groupReadUploads,
  isOwnedReadUploadPath,
  isReadUploadFile,
  isReadUploadId,
  parseReadUploadDoc,
  readUploadFileIssue,
  readUploadMetaLabel,
  readUploadModuleDraft,
  readUploadModuleNames,
  readUploadPageLabel,
  readUploadSyncLabel,
  sanitizeReadUploadModule,
  sanitizeReadUploadName,
  sortReadUploads,
  toFirestoreReadUpload,
} from "../utils/readUploads.js";

const read = (path) => readFileSync(path, "utf8");

const UID = "user-abc123";
const OBJECT_NAME = "pdf-abc123-1a2b3c4d-physics-notes.pdf";
const STORAGE_PATH = `${READ_UPLOAD_STORAGE_ROOT}/${UID}/${OBJECT_NAME}`;
const DOWNLOAD_URL = `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(STORAGE_PATH)}?alt=media&token=token-1`;

const makeRow = (overrides = {}) => ({
  id: "pdf-abc123",
  uid: UID,
  name: "Physics Notes.pdf",
  module: "Physics",
  storagePath: STORAGE_PATH,
  url: DOWNLOAD_URL,
  sizeBytes: 3_400_000,
  pageCount: 12,
  lastPage: 4,
  hasAnnotations: true,
  annotationCount: 7,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000,
  lastOpenedAt: 1_700_000_500_000,
  annotatedAt: 1_700_000_400_000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Model: ids, names, modules, paths
// ---------------------------------------------------------------------------

test("upload ids are Firestore-safe, bounded and never blank", () => {
  for (let index = 0; index < 25; index += 1) {
    const id = createReadUploadId("Physics Notes.pdf");
    assert.equal(isReadUploadId(id), true, id);
    assert.ok(id.length <= 120);
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9-]{5,119}$/);
  }
  // A hostile seed cannot smuggle a slash, a dot-segment or a quote into the id.
  const hostile = createReadUploadId("../../users/other/secret.pdf");
  assert.equal(isReadUploadId(hostile), true);
  assert.doesNotMatch(hostile, /[./]/);
  assert.equal(isReadUploadId("short"), false);
  assert.equal(isReadUploadId("has space here"), false);
  assert.equal(isReadUploadId(""), false);
  assert.equal(isReadUploadId("___illegal___"), false);
});

test("names and module labels are trimmed, collapsed and clamped", () => {
  assert.equal(sanitizeReadUploadName("   Physics   Notes.pdf  "), "Physics Notes.pdf");
  assert.equal(sanitizeReadUploadName(""), "My PDF");
  assert.equal(sanitizeReadUploadName(null), "My PDF");
  assert.equal(sanitizeReadUploadName("x".repeat(400)).length, 160);
  assert.equal(sanitizeReadUploadModule("  Chemistry  "), "Chemistry");
  assert.equal(sanitizeReadUploadModule("   "), "");
  assert.equal(sanitizeReadUploadModule("m".repeat(200)).length, 60);
});

test("the Storage object lives inside the learner's own folder and keeps one object per upload", () => {
  const path = buildReadUploadStoragePath(UID, "pdf-abc123", "Physics Notes.pdf");
  assert.equal(path, `${READ_UPLOAD_STORAGE_ROOT}/${UID}/pdf-abc123-physics-notes.pdf`);
  assert.equal(isOwnedReadUploadPath(path, UID), true);
  // A second save of the SAME document overwrites the same object.
  assert.equal(buildReadUploadStoragePath(UID, "pdf-abc123", "Physics Notes.pdf"), path);
  // Another learner, another shape, another root: all refused.
  assert.equal(isOwnedReadUploadPath(path, "someone-else"), false);
  assert.equal(isOwnedReadUploadPath(`adminProductContent/read/p1/res-1.pdf`, UID), false);
  assert.equal(isOwnedReadUploadPath(`${READ_UPLOAD_STORAGE_ROOT}/${UID}/notes.txt`, UID), false);
  assert.equal(isOwnedReadUploadPath(`${READ_UPLOAD_STORAGE_ROOT}/${UID}/a/b.pdf`, UID), false);
  assert.equal(isOwnedReadUploadPath(`${READ_UPLOAD_STORAGE_ROOT}/${UID}`, UID), false);
  assert.equal(buildReadUploadStoragePath("", "pdf-abc123", "x.pdf"), "");
  assert.equal(buildReadUploadStoragePath(UID, "no", "x.pdf"), "");
});

// ---------------------------------------------------------------------------
// Model: what the picker accepts, and what it says when it refuses
// ---------------------------------------------------------------------------

test("only real PDFs inside the ceiling are accepted, and every refusal has a sentence", () => {
  assert.equal(isReadUploadFile({ name: "a.pdf", type: "application/pdf", size: 1024 }), true);
  assert.equal(isReadUploadFile({ name: "a.PDF", type: "", size: 1024 }), true);
  assert.equal(isReadUploadFile(null), false);
  assert.equal(isReadUploadFile({ name: "a.png", type: "image/png", size: 1024 }), false);
  assert.equal(isReadUploadFile({ name: "a.pdf", type: "application/pdf", size: READ_UPLOAD_MAX_BYTES + 1 }), false);

  assert.equal(readUploadFileIssue({ name: "a.pdf", type: "application/pdf", size: 1024 }), "");
  assert.match(readUploadFileIssue({ name: "a.png", type: "image/png", size: 10 }), /Only PDF/);
  assert.match(readUploadFileIssue({ name: "a.pdf", type: "application/pdf", size: 0 }), /empty/);
  assert.match(readUploadFileIssue({ name: "big.pdf", type: "application/pdf", size: READ_UPLOAD_MAX_BYTES + 5 }), /100 MB/);
  assert.match(readUploadFileIssue(null), /Choose a PDF/);
});

// ---------------------------------------------------------------------------
// Model: the Firestore payload ↔ the document the UI reads back
// ---------------------------------------------------------------------------

test("the Firestore payload is exactly what the rules validate", () => {
  const payload = toFirestoreReadUpload({
    uid: UID,
    uploadId: "pdf-abc123",
    name: "  Physics Notes.pdf ",
    module: "Physics",
    storagePath: STORAGE_PATH,
    url: DOWNLOAD_URL,
    sizeBytes: 3_400_000,
    pageCount: 12,
    lastPage: 400,
    hasAnnotations: true,
    annotationCount: 7,
  });
  assert.equal(payload.uid, UID);
  assert.equal(payload.uploadId, "pdf-abc123");
  assert.equal(payload.name, "Physics Notes.pdf");
  assert.equal(payload.module, "Physics");
  assert.equal(payload.storagePath, STORAGE_PATH);
  assert.equal(payload.url, DOWNLOAD_URL);
  assert.equal(payload.contentType, "application/pdf");
  assert.equal(payload.sizeBytes, 3_400_000);
  assert.equal(payload.pageCount, 12);
  assert.equal(payload.lastPage, 400); // clamped to the page cap, never 0
  assert.equal(payload.hasAnnotations, true);
  assert.equal(payload.annotationCount, 7);
  assert.ok(payload.updatedAt > 0);
  // `annotatedAt` only exists once an annotation pass was actually saved.
  assert.equal("annotatedAt" in toFirestoreReadUpload({ uid: UID, uploadId: "pdf-abc123" }), false);

  // Every number is clamped, and a non-PDF contentType can never be written.
  const clamped = toFirestoreReadUpload({
    uid: UID,
    uploadId: "pdf-abc123",
    sizeBytes: READ_UPLOAD_MAX_BYTES * 10,
    pageCount: READ_UPLOAD_PAGE_MAX + 999,
    lastPage: -5,
    annotationCount: READ_UPLOAD_ANNOTATION_MAX + 10,
    contentType: "text/html",
  });
  assert.equal(clamped.sizeBytes, READ_UPLOAD_MAX_BYTES);
  assert.equal(clamped.pageCount, READ_UPLOAD_PAGE_MAX);
  assert.equal(clamped.lastPage, 1);
  assert.equal(clamped.annotationCount, READ_UPLOAD_ANNOTATION_MAX);
  assert.equal(clamped.contentType, "application/pdf");
});

test("parsing refuses anything that is not this learner's own upload", () => {
  const row = parseReadUploadDoc({ ...makeRow() }, UID);
  assert.ok(row);
  assert.equal(row.id, "pdf-abc123");
  assert.equal(row.lastPage, 4);
  assert.equal(row.hasAnnotations, true);

  // The last page can never point past the document's own page count.
  assert.equal(parseReadUploadDoc({ ...makeRow({ lastPage: 999 }) }, UID).lastPage, 12);
  // Wrong folder, wrong root, foreign uid, missing url, bad id: all refused.
  assert.equal(parseReadUploadDoc({ ...makeRow({ storagePath: `adminProductContent/read/p1/res-1.pdf` }) }, UID), null);
  assert.equal(parseReadUploadDoc({ ...makeRow({ storagePath: `${READ_UPLOAD_STORAGE_ROOT}/other-user/x.pdf` }) }, UID), null);
  assert.equal(parseReadUploadDoc({ ...makeRow({ url: "" }) }, UID), null);
  assert.equal(parseReadUploadDoc({ ...makeRow({ id: "../escape" }) }, UID), null);
  assert.equal(parseReadUploadDoc(null, UID), null);
  assert.equal(parseReadUploadDoc("not a document", UID), null);
  // A hand-edited document cannot dent the library: values are clamped, not thrown.
  const messy = parseReadUploadDoc(
    { id: "pdf-abc123", uid: UID, storagePath: STORAGE_PATH, url: DOWNLOAD_URL, sizeBytes: -1, pageCount: "x", hasAnnotations: "yes" },
    UID,
  );
  assert.equal(messy.sizeBytes, 0);
  assert.equal(messy.pageCount, 0);
  assert.equal(messy.hasAnnotations, false);
  assert.equal(messy.lastPage, 1);
});

// ---------------------------------------------------------------------------
// Model: ordering, grouping, labels
// ---------------------------------------------------------------------------

test("the library sorts by activity and groups by the learner's own module label", () => {
  const rows = [
    makeRow({ id: "pdf-oldest", module: "Zoology", updatedAt: 10 }),
    makeRow({ id: "pdf-newest", module: "Physics", updatedAt: 30 }),
    makeRow({ id: "pdf-middle", module: "", updatedAt: 20 }),
  ];
  assert.deepEqual(sortReadUploads(rows).map((row) => row.id), ["pdf-newest", "pdf-middle", "pdf-oldest"]);

  const groups = groupReadUploads(rows);
  // The unlabelled bucket is first, the learner's own module names follow A→Z.
  assert.deepEqual(groups.map((group) => group.module), ["", "Physics", "Zoology"]);
  assert.deepEqual(groups[0].items.map((row) => row.id), ["pdf-middle"]);
  assert.deepEqual(readUploadModuleNames(rows), ["Physics", "Zoology"]);
  assert.deepEqual(groupReadUploads(null), []);
});

test("labels read like a student wrote them", () => {
  assert.equal(formatReadUploadSize(0), "PDF");
  assert.equal(formatReadUploadSize(880 * 1024), "880 KB");
  assert.equal(formatReadUploadSize(3.4 * 1024 * 1024), "3.4 MB");
  assert.equal(formatReadUploadSize(24 * 1024 * 1024), "24 MB");
  assert.equal(readUploadMetaLabel({ pageCount: 12, sizeBytes: 3_400_000 }), "12 pages · 3.2 MB");
  assert.equal(readUploadMetaLabel({ pageCount: 12, sizeBytes: 3_670_016 }), "12 pages · 3.5 MB");
  assert.equal(readUploadMetaLabel({ pageCount: 1, sizeBytes: 1024 }), "1 page · 1 KB");
  assert.equal(readUploadPageLabel({ pageCount: 12, lastPage: 4 }), "Page 4 of 12");
  assert.equal(readUploadPageLabel({ pageCount: 12, lastPage: 1 }), "");
  assert.equal(readUploadSyncLabel("saving"), "Saving annotations…");
  assert.equal(readUploadSyncLabel("saved"), "Annotations saved");
  assert.equal(readUploadSyncLabel("dirty"), "Unsaved annotations");
  assert.match(readUploadSyncLabel("error"), /stay on this device/);
  assert.equal(readUploadSyncLabel("idle"), "");
});

test("a row becomes a My Study Library `read` draft, or nothing at all", () => {
  const draft = readUploadModuleDraft(makeRow());
  assert.ok(draft);
  assert.equal(draft.type, "read");
  assert.equal(draft.name, "Physics Notes.pdf");
  assert.equal(draft.readSourceKind, "upload");
  assert.equal(draft.readStoragePath, STORAGE_PATH);
  assert.equal(draft.readFileSize, 3_400_000);
  assert.equal(draft.url, DOWNLOAD_URL);
  // Off-shape rows never become a resource pointing at someone else's object.
  assert.equal(readUploadModuleDraft(makeRow({ storagePath: `${READ_UPLOAD_STORAGE_ROOT}/other/x.pdf` })), null);
  assert.equal(readUploadModuleDraft(makeRow({ url: "" })), null);
  assert.equal(readUploadModuleDraft(null), null);
});

// ---------------------------------------------------------------------------
// Contract: rules
// ---------------------------------------------------------------------------

test("firestore.rules ships an owner-only readUploads block with the same ceilings", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/readUploads\/\{uploadId\} \{/);
  assert.match(rules, /request\.resource\.data\.uploadId == uploadId/);
  assert.match(rules, /uploadId\.matches\('\^\[A-Za-z0-9\]\[A-Za-z0-9-\]\{5,119\}\$'\)/);
  assert.match(rules, /request\.resource\.data\.storagePath\.split\('\/'\)\[1\] == uid/);
  assert.match(rules, /request\.resource\.data\.storagePath\.split\('\/'\)\[0\] == 'userReadUploads'/);
  assert.match(rules, /request\.resource\.data\.sizeBytes <= 104857600/);
  assert.match(rules, /request\.resource\.data\.pageCount <= 20000/);
  assert.match(rules, /request\.resource\.data\.annotationCount <= 100000/);
  assert.match(rules, /request\.resource\.data\.contentType == 'application\/pdf'/);
  // The reserved privileged fields stay unreachable from a learner write.
  assert.match(rules, /role', 'status', 'purchasedProductIds'/);
  assert.equal(READ_UPLOAD_MAX_BYTES, 104857600);
  assert.equal(READ_UPLOAD_PAGE_MAX, 20000);
  assert.equal(READ_UPLOAD_ANNOTATION_MAX, 100000);
});

test("storage.rules lets only the owner write a PDF under userReadUploads", () => {
  const rules = read("storage.rules");
  assert.match(rules, /match \/userReadUploads\/\{uid\}\/\{fileName\} \{/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /request\.resource\.size < 100 \* 1024 \* 1024/);
  assert.match(rules, /request\.resource\.contentType == 'application\/pdf'/);
  assert.match(rules, /fileName\.matches\('\^\[A-Za-z0-9\._-\]\+\[\.\]pdf\$'\)/);
});

test("the Sketch library document is owner-only too (one per learner)", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/sketchLibraries\/\{libraryId\} \{/);
  assert.match(rules, /libraryId == 'main'/);
  assert.match(rules, /request\.resource\.data\.items is string/);
  assert.match(rules, /request\.resource\.data\.items\.size\(\) <= 900000/);
  assert.match(rules, /request\.resource\.data\.itemCount <= 500/);
});

// ---------------------------------------------------------------------------
// Contract: the runtime pieces
// ---------------------------------------------------------------------------

test("the hook watches the learner's own collection and writes only owner-scoped paths", () => {
  const hook = read("src/course/useReadUploads.ts");
  assert.match(hook, /collection\(db, "users", uid, READ_UPLOAD_COLLECTION\)/);
  assert.match(hook, /buildReadUploadStoragePath\(owner, uploadId, file\.name\)/);
  assert.match(hook, /uploadBytesResumable/);
  assert.match(hook, /getDownloadURL/);
  assert.match(hook, /setDoc\(doc\(db, "users", owner, READ_UPLOAD_COLLECTION, uploadId\)/);
  assert.match(hook, /toFirestoreReadUpload\(/);
  assert.match(hook, /saveAnnotations/);
  assert.match(hook, /recordActivity/);
  // The annotation save writes the annotated bytes back over the SAME object.
  assert.match(hook, /uploadBytes\(target, bytes, \{ contentType: "application\/pdf" \}\)/);
});

test("the Read library wears the header '+' and the separate Your annotations section", () => {
  const panel = read("src/course/ReadLibraryPanel.tsx");
  assert.match(panel, /data-course-read-upload/);
  assert.match(panel, /type="file"/);
  assert.match(panel, /accept="application\/pdf,\.pdf"/);
  assert.match(panel, /Your annotations/);
  assert.match(panel, /data-course-read-mine/);
  // "+" lives in the header row, top-right: the count badge comes before it
  // and the button is pushed right with ml-auto.
  const header = panel.slice(panel.indexOf("Read library"), panel.indexOf("course-read-search"));
  assert.match(header, /ml-auto/);
  assert.match(header, /data-course-read-upload/);
  // A learner row hands the file to the module dialog and can be deleted.
  assert.match(panel, /data-course-read-add-to-module/);
  assert.match(panel, /onAddToModule/);
  assert.match(panel, /data-course-read-upload-input/);
});

test("the annotation bridge saves the viewer's own bytes and reports the learner's position", () => {
  const viewer = read("src/course/PdfJsGenericViewer.tsx");
  assert.match(viewer, /export interface PdfAnnotationApi/);
  assert.match(viewer, /saveAnnotatedBytes/);
  assert.match(viewer, /saveDocument\(\)/);
  assert.match(viewer, /onAnnotationApi/);
  assert.match(viewer, /annotationStorage/);
  assert.match(viewer, /isDirty/);
  const panel = read("src/course/ReadLibraryPanel.tsx");
  assert.match(panel, /api\.saveAnnotatedBytes\(\)/);
  assert.match(panel, /saveAnnotations\(/);
  assert.match(panel, /onAnnotationApi=/);
  assert.match(panel, /recordActivity/);
});
