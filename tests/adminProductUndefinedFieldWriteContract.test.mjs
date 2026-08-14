// Regression contract for the admin product save failure:
//
//   FirebaseError: Function setDoc() called with invalid data.
//     Unsupported field value: undefined (found in document siteProducts/1782545401609)
//
// Firestore rejects `undefined` as a field value anywhere in a document. The
// editor → Firestore mappers used to emit `undefined` for unset optional
// fields (embedUrl, youtubeUrl, youtubeVideoId, paidUpdateId, paidUpdatePrice,
// embedContentTypeId/Label/Url), so EVERY product edit failed before it
// reached the database. These tests pin the invariant: nothing produced by the
// product write path may contain `undefined`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  editorModulesToFirestoreTree,
  editorPaidUpdateToFirestore,
  editorResourceToFirestore,
  editorToFirestoreBody,
  stripUndefinedDeep,
} from "../utils/productMapping.js";

/** Collect the dotted path of every `undefined` value in a tree. */
function undefinedPaths(value, path = "$") {
  if (value === undefined) return [path];
  if (Array.isArray(value)) return value.flatMap((item, i) => undefinedPaths(item, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
  }
  return [];
}

const assertNoUndefined = (value, label) => {
  const bad = undefinedPaths(value);
  assert.deepEqual(bad, [], `${label} must not contain undefined — Firestore rejects it. Found: ${bad.join(", ")}`);
};

// --- stripUndefinedDeep semantics -----------------------------------------

test("stripUndefinedDeep removes undefined keys instead of nulling them", () => {
  const out = stripUndefinedDeep({ keep: 0, blank: "", zeroish: null, gone: undefined });
  assert.deepEqual(Object.keys(out).sort(), ["blank", "keep", "zeroish"]);
  // Meaningful falsy values survive — only `undefined` is dropped.
  assert.equal(out.keep, 0);
  assert.equal(out.blank, "");
  assert.equal(out.zeroish, null);
});

test("stripUndefinedDeep cleans nested objects and drops undefined array entries", () => {
  const out = stripUndefinedDeep({
    modules: [{ id: "m", badge: undefined, files: [{ id: "f", embedUrl: undefined }] }, undefined],
  });
  assert.equal(out.modules.length, 1);
  assert.deepEqual(Object.keys(out.modules[0]).sort(), ["files", "id"]);
  assert.deepEqual(Object.keys(out.modules[0].files[0]), ["id"]);
  assertNoUndefined(out, "cleaned tree");
});

test("stripUndefinedDeep passes non-plain objects through untouched", () => {
  // serverTimestamp() and friends are class instances — rewriting them would
  // destroy the sentinel and break the write.
  class FieldValueSentinel { constructor() { this._method = "serverTimestamp"; } }
  const sentinel = new FieldValueSentinel();
  const date = new Date(0);
  const out = stripUndefinedDeep({ updatedAt: sentinel, created: date, drop: undefined });
  assert.equal(out.updatedAt, sentinel, "FieldValue sentinel must be the same reference");
  assert.equal(out.created, date, "Date must be the same reference");
  assert.ok(!("drop" in out));
});

// --- The exact shapes that used to break the save -------------------------

test("a YouTube resource without embedUrl/youtubeUrl produces no undefined fields", () => {
  const resource = editorResourceToFirestore({
    id: "r1",
    name: "Lesson 1",
    type: "youtube",
    url: "https://youtu.be/dQw4w9WgXcQ",
    sortOrder: 0,
  });
  assertNoUndefined(resource, "firestore resource");
  // Unset optional slots are absent, not `undefined`.
  assert.ok(!("embedUrl" in resource));
  assert.ok(!("youtubeUrl" in resource));
  assert.ok(!("paidUpdatePrice" in resource));
  // Real data still round-trips.
  assert.equal(resource.type, "youtube");
  assert.equal(resource.url, "https://youtu.be/dQw4w9WgXcQ");
});

test("a plain non-paid module produces no undefined fields", () => {
  const [module] = editorModulesToFirestoreTree([
    { id: "m1", title: "Module 1", sortOrder: 0, resources: [{ id: "r1", type: "pdf", url: "https://example.com/a.pdf" }] },
  ]);
  assertNoUndefined(module, "firestore module");
  // The legacy embed slots are simply omitted when unused.
  assert.ok(!("embedContentTypeId" in module));
  assert.ok(!("embedContentTypeLabel" in module));
  assert.ok(!("embedContentUrl" in module));
  assert.ok(!("paidUpdateId" in module), "a non-paid module must not carry paidUpdateId");
});

test("a paid-update module keeps its real paid fields while dropping unset ones", () => {
  const [module] = editorModulesToFirestoreTree([
    { id: "m1", title: "Premium", accessLevel: "paid_update", cashPrice: 199, entitlementId: "ent1", sortOrder: 0, resources: [] },
  ]);
  assertNoUndefined(module, "paid module");
  assert.equal(module.paidUpdateId, "ent1");
  assert.equal(module.paidUpdatePrice, "₹199");
});

test("paid updates are written without undefined fields", () => {
  const update = editorPaidUpdateToFirestore(
    { id: "u1", title: undefined, includedIds: undefined, publishDate: undefined },
    [],
  );
  assertNoUndefined(update, "firestore paid update");
  assert.equal(update.publishDate, null);
  assert.deepEqual(update.includedIds, []);
});

test("editorToFirestoreBody never emits undefined, even from a sparse editor form", () => {
  // A half-filled form is exactly what the admin panel submits mid-edit.
  const form = {
    id: "1782545401609",
    title: "Product",
    shortDescription: undefined,
    salePrice: undefined,
    subject: undefined,
    images: [{ id: "i1", url: "https://cdn.example.com/a.jpg", sortOrder: 0, isPrimary: true }],
    modules: [
      { id: "p", title: undefined, badge: undefined, resources: [{ id: "r", type: "iframe", url: "https://example.com" }] },
      { id: "c", parentModuleId: "p", title: "Child", resources: [] },
    ],
    paidUpdates: [{ id: "u", title: undefined }],
  };
  const body = editorToFirestoreBody(form);
  assertNoUndefined(body, "siteProducts document body");
  // The nested tree and the preserved editor blob both survive the clean.
  assert.equal(body.courseContent.length, 1);
  assert.equal(body.courseContent[0].modules.length, 1);
  assert.equal(body.adminProduct.id, "1782545401609");
});

test("a completely empty product still yields a writable body", () => {
  const body = editorToFirestoreBody({ id: "x", modules: [], paidUpdates: [] });
  assertNoUndefined(body, "empty product body");
  assert.deepEqual(body.courseContent, []);
  assert.deepEqual(body.paidUpdates, []);
});

// --- The write path itself is guarded -------------------------------------

test("the admin client strips undefined before every siteProducts write", () => {
  const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");
  assert.match(client, /stripUndefinedDeep/, "client must import the strip helper");
  // The product document is built through the strip helper and then written.
  assert.match(client, /const payload = stripUndefinedDeep\(\{/);
  assert.match(client, /await setDoc\(ref, payload, \{ merge: true \}\);/);
  // No raw spread of a request body straight into setDoc.
  assert.doesNotMatch(client, /setDoc\(ref,\{\.\.\.body,id:recordId,updatedAt:serverTimestamp\(\)\},\{merge:true\}\)/);
  assert.doesNotMatch(client, /setDoc\(ref,\{\.\.\.b,updatedAt:serverTimestamp\(\)\},\{merge:true\}\)/);
});

test("product image handling tolerates a missing or partial images array", () => {
  const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");
  // The old code did `body.images[i]?.isPrimary` while mapping `urls`, which
  // threw whenever `images` was absent.
  assert.doesNotMatch(client, /body\.images\[i\]\?\.isPrimary/);
  assert.match(client, /Array\.isArray\(body\.images\)/);
});
