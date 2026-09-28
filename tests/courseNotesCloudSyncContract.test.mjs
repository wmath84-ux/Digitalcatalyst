// tests/courseNotesCloudSyncContract.test.mjs
//
// "Sanctuary ke andar jo notes aur mind map hai vah save ho — abhi save nahin
// ho rahe. Sab Firebase par properly saved aur render hone chahiye."
//
// ROOT CAUSE (notes): notes were never written to Firebase at all.
// `src/course/notesStore.ts` stored the whole list in `localStorage` under
// `dc.courseNotes.{uid}.{productId}` and that was the end of it — the Course
// Player and the Sanctuary note board both read and wrote that one key. The
// type comment in `src/types/course.ts` even promised "Multi-device sync is
// automatic via the Firestore listener", but no listener, no collection and no
// rule existed. A note taken inside the 3D Sanctuary therefore lived on one
// device in one browser profile, and vanished when site data was cleared.
//
// THE FIX, pinned here:
//   1. one Firestore document per note at `users/{uid}/notes/{noteId}`, read
//      through a LIVE listener, written from the client (so Firestore's offline
//      queue still protects a note typed on a flaky connection);
//   2. `localStorage` demoted to the OFFLINE MIRROR it should always have been,
//      plus tombstones so a delete that never reached the cloud cannot come
//      back on the next snapshot;
//   3. ONE hook (`useCourseNotes`) behind BOTH surfaces — the player's Notes tab
//      and the Sanctuary's note board — so a note written in either place is the
//      same document;
//   4. every note that exists only on the device (written offline, or by the old
//      localStorage-only build) is uploaded on the next open, so nothing already
//      written is lost by the migration;
//   5. firestore.rules carries an owner-scoped `notes` block whose caps are the
//      SAME NUMBERS `utils/courseNotes.js` applies — asserted here by parsing
//      both files, so the client can never build a payload the rules reject.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const hook = read("src/course/useCourseNotes.ts");
const cloud = read("src/course/cloudNotes.ts");
const mirror = read("src/course/notesStore.ts");
const util = read("utils/courseNotes.js");
const player = read("src/CoursePlayerApp.tsx");
const boards = read("src/nature3d/boards/StudyBoards.tsx");
const aiNotes = read("src/ai/aiNotes.ts");
const rules = read("firestore.rules");

const notes = await import("../utils/courseNotes.js");

// ---------------------------------------------------------------------------
// 1. Notes live in Firestore, one document per note, under the owner's path
// ---------------------------------------------------------------------------

test("notes are stored in users/{uid}/notes — one document per note", () => {
  assert.equal(notes.NOTES_COLLECTION, "notes");
  assert.match(cloud, /from "\.\.\/\.\.\/utils\/courseNotes"/);
  assert.match(cloud, /collection\(db, "users", uid, NOTES_COLLECTION\)/);
  assert.match(cloud, /doc\(db, "users", owner, NOTES_COLLECTION, payload\.id\)/);
  assert.match(cloud, /doc\(db, "users", owner, NOTES_COLLECTION, id\)/);
  // Ownership is the PATH: the uid a write may use is the signed-in one, and
  // only when it equals the scope's uid — never a uid from a payload.
  assert.match(cloud, /export const cloudNotesUid = \(uid: string \| null \| undefined\): string \| null =>/);
  assert.match(cloud, /return signedIn && signedIn === wanted \? signedIn : null;/);
});

test("the cloud copy is read through a LIVE listener, with a one-shot fallback", () => {
  assert.match(cloud, /export function subscribeCloudNotes\(/);
  assert.match(cloud, /onSnapshot\(/);
  // A single equality filter needs no composite index — the same trick the
  // mind-map list uses, so the query cannot fail with failed-precondition.
  assert.match(cloud, /where\("productId", "==", String\(productId\)\)/);
  assert.match(cloud, /Equality-only filter: Firestore needs no composite index/);
  // A refused listener falls back to one read instead of stranding the board.
  assert.match(cloud, /void fetchCloudNotes\(owner, String\(productId\)\)/);
});

test("writes are batched, capped and go through one payload builder", () => {
  assert.match(cloud, /const WRITE_CHUNK = 400;/);
  assert.match(cloud, /writeBatch\(db\)/);
  assert.match(cloud, /toFirestoreNote\(note, \{ uid: owner, productId: product \}\)/);
  assert.match(cloud, /slice\(0, MAX_NOTES_PER_COURSE\)/);
});

// ---------------------------------------------------------------------------
// 2. localStorage is the offline mirror, and deletes leave tombstones
// ---------------------------------------------------------------------------

test("localStorage stays as the offline mirror, never as the only copy", () => {
  assert.match(mirror, /Firestore is the source of truth now/);
  assert.match(hook, /loadLocalNotes,/);
  assert.match(hook, /persistLocalNotes,\n\} from "\.\/notesStore";/);
  // The device copy paints first, so the board is never blank while the cloud
  // read is in flight (and works at all with no network).
  assert.match(hook, /const mirrored = loadLocalNotes\(uidText, productText\);/);
  assert.match(hook, /persistLocalNotes\(uidText, productText, next\);/);
  assert.match(hook, /persistLocalNotes\(scope\.uid, scope\.productId, sorted\);/);
});

test("a deleted note leaves a tombstone, so no snapshot can resurrect it", () => {
  assert.match(mirror, /export const notesDeletedKey = \(uid: string, productId: string\) => `dc\.courseNotesDeleted\.v1\.\$\{uid\}\.\$\{productId\}`;/);
  assert.match(mirror, /export const loadDeletedNoteIds/);
  assert.match(mirror, /export const persistDeletedNoteIds/);
  assert.match(hook, /deletedRef\.current\.add\(noteId\);/);
  assert.match(hook, /persistDeletedNoteIds\(scope\.uid, scope\.productId, Array\.from\(deletedRef\.current\)\);/);
  // The delete is committed immediately, not after the debounce window.
  assert.match(hook, /if \(scope\.scoped\) flushRef\.current\(\);/);
  // …and the tombstone is cleared only once Firestore confirms the delete.
  assert.match(hook, /const remaining = loadDeletedNoteIds\(scope\.uid, scope\.productId\)\.filter\(/);
});

// ---------------------------------------------------------------------------
// 3. ONE hook behind both surfaces
// ---------------------------------------------------------------------------

test("the Course Player's Notes tab uses the cloud hook, not the local store", () => {
  assert.match(player, /import useCourseNotes from "\.\/course\/useCourseNotes";/);
  assert.match(player, /const notesCtl = useCourseNotes\(\{ uid: user\?\.id \?\? null, productId: storageProductId \}\);/);
  assert.match(player, /const notes = notesCtl\.notes;/);
  assert.match(player, /notesCtl\.add\(safeHtml/);
  assert.match(player, /notesCtl\.edit\(id, safeHtml\);/);
  assert.match(player, /notesCtl\.remove\(id\);/);
  assert.match(player, /notesCtl\.link\(sourceId, nextLinks\);/);
  // The old device-only writes are gone from the player: nothing may persist a
  // note list that never reaches Firebase.
  assert.doesNotMatch(player, /persistLocalNotes\(/);
  assert.doesNotMatch(player, /loadLocalNotes\(/);
  assert.doesNotMatch(player, /setNotes\(/);
});

test("the Sanctuary note board uses the SAME hook, so both write one document", () => {
  assert.match(boards, /import useCourseNotes from "\.\.\/\.\.\/course\/useCourseNotes";/);
  assert.match(boards, /function useBoardNotes\(uid: string \| null, productId: string \| null\)/);
  assert.match(boards, /const notes = useBoardNotes\(uid, productId\);/);
  assert.match(boards, /useCourseNotes\(\{\n\s*uid,\n\s*productId,\n\s*\}\)/);
  assert.doesNotMatch(boards, /persistLocalNotes\(/);
  // Still the player's own panel, unmodified — the brief never changed.
  assert.match(boards, /import NotesPanel from "\.\.\/\.\.\/course\/NotesPanel"/);
  assert.match(boards, /notes=\{activeCourse \? notes\.notes : EMPTY_NOTES\}/);
});

test("an AI-saved note reaches the cloud too, not just the device", () => {
  assert.match(aiNotes, /import \{ uploadCloudNotes \} from "\.\.\/course\/cloudNotes";/);
  assert.match(aiNotes, /void uploadCloudNotes\(input\.uid, scope, \[note\]\)/);
});

test("a note left open in the editor when the player closes is rescued to the cloud", () => {
  assert.match(player, /import \{ appendCloudNote, patchCloudNote \} from "\.\/course\/cloudNotes";/);
  assert.match(player, /appendCloudNote\(user\.id, storageProductId, \{/);
  assert.match(player, /patchCloudNote\(user\.id, storageProductId, sessionNotes\.noteId, safeHtml\);/);
  // The helpers write the mirror synchronously and then the cloud, because the
  // hook has already flushed and unmounted by the time this cleanup runs.
  assert.match(cloud, /export function appendCloudNote\(/);
  assert.match(cloud, /export function patchCloudNote\(/);
  assert.match(cloud, /persistLocalNotes\(owner, product, \[record, \.\.\.existing\]\);/);
});

// ---------------------------------------------------------------------------
// 4. Migration + resilience
// ---------------------------------------------------------------------------

test("anything that exists only on the device is uploaded — old notes migrate", () => {
  assert.match(hook, /for \(const id of merged\.pendingUploads\) dirtyRef\.current\.add\(id\);/);
  assert.match(hook, /if \(merged\.pendingUploads\.length \|\| merged\.pendingDeletes\.length\) scheduleRef\.current\?\.\(\);/);
});

test("a failed cloud write retries with backoff and says what actually failed", () => {
  assert.match(hook, /const MAX_SYNC_ATTEMPTS = 8;/);
  assert.match(hook, /const delay = Math\.min\(20000, 700 \* 2 \*\* Math\.min\(attemptRef\.current, 5\)\);/);
  // The work goes BACK into the queue on failure — never dropped.
  assert.match(hook, /for \(const note of uploads\) dirtyRef\.current\.add\(note\.id\);/);
  assert.match(hook, /for \(const id of deletes\) deletedRef\.current\.add\(id\);/);
  assert.match(cloud, /export const describeNotesError = \(error: unknown\): string =>/);
  assert.match(cloud, /permission-denied/);

  // A retry may never outlive the hook. The FINAL flush (unmount / tab close /
  // page hide) marks the controller disposed first, so a failure THERE cannot
  // re-arm a loop on a board nobody is looking at — that loop is what kept a
  // dead controller waking itself for ~30s (and pinned the test runner open).
  // tests/courseNotesCloudSyncRuntime.test.mjs proves the behaviour; this pins
  // the wiring.
  assert.match(hook, /const disposedRef = useRef\(false\);/);
  assert.match(hook, /const scheduleRetry = useCallback\(\(delayMs: number, run: \(\) => void\) => \{\n\s*if \(disposedRef\.current\) return;/);
  assert.match(hook, /retryRef\.current = setTimeout\(\(\) => \{\n\s*retryRef\.current = null;\n\s*if \(disposedRef\.current\) return;\n\s*run\(\);/);
  // The three failure paths (no verified owner / write failed / listener
  // refused) all go through that one guarded scheduler.
  assert.equal(hook.match(/scheduleRetry\(/g)?.length, 3);
  assert.match(hook, /const scheduleRetry = useCallback/);
  assert.doesNotMatch(hook, /retryRef\.current = setTimeout\(\(\) => \{\n\s*retryRef\.current = null;\n\s*flushRef\.current\(\);/);
});

test("pending notes are flushed when the learner leaves, hides the tab or unmounts", () => {
  assert.match(hook, /document\.addEventListener\("visibilitychange", onLeave\);/);
  assert.match(hook, /window\.addEventListener\("pagehide", onLeave\);/);
  assert.match(hook, /flushRef\.current\(\);\n\s*\};\n\s*\}, \[\]\);/);
  // Disposed BEFORE that final flush, and cleared on every (re)setup so a
  // StrictMode remount of the same instance is not left unable to retry.
  assert.match(hook, /disposedRef\.current = true;\n[\s\S]{0,500}flushRef\.current\(\);/);
  assert.match(hook, /disposedRef\.current = false;/);
  assert.ok(hook.indexOf("disposedRef.current = false;") < hook.indexOf("disposedRef.current = true;"));
});

test("an empty course id is not a scope, so notes can never pool together", () => {
  assert.match(hook, /const scoped = Boolean\(uid\) && productId != null && String\(productId\)\.length > 0;/);
});

// ---------------------------------------------------------------------------
// 5. firestore.rules — owner-scoped, and capped with the client's own numbers
// ---------------------------------------------------------------------------

const rulesBlock = () => {
  const start = rules.indexOf("match /notes/{noteId} {");
  assert.ok(start > 0, "firestore.rules has no users/{uid}/notes block");
  return rules.slice(start, start + 2600);
};

test("firestore.rules has an owner-scoped notes block inside users/{uid}", () => {
  const block = rulesBlock();
  // It sits under `match /users/{uid}` (the block above it is driveCopies).
  const usersAt = rules.indexOf("match /users/{uid} {");
  assert.ok(usersAt > 0 && usersAt < rules.indexOf("match /notes/{noteId} {"));
  assert.match(block, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(block, /allow create, update: if isOwner\(uid\)/);
  assert.match(block, /request\.resource\.data\.uid == uid/);
  // The document id must equal the id inside it, so a browser cannot choose an
  // id that lands in somebody else's namespace.
  assert.match(block, /request\.resource\.data\.id == noteId/);
  assert.match(block, /allow delete: if isOwner\(uid\) \|\| isAdmin\(\);/);
  // No privilege field may ride along in a note document.
  assert.match(block, /!request\.resource\.data\.keys\(\)\.hasAny\(\['role', 'status', 'purchasedProductIds'/);
});

test("the rules' caps are the SAME numbers the client applies", () => {
  const block = rulesBlock();
  const ruleCap = (field) => {
    const match = block.match(new RegExp(`request\\.resource\\.data\\.${field}\\.size\\(\\) <= (\\d+)`));
    assert.ok(match, `rules do not cap ${field}`);
    return Number(match[1]);
  };
  assert.equal(ruleCap("html"), notes.MAX_NOTE_HTML_LENGTH);
  assert.equal(ruleCap("text"), notes.MAX_NOTE_TEXT_LENGTH);
  assert.equal(ruleCap("productId"), notes.MAX_NOTE_PRODUCT_ID_LENGTH);
  const linksCap = block.match(/request\.resource\.data\.links\.size\(\) <= (\d+)/);
  assert.ok(linksCap, "rules do not cap links");
  assert.equal(Number(linksCap[1]), notes.MAX_NOTE_LINKS);
  // And the client really does clamp to those numbers before writing.
  assert.match(util, /export const MAX_NOTE_HTML_LENGTH = 60000;/);
  assert.match(util, /\.slice\(0, MAX_NOTE_HTML_LENGTH\)/);
  assert.match(util, /\.slice\(0, MAX_NOTE_LINKS\)/);
  assert.match(util, /slice\(0, MAX_NOTE_PRODUCT_ID_LENGTH\)/);
});

// ---------------------------------------------------------------------------
// 6. Runtime: the merge / link / delete rules themselves
// ---------------------------------------------------------------------------

test("the newer edit wins, and the cloud wins a tie", () => {
  const cloud = [{ id: "a", html: "cloud", createdAt: 10, updatedAt: 20 }];
  const olderLocal = [{ id: "a", html: "local", createdAt: 10, updatedAt: 15 }];
  assert.equal(notes.mergeNoteSets(cloud, olderLocal).notes[0].html, "cloud");

  const newerLocal = [{ id: "a", html: "local", createdAt: 10, updatedAt: 25 }];
  const merged = notes.mergeNoteSets(cloud, newerLocal);
  assert.equal(merged.notes[0].html, "local");
  assert.deepEqual(merged.pendingUploads, ["a"]);
});

test("a device-only note is kept AND queued for upload", () => {
  const merged = notes.mergeNoteSets([], [{ id: "b", html: "offline", createdAt: 5 }]);
  assert.equal(merged.notes.length, 1);
  assert.deepEqual(merged.pendingUploads, ["b"]);
});

test("a tombstoned note never comes back from the cloud", () => {
  const merged = notes.mergeNoteSets(
    [{ id: "gone", html: "cloud", createdAt: 5 }],
    [{ id: "gone", html: "device", createdAt: 5 }],
    ["gone"],
  );
  assert.equal(merged.notes.length, 0);
  assert.deepEqual(merged.pendingDeletes, ["gone"]);
});

test("deleting a note prunes every wire pointing at it and reports the writes", () => {
  const result = notes.removeNoteFromSet(
    [{ id: "a", links: [] }, { id: "b", links: ["a"] }, { id: "c", links: ["a", "b"] }],
    "a",
  );
  assert.deepEqual(result.notes.map((note) => note.id), ["b", "c"]);
  assert.deepEqual(result.notes[0].links, []);
  assert.deepEqual(result.notes[1].links, ["b"]);
  assert.deepEqual(result.changed.sort(), ["b", "c"]);
});

test("a link edit is symmetric and only the touched notes are written", () => {
  const result = notes.applyNoteLinks(
    [{ id: "a", links: ["c"] }, { id: "b", links: [] }, { id: "c", links: ["a"] }],
    "a",
    ["b"],
  );
  const byId = Object.fromEntries(result.notes.map((note) => [note.id, note.links]));
  assert.deepEqual(byId.a, ["b"]);
  assert.deepEqual(byId.b, ["a"]);
  assert.deepEqual(byId.c, []);
  assert.deepEqual(result.changed.sort(), ["a", "b", "c"]);
  // A link to a note that does not exist is dropped, and self-links are gone.
  const junk = notes.applyNoteLinks([{ id: "a", links: [] }], "a", ["a", "ghost"]);
  assert.deepEqual(junk.notes[0].links, []);
});

test("the Firestore payload always carries every key the rules validate", () => {
  const payload = notes.toFirestoreNote({ id: "n1", html: "<p>hi</p>" }, { uid: "u1", productId: "mine-c1" });
  for (const key of [
    "id", "uid", "productId", "html", "text", "links", "createdAt", "updatedAt",
    "moduleId", "resourceId", "aiGenerated", "personalModuleId", "personalResourceId",
    "schemaVersion",
  ]) {
    assert.ok(key in payload, `payload is missing ${key} — the rules would reject it`);
    assert.notEqual(payload[key], undefined, `${key} must never be undefined`);
  }
  assert.equal(payload.uid, "u1");
  assert.equal(payload.productId, "mine-c1");
  assert.equal(payload.schemaVersion, notes.NOTES_SCHEMA_VERSION);
});

test("an oversized note is clamped by the client, so the rules never have to refuse it", () => {
  const huge = "x".repeat(notes.MAX_NOTE_HTML_LENGTH + 5000);
  const payload = notes.toFirestoreNote({ id: "n2", html: huge, text: huge }, { uid: "u", productId: "p" });
  assert.equal(payload.html.length, notes.MAX_NOTE_HTML_LENGTH);
  assert.equal(payload.text.length, notes.MAX_NOTE_TEXT_LENGTH);
  const manyLinks = Array.from({ length: notes.MAX_NOTE_LINKS + 20 }, (_, index) => `n${index}`);
  assert.equal(notes.toFirestoreNote({ id: "n3", links: manyLinks }, { uid: "u", productId: "p" }).links.length, notes.MAX_NOTE_LINKS);
});

test("ids and product scopes are normalised on both sides of the merge", () => {
  assert.equal(notes.sanitizeNoteId("note/with spaces!"), "note-with-spaces-");
  assert.equal(notes.sanitizeProductId("mine-course_1"), "mine-course_1");
  // A legacy id and its cloud copy key on the SAME id after normalisation.
  const merged = notes.mergeNoteSets(
    [{ id: "a b", html: "cloud", createdAt: 1 }],
    [{ id: "a-b", html: "device", createdAt: 1 }],
  );
  assert.equal(merged.notes.length, 1);
});
