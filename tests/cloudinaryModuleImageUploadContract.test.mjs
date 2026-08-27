import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("shared Cloudinary upload control is reused for product and module images", () => {
  const uploadField = fs.readFileSync("src/components/admin/products/CloudinaryImageUploadField.tsx", "utf8");
  const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
  const modulesEditor = fs.readFileSync("src/components/admin/products/ModulesResourcesEditor.tsx", "utf8");
  const util = fs.readFileSync("utils/cloudinaryUpload.ts", "utf8");

  assert.match(util, /export const uploadImageToCloudinary/);
  assert.match(util, /export const imageProviderFromUrl/);
  assert.match(uploadField, /uploadImageToCloudinary/);
  assert.match(uploadField, /Choose image to upload/);
  // The product image uploader stays in ProductEditor (it lives
  // on the "Images" tab); the module image uploader moved with
  // the rest of the modules UX to the dedicated component.
  assert.match(editor, /from "@\/components\/admin\/products\/CloudinaryImageUploadField"/);
  assert.match(editor, /folder="product-images"/);
  assert.match(modulesEditor, /folder="module-images"/);
  assert.match(modulesEditor, /resource\.type === "image_url"/);
  assert.match(modulesEditor, /Your image \/ embed URL/);
  assert.match(modulesEditor, /onUploaded=\{\(hostedUrl\) => onUpdate\(\{ url: hostedUrl, provider: "Cloudinary" \}\)\}/);
});
