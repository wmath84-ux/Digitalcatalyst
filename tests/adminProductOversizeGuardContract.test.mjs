// tests/adminProductOversizeGuardContract.test.mjs
//
// Root cause of "Update cannot be saved" for products with several large mind
// maps: a mind map's JSON is stored inside the product document (and the mapper
// writes it twice), but the experiment budget only counted inline experiment
// HTML. Once the document passed Firestore's 1 MiB limit, the write failed with
// an unreadable invalid-argument error after the admin had waited.
//
// The fix refuses the save BEFORE the write with a readable PRODUCT_DOC_TOO_LARGE
// message that names the largest fields. These tests pin the behaviour and the
// wiring.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { editorToFirestoreBody } from "../utils/productMapping.js";
import {
  describeOversizeProductDocument,
  estimateFirestoreDocumentBytes,
  FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES,
} from "../utils/productFirestoreDoc.js";

const ROOT = process.cwd();
const clientSource = fs.readFileSync(path.join(ROOT, "src/lib/admin/client.ts"), "utf8");

const nodes = (count, topicLength) =>
  Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    parentId: i === 0 ? "root" : `n${Math.floor((i - 1) / 3)}`,
    topic: "x".repeat(topicLength) + i,
    notes: "",
  }));

const mindMap = (id, count, topicLength) => ({
  id,
  type: "mind_map",
  name: `Map ${id}`,
  url: "",
  mindMapData: { title: "Map", rootTopic: "Root", nodes: nodes(count, topicLength) },
  mindMapSourceMode: "scratch",
  mindMapRootTopic: "Root",
  visibility: "visible",
  accessLevel: "free",
  sortOrder: 0,
});

const productWithMaps = (count, nodeCount, topicLength) => {
  const resources = Array.from({ length: count }, (_, i) => mindMap(`m${i}`, nodeCount, topicLength));
  const form = {
    id: "p1",
    title: "T",
    shortDescription: "s",
    status: "published",
    modules: [{ id: "mod1", title: "M", resources, visibility: "visible", accessLevel: "free", sortOrder: 0 }],
    images: [],
    paidUpdates: [],
  };
  const body = editorToFirestoreBody(form);
  return { adminProduct: body.adminProduct, courseContent: body.courseContent };
};

test("a product with a few ordinary mind maps fits and is not refused", () => {
  const payload = productWithMaps(3, 60, 40);
  assert.equal(describeOversizeProductDocument(payload), null);
  assert.ok(estimateFirestoreDocumentBytes(payload) < FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES);
});

test("a product whose mind maps push the document past 1 MiB is refused with a readable message", () => {
  // Four maps at the validator's maximum (600 nodes × 400 chars) — the mapper
  // stores them twice, so the document lands well above the Firestore limit.
  const payload = productWithMaps(4, 600, 400);
  const message = describeOversizeProductDocument(payload);
  assert.ok(message, "an oversize product must be refused");
  assert.match(message, /PRODUCT_DOC_TOO_LARGE/);
  assert.match(message, /1 MiB/);
  assert.match(message, /Largest fields: /);
  assert.match(message, /mindMapData/, "the message names the mind map data as a large field");
});

test("the save path runs the size guard before the single document write", () => {
  assert.match(clientSource, /import \{ describeOversizeProductDocument \} from "\.\.\/\.\.\/\.\.\/utils\/productFirestoreDoc\.js"/);
  const guardAt = clientSource.indexOf("describeOversizeProductDocument(payload)");
  const writeAt = clientSource.indexOf("await setDoc(ref, payload, { merge: true });", guardAt);
  assert.ok(guardAt > 0, "guard is called on the saved payload");
  assert.ok(writeAt > guardAt, "guard runs before setDoc");
  assert.match(clientSource.slice(guardAt, writeAt), /throw new ApiError\(oversize, 400\)/);
});
