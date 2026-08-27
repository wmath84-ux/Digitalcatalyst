import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getProductPublicationStatus,
  isProductPublished,
  normalizeResourceUrl,
} from "../utils/productMapping.js";

const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
const modulesEditor = fs.readFileSync("src/components/admin/products/ModulesResourcesEditor.tsx", "utf8");
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
  // After the mobile-first redesign the editor lives in its own
  // component; the drill-down pill rail, the URL / type / image
  // fields, the Cloudinary upload, the move-between-modules and
  // the per-resource delete all moved with it.
  assert.match(modulesEditor, /Modules and resources/);
  assert.match(modulesEditor, /Resource URL \/ YouTube ID \/ iframe code/);
  assert.match(modulesEditor, /Delete resource/);
  assert.match(modulesEditor, /moveResourceToModule/);
  assert.match(modulesEditor, /normalizeResourceUrl\(resource\.url, resource\.type\)/);
  // The new page must still mount the editor.
  assert.match(editor, /ModulesResourcesEditor/);
});

test("module image resources reuse the product Cloudinary upload plus a custom URL field", () => {
  const uploadField = fs.readFileSync("src/components/admin/products/CloudinaryImageUploadField.tsx", "utf8");
  assert.match(uploadField, /uploadImageToCloudinary/);
  assert.match(uploadField, /Choose image to upload/);
  assert.match(uploadField, /isCloudinaryImageUploadConfigured/);
  // The image-resource UX moved to the new modules editor.
  // The product image uploader is still wired up here.
  assert.match(editor, /CloudinaryImageUploadField/);
  assert.match(editor, /folder="product-images"/);
  assert.match(modulesEditor, /folder="module-images"/);
  assert.match(modulesEditor, /resource\.type === "image_url"/);
  assert.match(modulesEditor, /Your image \/ embed URL/);
  assert.match(modulesEditor, /Image \(URL or Cloudinary\)/);
  assert.match(modulesEditor, /Paste your own public or embed URL, or upload directly to Cloudinary/);
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
