// tests/adminProductModulesEditorContract.test.mjs
//
// Contract tests for the mobile-first refactor of the Product
// Editor's Modules & Resources tab.
//
// The old design was a long vertical list of module cards, each
// with a nested list of resources — so the admin had to scroll
// through every module even to reach a resource that lives in
// the last module. The new design uses the same drill-down
// pattern as the Curriculum Builder:
//
//   • A pill rail at the top of the page lists every module.
//   • Picking a module shows ONLY that module's card.
//   • The card exposes a second pill rail with that module's
//     resources. Picking a resource shows ONLY that resource's
//     card.
//   • The "+" pill on each rail adds a new module / resource
//     and auto-focuses the freshly created item.
//
// The contract is: every existing mutation (add / update / delete
// for both modules and resources, sort order, move-to-module,
// parent hierarchy, paid-update linkage, image / URL /
// Cloudinary upload for image-type resources, advanced settings
// sheet) is still reachable; only the layout has changed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const productEditor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
const modulesEditor = fs.readFileSync("src/components/admin/products/ModulesResourcesEditor.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");

test("ProductEditor delegates the Modules & Resources tab to the new drill-down component", () => {
  // The parent page still owns the "Modules & Resources" tab
  // and the validation block (titles, IDs, cash prices, URL
  // shapes, parent cycles, paid-update inclusion). It no longer
  // owns the actual editor UI — that's in the new file.
  assert.match(productEditor, /\{ key: "modules", label: "Modules & Resources" \}/);
  assert.match(productEditor, /<ModulesResourcesEditor/);
  assert.match(productEditor, /modules=\{form\.modules\}/);
  assert.match(productEditor, /paidUpdates=\{form\.paidUpdates\}/);
  // The old inline `ModulesEditor` function is gone.
  assert.doesNotMatch(productEditor, /function ModulesEditor\(/);
  // The dead RESOURCE_TYPES table is gone too — it moved with the
  // new editor.
  assert.doesNotMatch(productEditor, /const RESOURCE_TYPES = \[/);
});

test("the new editor exposes a Modules pill rail at the top of the page", () => {
  // The rail selector + the data-attributes are the contract test
  // hooks future e2e suites will use to find the right controls.
  assert.match(modulesEditor, /data-pill-rail/);
  assert.match(modulesEditor, /data-pill-rail-label=\{label\}/);
  assert.match(modulesEditor, /data-pill-action="add"/);
  assert.match(modulesEditor, /data-pill-rail-pill/);
  assert.match(modulesEditor, /data-pill-rail-scroll/);
  // The rail lists every module by title and shows a + button to
  // add a new one.
  assert.match(modulesEditor, /label="Modules"/);
  assert.match(modulesEditor, /iconOf=\{\(\) => "📚"\}/);
});

test("the new editor focuses only on one module at a time", () => {
  // The drill-down pattern: at most one module renders a full
  // card. Other modules live in the rail; tapping a pill switches
  // focus. The implementation also clears the resource focus
  // when the module changes.
  assert.match(modulesEditor, /activeModuleId/);
  assert.match(modulesEditor, /setActiveResourceId\(null\)/);
  // Only the active module renders a full card; the others live
  // in the rail.
  assert.match(modulesEditor, /data-admin-module-card/);
  assert.match(modulesEditor, /data-module-id=\{activeModule\.id\}/);
});

test("the new editor reveals the Resources rail only when a module is focused", () => {
  // The "Module → Resources" drill is one tap: picking a module
  // exposes the resources rail. The contract is that the rail
  // only renders inside the focused module card — so the
  // resources dropdown "auto-opens" right after the admin picks
  // a module.
  assert.match(modulesEditor, /data-admin-resource-rail/);
  assert.match(modulesEditor, /activeModule\?\.resources/);
  assert.match(modulesEditor, /Resources in “/);
  // Each module's resources get their own pill in the rail.
  assert.match(modulesEditor, /keyOf=\{\(resource\) => resource\.id\}/);
  assert.match(modulesEditor, /iconOf=\{\(\) => "🎬"\}/);
});

test("the new editor focuses only on one resource at a time", () => {
  assert.match(modulesEditor, /activeResourceId/);
  assert.match(modulesEditor, /data-admin-resource-card/);
  assert.match(modulesEditor, /data-resource-id=\{resource\.id\}/);
  // When no resource is focused, the editor shows an empty hint
  // and points the admin to the + pill.
  assert.match(modulesEditor, /Pick a resource above to edit its URL/);
});

test("the new editor keeps the full set of resource mutations", () => {
  // Every existing resource mutation is still wired up; the
  // contract is that the data + payload produced by these
  // helpers is byte-for-byte the same as the previous editor.
  assert.match(modulesEditor, /function addResource\(moduleId: string\)/);
  assert.match(modulesEditor, /function updateResource\(moduleId: string, resourceId: string, patch: Partial<ProductResource>\)/);
  assert.match(modulesEditor, /function removeResource\(moduleId: string, resourceId: string\)/);
  assert.match(modulesEditor, /moveResourceToModule/);
  assert.match(modulesEditor, /moveResourceWithinModule/);
  // The persistence target is unchanged. The new editor is a
  // controlled component — the parent owns the API call. The
  // contract is that the parent still saves via the same
  // endpoint.
  assert.match(productEditor, /adminFetch<\{ product: ProductForm \}>\(`\/api\/admin\/products\/\$\{productId\}`/);
  assert.match(productEditor, /adminFetch<\{ product: ProductForm \}>\("\/api\/admin\/products"/);
});

test("the new editor keeps the full set of module mutations", () => {
  assert.match(modulesEditor, /function addModule\(\)/);
  assert.match(modulesEditor, /function updateModule\(id: string, patch: Partial<ProductModule>\)/);
  assert.match(modulesEditor, /function removeModule\(id: string\)/);
  // The "delete module and its descendants" rule still exists.
  assert.match(modulesEditor, /function descendantsOf\(id: string\)/);
  // Parent module picker excludes the focused module + its
  // descendants (a cycle is impossible to enter from the UI).
  assert.match(modulesEditor, /descendantsOf\(activeModule\.id\)\.has/);
});

test("the new editor keeps the per-resource advanced settings", () => {
  // The advanced settings sheet (access level, paid-update
  // package, visibility, regular + sale price, EduCoin price,
  // individually-purchasable toggle, move-to-module picker) is
  // still rendered for the focused resource.
  assert.match(modulesEditor, /Advanced resource settings/);
  assert.match(modulesEditor, /Move to module/);
  assert.match(modulesEditor, /Paid update package/);
  assert.match(modulesEditor, /Regular price/);
  assert.match(modulesEditor, /Sale price/);
  assert.match(modulesEditor, /EduCoin price/);
  assert.match(modulesEditor, /individuallyPurchasable/);
  assert.match(modulesEditor, /Learners can purchase this resource separately/);
});

test("the new editor keeps the per-module advanced settings", () => {
  assert.match(modulesEditor, /Advanced module settings/);
  assert.match(modulesEditor, /Access level/);
  assert.match(modulesEditor, /Parent module/);
  assert.match(modulesEditor, /Sort order/);
  assert.match(modulesEditor, /Badge/);
  assert.match(modulesEditor, /Required previous module IDs/);
  assert.match(modulesEditor, /Include in full bundle/);
  assert.match(modulesEditor, /Preview available/);
});

test("the new editor keeps the image resource Cloudinary + custom URL UX", () => {
  // Image-type resources still get the dedicated card with
  // both the URL field and the Cloudinary upload control.
  assert.match(modulesEditor, /resource\.type === "image_url"/);
  assert.match(modulesEditor, /Your image \/ embed URL/);
  assert.match(modulesEditor, /Paste your own public or embed URL, or upload directly to Cloudinary/);
  assert.match(modulesEditor, /folder="module-images"/);
  assert.match(modulesEditor, /CloudinaryImageUploadField/);
  assert.match(modulesEditor, /onUploaded=\{\(hostedUrl\) => onUpdate\(\{ url: hostedUrl, provider: "Cloudinary" \}\)\}/);
});

test("mobile-first only — the pill rails are horizontally-scrolling rows", () => {
  // The pill rail is intentionally a single row of horizontally-
  // scrolling pills, never a multi-column grid. Any future
  // tablet/desktop redesign must opt in explicitly.
  assert.match(modulesEditor, /scrollbar-hide -mx-1 flex gap-1\.5 overflow-x-auto/);
});

test("the plus pill in each rail auto-focuses the freshly created item", () => {
  // Picking the + pill on the Modules rail calls `addModule`,
  // which sets the freshly created module's id as the active
  // module. The same pattern is used for the Resources rail.
  assert.match(modulesEditor, /setActiveModuleId\(id\)/);
  assert.match(modulesEditor, /setActiveResourceId\(id\)/);
});
