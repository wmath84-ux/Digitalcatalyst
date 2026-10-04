// tests/readUploadToModule.test.mjs
//
// "Your annotations" → the learner's OWN module.
//
// A learner uploads a PDF in the Read tab; the same row can then be saved into
// a course they built in My Study Library. That only works end to end if a
// `read` resource may point at the learner's own Storage tree
// (`userReadUploads/{uid}/…`), so this file proves the resolution at runtime
// and pins the wiring that carries the file from the library into the module
// and back into the annotated viewer.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  collectAccessibleReadResources,
  getReadResourcePresentation,
  isOwnedLearnerReadUploadPath,
  isOwnedReadUploadPath,
  normalizeReadResourceUrl,
} from "../utils/readResources.js";

const read = (path) => readFileSync(path, "utf8");

const UID = "user-abc123";
const LEARNER_PATH = `userReadUploads/${UID}/pdf-abc123-1a2b3c4d-physics-notes.pdf`;
const URL = `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(LEARNER_PATH)}?alt=media&token=token-1`;
const MY_PRODUCT_ID = "mine-course-99";

test("the learner's own upload tree is recognised by shape and nothing else", () => {
  assert.equal(isOwnedLearnerReadUploadPath(LEARNER_PATH), true);
  assert.equal(isOwnedLearnerReadUploadPath("userReadUploads/other-user/x.pdf"), true); // ownership is checked by storage.rules
  assert.equal(isOwnedLearnerReadUploadPath("adminProductContent/read/p1/res-1.pdf"), false);
  assert.equal(isOwnedLearnerReadUploadPath("userReadUploads/uid"), false);
  assert.equal(isOwnedLearnerReadUploadPath("userReadUploads/uid/a/b.pdf"), false);
  assert.equal(isOwnedLearnerReadUploadPath(`userReadUploads/${UID}/notes.txt`), false);
  assert.equal(isOwnedLearnerReadUploadPath(`userReadUploads/../${UID}/x.pdf`), false);
  assert.equal(isOwnedLearnerReadUploadPath(""), false);
  // The admin tree check is untouched: a learner's path is NOT an admin upload.
  assert.equal(isOwnedReadUploadPath(LEARNER_PATH, MY_PRODUCT_ID, "res-1"), false);
});

test("a My Study Library read resource resolves to the annotated PDF viewer", () => {
  const file = {
    id: "res-physics",
    name: "Physics Notes.pdf",
    type: "read",
    url: URL,
    readSourceKind: "upload",
    readStoragePath: LEARNER_PATH,
    readFileName: "Physics Notes.pdf",
    readFileSize: 3_400_000,
    accessLevel: "included",
  };

  const presentation = getReadResourcePresentation(file, { productId: MY_PRODUCT_ID });
  assert.ok(presentation);
  assert.equal(presentation.kind, "pdfjs");
  assert.equal(presentation.sourceUrl, URL);
  assert.equal(presentation.sourceKind, "upload");

  // The URL must be the download URL OF that exact object, and the size has to
  // be a real one inside the same ceiling the upload used.
  assert.equal(
    normalizeReadResourceUrl(URL, "upload", { productId: MY_PRODUCT_ID, resourceId: file.id, storagePath: LEARNER_PATH, fileSize: 3_400_000 }),
    URL,
  );
  assert.equal(
    normalizeReadResourceUrl(URL, "upload", { productId: MY_PRODUCT_ID, resourceId: file.id, storagePath: LEARNER_PATH }),
    "",
  );
  assert.equal(
    normalizeReadResourceUrl(URL, "upload", { productId: MY_PRODUCT_ID, resourceId: file.id, storagePath: "userReadUploads/x/other.pdf", fileSize: 10 }),
    "",
  );

  // …and the resource shows up in the Read tab of the learner's own course.
  const modules = [
    { id: "mod-1", title: "Physics", accessLevel: "included", files: [file], modules: [] },
  ];
  const entries = collectAccessibleReadResources(modules, new Set(["mod-1"]), new Set(), MY_PRODUCT_ID);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].resource.id, "res-physics");
  assert.deepEqual(entries[0].modulePath, ["Physics"]);
  // A locked/hidden module still hides it — the library honours access.
  assert.equal(collectAccessibleReadResources(modules, new Set(), new Set(), MY_PRODUCT_ID).length, 0);
});

test("the panel offers the action, the overlay forwards it and the player owns the write", () => {
  const panel = read("src/course/ReadLibraryPanel.tsx");
  assert.match(panel, /export type ReadUploadModuleRequest/);
  assert.match(panel, /onAddToModule\?: ReadUploadModuleRequest;/);
  assert.match(panel, /onClick=\{\(\) => onAddToModule\(row\)\}/);
  assert.match(panel, /data-course-read-add-to-module=\{row\.id\}/);
  assert.match(panel, /Save to my module \(My Study Library\)/);

  const overlay = read("src/course/CourseOverlay.tsx");
  assert.match(overlay, /onAddReadUploadToModule\?: \(row: ReadUpload\) => void;/);
  assert.match(overlay, /onAddToModule=\{props\.onAddReadUploadToModule\}/);

  const player = read("src/CoursePlayerApp.tsx");
  assert.match(player, /import \{ readUploadModuleDraft, type ReadUpload \} from "\.\.\/utils\/readUploads\.js";/);
  assert.match(player, /const addReadUploadToModule = useCallback\(/);
  assert.match(player, /const draft = readUploadModuleDraft\(row\) as OfficialResourceDraft \| null;/);
  assert.match(player, /setOfficialDialogTarget\(draft\);/);
  assert.match(player, /onAddReadUploadToModule=\{addReadUploadToModule\}/);
  // The dialog's own target decides what is written — not the active lesson,
  // so opening it from the Read tab cannot save the wrong file.
  assert.match(player, /const draft = officialDialogTarget;/);
  // The My Course resource keeps the Read provenance.
  assert.match(player, /readSourceKind: draft\.readSourceKind,/);
  assert.match(player, /readStoragePath: draft\.readStoragePath,/);
  assert.match(player, /readFileName: draft\.readFileName \|\| draft\.name,/);
  assert.match(player, /readFileSize: draft\.readFileSize,/);
});

test("a learner-authored `read` resource survives the course document round trip", () => {
  const types = read("src/types/myCourse.ts");
  assert.match(types, /export type MyCourseResourceType = CourseContentFileType \| "read";/);
  assert.match(types, /readSourceKind\?: "upload" \| "gdrive" \| "pdf_url" \| "embed_url";/);
  assert.match(types, /readStoragePath\?: string;/);
  assert.match(types, /readFileName\?: string;/);
  assert.match(types, /readFileSize\?: number;/);

  const client = read("src/lib/myCourseClient.ts");
  assert.match(client, /readSourceKind: READ_SOURCE_KINDS\.includes\(String\(source\.readSourceKind\)\)/);
  assert.match(client, /readStoragePath: typeof source\.readStoragePath === "string"/);
  assert.match(client, /readFileSize:/);
  // `sanitizeMyCourse` spreads each resource, so the Read fields ride along.
  assert.match(client, /resources: module\.resources\.map\(\(resource\) => \(\{/);

  const adapter = read("src/lib/myCourseAdapter.ts");
  assert.match(adapter, /readSourceKind: resource\.readSourceKind,/);
  assert.match(adapter, /readStoragePath: resource\.readStoragePath,/);
  assert.match(adapter, /readFileName: resource\.readFileName,/);
  assert.match(adapter, /readFileSize: resource\.readFileSize,/);

  const dialog = read("src/personal-library/AddOfficialResourceDialog.tsx");
  assert.match(dialog, /type: CourseContentFileType \| "read";/);
  assert.match(dialog, /readSourceKind\?: MyCourseModule\["resources"\]\[number\]\["readSourceKind"\];/);
});
