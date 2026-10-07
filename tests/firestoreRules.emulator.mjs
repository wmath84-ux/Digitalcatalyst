// Intentionally not *.test.mjs: run with npm run test:firestore:rules.
// Uses the REAL deployed-rule syntax and Firestore SDK, never production data.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { toFirestoreNote } from "../utils/courseNotes.js";
import { addChildNode, createMindMap, mindMapDocId, toFirestoreMindMap } from "../utils/mindMapTree.js";
import { buildReadUploadStoragePath, toFirestoreReadUpload } from "../utils/readUploads.js";

let env;
let owner;
let stranger;
const uid = "course-notes-owner";
const scopes = ["purchased-course", "mine-self-authored"];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-digitalcatalyst",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  owner = env.authenticatedContext(uid).firestore();
  stranger = env.authenticatedContext("different-owner").firestore();
});
after(async () => { await env?.cleanup(); });

for (const productId of scopes) {
  test(`normal learner saves, reads, updates and deletes notes in ${productId}`, async () => {
    const id = `note-${productId.replace(/_/g, "-")}`;
    const ref = doc(owner, "users", uid, "notes", id);
    const note = toFirestoreNote({ id, html: "<h1>Revision</h1><p>Saved from the Course Player</p>", text: "Revision Saved from the Course Player", createdAt: 10, links: [] }, { uid, productId });
    await assertSucceeds(setDoc(ref, note));
    assert.equal((await assertSucceeds(getDoc(ref))).data().productId, productId);
    const results = await assertSucceeds(getDocs(query(collection(owner, "users", uid, "notes"), where("productId", "==", productId))));
    assert.ok(results.docs.some((row) => row.id === id));
    await assertFails(getDoc(doc(stranger, "users", uid, "notes", id)));
    await assertFails(setDoc(doc(stranger, "users", uid, "notes", id), note));
    await assertSucceeds(setDoc(ref, { ...note, html: "<p>Edited</p>", text: "Edited", updatedAt: 11 }));
    await assertSucceeds(deleteDoc(ref));
  });

  test(`normal learner round-trips main and additional maps in ${productId}`, async () => {
    const mind = addChildNode(createMindMap("Main topic"), "root", "Saved branch").mind;
    for (const mapKey of ["main", "second-map"]) {
      const id = mindMapDocId(uid, productId, "course", mapKey);
      const ref = doc(owner, "users", uid, "mindMaps", id);
      const payload = toFirestoreMindMap(mind, { uid, productId, moduleId: "course", mapKey, updatedAt: 10 });
      await assertSucceeds(setDoc(ref, payload));
      assert.equal((await assertSucceeds(getDoc(ref))).data().nodes[0].topic, "Saved branch");
      await assertFails(setDoc(doc(stranger, "users", uid, "mindMaps", id), payload));
      await assertFails(setDoc(ref, { ...payload, uid: "different-owner" }));
      await assertFails(setDoc(ref, { ...payload, mapKey: "wrong-key" }));
      await assertSucceeds(deleteDoc(ref));
    }
  });
}

test("note link validation accepts the exact 50-item cap and rejects invalid elements at every boundary", async () => {
  const note = toFirestoreNote({ id: "link-validation", text: "Links", html: "<p>Links</p>", createdAt: 1, links: [] }, { uid, productId: scopes[0] });
  const ref = doc(owner, "users", uid, "notes", note.id);
  const links = Array.from({ length: 50 }, (_, i) => `note-${i}`);
  await assertSucceeds(setDoc(ref, { ...note, links }));
  await assertFails(setDoc(ref, { ...note, links: [...links, "too-many"] }));
  for (const i of [0, 24, 49]) {
    const malformed = [...links];
    malformed[i] = 123;
    await assertFails(setDoc(ref, { ...note, links: malformed }));
    malformed[i] = "x".repeat(81);
    await assertFails(setDoc(ref, { ...note, links: malformed }));
  }
  await assertFails(setDoc(ref, { ...note, role: "admin" }));
  await assertFails(setDoc(ref, { ...note, productId: "" }));
});

test("mixed revision parent validation still rejects deleted parents (valid Rules syntax, no JS lambdas)", async () => {
  const ref = doc(owner, "users", uid, "revisionSessions", "mixed");
  const payload = { uid, testKey: "0", parentTestKeys: ["100", "101"], session: {}, answers: [] };
  await assertSucceeds(setDoc(ref, payload));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid, "revisionDeletedTests", "101"), { uid });
  });
  await assertFails(setDoc(ref, payload));
  await assertFails(setDoc(ref, { ...payload, parentTestKeys: ["100", 101] }));
});

test("a learner's own Read upload is owner-only, and its document must describe an owned PDF", async () => {
  const uploadId = "pdf-emulator-1";
  const storagePath = buildReadUploadStoragePath(uid, uploadId, "Physics Notes.pdf");
  const payload = toFirestoreReadUpload({
    uid,
    uploadId,
    name: "Physics Notes.pdf",
    module: "Physics",
    storagePath,
    url: "https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/owned.pdf?alt=media&token=t",
    sizeBytes: 2048,
    pageCount: 12,
    lastPage: 3,
    hasAnnotations: false,
    annotationCount: 0,
    createdAt: 10,
    updatedAt: 11,
  });
  const ref = doc(owner, "users", uid, "readUploads", uploadId);
  await assertSucceeds(setDoc(ref, payload));
  assert.equal((await assertSucceeds(getDoc(ref))).data().module, "Physics");

  // Somebody else can never read or write it.
  await assertFails(getDoc(doc(stranger, "users", uid, "readUploads", uploadId)));
  await assertFails(setDoc(doc(stranger, "users", uid, "readUploads", uploadId), payload));

  // Ownership is re-derived from the PATH, never trusted from the payload.
  await assertFails(setDoc(ref, { ...payload, uid: "different-owner" }));
  await assertFails(setDoc(ref, { ...payload, uploadId: "another-upload" }));
  await assertFails(setDoc(ref, { ...payload, storagePath: `userReadUploads/different-owner/${uploadId}-x.pdf` }));
  await assertFails(setDoc(ref, { ...payload, storagePath: "adminProductContent/read/p1/res-1.pdf" }));
  // The ceilings are enforced, not just advertised.
  await assertFails(setDoc(ref, { ...payload, sizeBytes: 104857601 }));
  await assertFails(setDoc(ref, { ...payload, pageCount: 20001 }));
  await assertFails(setDoc(ref, { ...payload, annotationCount: 100001 }));
  await assertFails(setDoc(ref, { ...payload, contentType: "text/html" }));
  await assertFails(setDoc(ref, { ...payload, name: "" }));
  // Privileged fields stay out of a learner write.
  await assertFails(setDoc(ref, { ...payload, role: "admin" }));
  // …and the legitimate update (an annotation save) still lands.
  await assertSucceeds(setDoc(ref, { ...payload, hasAnnotations: true, annotationCount: 4, annotatedAt: 12, updatedAt: 12 }));
  await assertSucceeds(deleteDoc(ref));
});

test("the Sketch personal library is one owner-only document per learner", async () => {
  const payload = {
    uid,
    version: 1,
    items: JSON.stringify([{ id: "lib-1", status: "published", elements: [] }]),
    itemCount: 1,
    truncated: false,
    createdAt: 10,
    updatedAt: 11,
  };
  const ref = doc(owner, "users", uid, "sketchLibraries", "main");
  await assertSucceeds(setDoc(ref, payload));
  assert.equal((await assertSucceeds(getDoc(ref))).data().itemCount, 1);

  await assertFails(getDoc(doc(stranger, "users", uid, "sketchLibraries", "main")));
  await assertFails(setDoc(doc(stranger, "users", uid, "sketchLibraries", "main"), payload));
  // One document per learner, and it has to describe itself honestly.
  await assertFails(setDoc(doc(owner, "users", uid, "sketchLibraries", "second"), payload));
  await assertFails(setDoc(ref, { ...payload, uid: "different-owner" }));
  await assertFails(setDoc(ref, { ...payload, items: "x".repeat(900001) }));
  await assertFails(setDoc(ref, { ...payload, itemCount: 501 }));
  await assertFails(setDoc(ref, { ...payload, truncated: "yes" }));
  await assertFails(setDoc(ref, { ...payload, role: "admin" }));
  await assertSucceeds(deleteDoc(ref));
});

test("the Quick Sketch canvas is one owner-only document per learner, module and canvas", async () => {
  const { quickSketchDocId, toFirestoreQuickSketch } = await import("../src/utils/quickSketch.ts");
  const payload = toFirestoreQuickSketch({
    uid,
    productId: "p1",
    moduleId: "mod-1",
    sketchKey: "main",
    title: "Sketch 1",
    strokes: [{ id: "s1", points: [{ x: 10.25, y: 20.5, pressure: 0.5 }] }],
    resourceId: null,
    resourceName: null,
    createdAt: 10,
    updatedAt: 11,
  });

  // The default canvas keeps the three-part id; a named canvas gets its own key.
  const mainRef = doc(owner, "users", uid, "quickSketches", quickSketchDocId(uid, "p1", "mod-1"));
  await assertSucceeds(setDoc(mainRef, payload));
  assert.equal((await assertSucceeds(getDoc(mainRef))).data().strokes.length, 1);
  const secondRef = doc(owner, "users", uid, "quickSketches", quickSketchDocId(uid, "p1", "mod-1", "sk_second"));
  await assertSucceeds(setDoc(secondRef, { ...payload, sketchKey: "sk_second", title: "Sketch 2" }));

  // Somebody else can never read or write it, and the ids cannot be borrowed.
  await assertFails(getDoc(doc(stranger, "users", uid, "quickSketches", quickSketchDocId(uid, "p1", "mod-1"))));
  await assertFails(setDoc(doc(stranger, "users", uid, "quickSketches", quickSketchDocId(uid, "p1", "mod-1")), payload));
  await assertFails(setDoc(mainRef, { ...payload, uid: "different-owner" }));
  // The key inside the document has to match the key in the id.
  await assertFails(setDoc(mainRef, { ...payload, sketchKey: "sk_wrong" }));
  await assertFails(setDoc(secondRef, { ...payload, sketchKey: "main", title: "Sketch 2" }));
  await assertFails(setDoc(doc(owner, "users", uid, "quickSketches", "anything-at-all"), payload));

  // The ceilings are enforced, not just advertised (MAX_QUICK_SKETCH_STROKES).
  await assertFails(
    setDoc(mainRef, { ...payload, strokes: Array.from({ length: 601 }, (_, i) => ({ id: `s${i}`, points: [{ x: i, y: i, pressure: 0.5 }] })) }),
  );
  await assertFails(setDoc(mainRef, { ...payload, title: "" }));
  await assertFails(setDoc(mainRef, { ...payload, title: "x".repeat(121) }));
  await assertFails(setDoc(mainRef, { ...payload, strokes: { id: "s1" } }));
  // Privileged fields stay out of a learner write.
  await assertFails(setDoc(mainRef, { ...payload, role: "admin" }));

  // …and the legitimate update (a longer drawing) still lands, then clears.
  await assertSucceeds(
    setDoc(mainRef, { ...payload, strokes: [...payload.strokes, { id: "s2", points: [{ x: 1, y: 1, pressure: 0.5 }] }], updatedAt: 12 }),
  );
  await assertSucceeds(deleteDoc(mainRef));
  await assertSucceeds(deleteDoc(secondRef));
});
