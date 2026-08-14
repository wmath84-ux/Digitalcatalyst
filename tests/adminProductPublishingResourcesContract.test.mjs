import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getProductPublicationStatus,
  isProductPublished,
  normalizeResourceUrl,
} from "../utils/productMapping.js";

const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const catalog = fs.readFileSync("src/context/CatalogContext.tsx", "utf8");

test("published status repairs the old hidden publish mismatch", () => {
  const oldBrokenCreate = {
    isVisible: false,
    adminProduct: { status: "published", visibility: "hidden" },
  };
  assert.equal(getProductPublicationStatus(oldBrokenCreate), "published");
  assert.equal(isProductPublished(oldBrokenCreate), true);
  assert.equal(isProductPublished({ isVisible: true, status: "draft" }), false);
});

test("admin save atomically derives visibility from status", () => {
  assert.match(client, /const visibility = requestedStatus === "published" \? "visible" : "hidden"/);
  assert.match(client, /status: requestedStatus,\s*isVisible: requestedStatus === "published"/);
  assert.match(client, /inStock: Boolean\(normalizedBody\.availableForSale\)/);
  assert.match(catalog, /\.filter\(\(item\) => isProductPublished\(item\.data\)\)/);
});

test("product editor exposes first-class resource URL add, edit, move and delete controls", () => {
  assert.match(editor, /\{ key: "resources", label: "Resources" \}/);
  assert.match(editor, /function ResourcesEditor/);
  assert.match(editor, /Resource URL \/ YouTube ID \/ iframe code/);
  assert.match(editor, /\+ Add resource \/ URL/);
  assert.match(editor, /moveResourceToModule/);
  assert.match(editor, /Delete resource/);
  assert.match(editor, /normalizeResourceUrl\(resource\.url, resource\.type\)/);
});

test("iframe snippets and pasted YouTube links become player-safe URLs", () => {
  assert.equal(
    normalizeResourceUrl('<iframe src="https://www.youtube.com/embed/U657Lyz5o7w?x=1"></iframe>', "youtube"),
    "https://www.youtube.com/watch?v=U657Lyz5o7w",
  );
  assert.equal(
    normalizeResourceUrl('https://www.youtube.com/embed/U657Lyz5o7w"', "youtube"),
    "https://www.youtube.com/watch?v=U657Lyz5o7w",
  );
});

test("publish validation takes the admin directly to the failing resource tab", () => {
  assert.match(editor, /const blocker = validation\.find\(\(issue\) => issue\.blocking\)/);
  assert.match(editor, /setTab\(blocker\.tab\)/);
  assert.match(editor, /Cannot publish:/);
});
