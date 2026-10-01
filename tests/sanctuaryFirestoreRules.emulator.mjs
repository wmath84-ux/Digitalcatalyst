// Intentionally not *.test.mjs: run with npm run test:sanctuary:rules.
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

let env;
let owner;
let stranger;
const uid = "sanctuary-owner";
const scopes = ["__sanctuary__", "purchased-course", "mine-self-authored"];

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
    const note = toFirestoreNote({ id, html: "<h1>Revision</h1><p>Saved from the board</p>", text: "Revision Saved from the board", createdAt: 10, links: [] }, { uid, productId });
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
