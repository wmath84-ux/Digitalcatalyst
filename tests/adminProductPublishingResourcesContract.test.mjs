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
const firestoreRules = fs.readFileSync("firestore.rules", "utf8");
const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");
const courseOverlay = fs.readFileSync("src/course/CourseOverlay.tsx", "utf8");
const playerApp = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const resourceTypes = fs.readFileSync("utils/productResourceTypes.js", "utf8");

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
  assert.match(resourceTypes, /value: "image_url", label: "Image \(URL or Cloudinary\)"/);
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

test("Block Note publishing uses the existing Self-note HTML cap and stores Note through the course tree", () => {
  assert.match(editor, /MAX_NOTE_HTML_LENGTH/);
  assert.match(editor, /r\.type === "note"/);
  assert.match(editor, /htmlLength > MAX_NOTE_HTML_LENGTH/);
  assert.match(editor, /noteHtml: typeof resource\.noteHtml === "string"/);
  assert.match(editor, /noteSource: "master"/);
  assert.match(editor, /ownerType: "course"/);
  assert.match(editor, /courseId: ownerProductId/);
  assert.match(editor, /moduleId: resource\.parentModuleId/);
});

test("admin save stamps course ownership and stable author timestamps on Master resources", () => {
  assert.match(client, /collectPreviousResourceRecords/);
  assert.match(client, /stampMasterNoteMetadata/);
  assert.match(client, /noteSource: "master"/);
  assert.match(client, /ownerType: "course"/);
  assert.match(client, /ownerId: productId/);
  assert.match(client, /createdBy,/);
  assert.match(client, /createdAt,/);
  assert.match(client, /updatedAt: unchanged \? Number\(old\.updatedAt/);
  assert.match(client, /await getDoc\(ref\)/);
});

test("learners see gated Master notes in a separate read-only collection while Self CRUD stays intact", () => {
  assert.match(playerApp, /accessibleResourceIds=\{resolution\.accessibleResourceIds\}/);
  assert.match(courseOverlay, /accessibleResourceIds: props\.accessibleResourceIds/);
  assert.match(courseOverlay, /masterNotes=\{masterNotes\}/);
  assert.match(courseOverlay, /collectMasterCourseNotes/);
  assert.match(notesPanel, /MASTER/);
  assert.match(notesPanel, /SELF/);
  assert.match(notesPanel, /useState<"master" \| "self">\(\(\) =>[\s\S]*?"master"/);
  assert.match(notesPanel, /onSelect=\{\(value\) => \{[\s\S]*?setViewingMasterNoteId\(note\.id\)/);
  assert.match(notesPanel, /readOnly/);
  assert.match(notesPanel, /onAdd\(html\)/);
  assert.match(notesPanel, /onEdit\(editingId, html\)/);
  assert.match(notesPanel, /onDelete\(pendingDeleteId\)/);
  assert.match(notesPanel, /activeCollection === "self" \? \([\s\S]*?data-course-notes-add/);
});

test("Firestore authorization keeps published Master resources admin-write-only and Self notes owner-scoped", () => {
  assert.match(firestoreRules, /match \/siteProducts\/\{productId\}[\s\S]*?allow read: if true;\s*allow write: if isAdmin\(\);/);
  assert.match(firestoreRules, /match \/notes\/\{noteId\}[\s\S]*?allow read: if isOwner\(uid\) \|\| isAdmin\(\);[\s\S]*?allow create, update: if isOwner\(uid\)/);
  assert.match(firestoreRules, /match \/personalCourseModules\/\{moduleId\}[\s\S]*?allow create, update, delete: if false;/);
});
