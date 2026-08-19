import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("shared Cloudinary upload control is reused for product and module images", () => {
  const uploadField = fs.readFileSync("src/components/admin/products/CloudinaryImageUploadField.tsx", "utf8");
  const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
  const util = fs.readFileSync("utils/cloudinaryUpload.ts", "utf8");

  assert.match(util, /export const uploadImageToCloudinary/);
  assert.match(util, /export const imageProviderFromUrl/);
  assert.match(uploadField, /uploadImageToCloudinary/);
  assert.match(uploadField, /Choose image to upload/);
  assert.match(editor, /from "@\/components\/admin\/products\/CloudinaryImageUploadField"/);
  assert.match(editor, /folder="product-images"/);
  assert.match(editor, /folder="module-images"/);
  assert.match(editor, /resource\.type === "image_url"/);
  assert.match(editor, /Your image \/ embed URL/);
  assert.match(editor, /onUploaded=\{\(hostedUrl\) => updateResource\(module\.id, resource\.id, \{ url: hostedUrl, provider: "Cloudinary" \}\)\}/);
});
