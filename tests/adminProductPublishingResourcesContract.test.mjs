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

test("module customization keeps each module and its resource URL controls together", () => {
  assert.doesNotMatch(editor, /\{ key: "resources", label: "Resources" \}/);
  assert.match(editor, /\{ key: "modules", label: "Modules & Resources" \}/);
  assert.doesNotMatch(editor, /function ResourcesEditor/);
  assert.match(editor, /Modules and their resources/);
  assert.match(editor, /Resources & URLs/);
  assert.match(editor, /Resource URL \/ YouTube ID \/ iframe code/);
  assert.match(editor, /\+ Add resource/);
  assert.match(editor, /moveResourceToModule/);
  assert.match(editor, /Delete resource/);
  assert.match(editor, /normalizeResourceUrl\(resource\.url, resource\.type\)/);
});

test("module image resources reuse the product Cloudinary upload plus a custom URL field", () => {
  const uploadField = fs.readFileSync("src/components/admin/products/CloudinaryImageUploadField.tsx", "utf8");
  assert.match(uploadField, /uploadImageToCloudinary/);
  assert.match(uploadField, /Choose image to upload/);
  assert.match(uploadField, /isCloudinaryImageUploadConfigured/);
  assert.match(editor, /CloudinaryImageUploadField/);
  assert.match(editor, /folder="product-images"/);
  assert.match(editor, /folder="module-images"/);
  assert.match(editor, /resource\.type === "image_url"/);
  assert.match(editor, /Your image \/ embed URL/);
  assert.match(editor, /Image \(URL or Cloudinary\)/);
  assert.match(editor, /Paste your own public or embed URL, or upload directly to Cloudinary/);
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

test("publish validation takes the admin directly to the combined module editor", () => {
  assert.match(editor, /const blocker = validation\.find\(\(issue\) => issue\.blocking\)/);
  assert.match(editor, /setTab\(blocker\.tab\)/);
  assert.match(editor, /needs a valid public HTTPS URL[\s\S]*?"modules"/);
  assert.match(editor, /Cannot publish:/);
});
