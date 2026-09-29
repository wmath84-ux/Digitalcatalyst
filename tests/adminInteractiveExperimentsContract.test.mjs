// tests/adminInteractiveExperimentsContract.test.mjs
//
// "Interactive 2D experiment" in OFFICIAL (admin) products.
//
// My Study Library's experiment builder now has an admin twin: the product
// editor's Modules & Resources tab offers the same "Interactive 2D experiment"
// resource type, with the same design flow (AI prompt → paste / upload /
// starter template → live preview → honest checks) and the same sandboxed
// stage in the Course Player. The admin designs it once, inside the product's
// own module tree, and every learner plays it like any other lesson.
//
// This suite pins the contract that makes that safe and honest:
//
//   1. the admin offers the type: `ProductResource` + `RESOURCE_TYPES` grow by
//      exactly one member, with the builder panel wired into the resource card;
//   2. the admin builder IS the learner's builder: same prompt module, same
//      starter templates, same checks, same `ExperimentStage` preview — only
//      the skin differs, so the two can never diverge;
//   3. the source survives every mapping step: editor → canonical → legacy
//      `CourseFile` (what the player reads) and editor → Firestore → editor
//      (what the admin reloads);
//   4. the URL-only rule learns the experiment without forgetting the Brain
//      set: inline source OR a hosted page is usable, an empty experiment is
//      dropped, and every existing Brain behaviour is byte-for-byte unchanged;
//   5. the official budget: 200 KB per experiment (same as the learner) and
//      320 KB per product single-count — because the product document stores
//      the tree TWICE (`courseContent` + `adminProduct`), so 320 KB stored
//      twice ≈ the learner's 640 KB.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PRODUCT_EXPERIMENT_MAX_BYTES,
  PRODUCT_MAX_EXPERIMENT_BYTES,
  canonicalResourceToLegacyFile,
  editorModulesToCanonicalTree,
  editorResourceToCanonical,
  editorResourceToFirestore,
  editorToFirestoreBody,
  firestoreResourceToCanonical,
  firestoreResourceToEditor,
  firestoreToCatalogProduct,
  productExperimentBudget,
  productExperimentBudgetError,
} from "../utils/productMapping.js";

const read = (path) => readFileSync(path, "utf8");

const adminTypes = read("src/lib/admin/types.ts");
const modulesEditor = read("src/components/admin/products/ModulesResourcesEditor.tsx");
const productEditor = read("src/components/admin/products/ProductEditor.tsx");
const adminPanel = read("src/components/admin/products/ExperimentEditor.tsx");
const learnerPanel = read("src/personal-library/MyCourseExperimentEditor.tsx");
const mapping = read("utils/productMapping.js");
const commerceTypes = read("src/types/commerce.ts");

const EXPERIMENT_HTML = "<!doctype html><html><head></head><body><canvas></canvas></body></html>";

const makeExperiment = (overrides = {}) => ({
  id: "res_exp",
  name: "Projectile lab",
  type: "interactive",
  url: "",
  interactiveHtml: EXPERIMENT_HTML,
  provider: "Experiment",
  sortOrder: 0,
  visibility: "visible",
  accessLevel: "included",
  paidUpdateId: null,
  cashPrice: null,
  coinPrice: null,
  ...overrides,
});

const makeModule = (resources) => ({
  id: "mod_1",
  title: "Module 1",
  description: "",
  sortOrder: 0,
  visibility: "visible",
  active: true,
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: false,
  requiredPreviousModuleIds: [],
  entitlementId: "mod_1",
  badge: null,
  parentModuleId: null,
  resources,
});

// ---------------------------------------------------------------------------
// 1. The admin offers the type
// ---------------------------------------------------------------------------

test("ProductResource grows by exactly the experiment (type + inline source)", () => {
  assert.match(adminTypes, /\| "interactive";/);
  assert.match(adminTypes, /interactiveHtml\?: string;/);
  assert.match(commerceTypes, /\| "interactive";/);
  assert.match(commerceTypes, /interactiveHtml\?: string;/);
});

test("the Modules & Resources tab lists the experiment next to the other types", () => {
  assert.match(modulesEditor, /"brain",\s*\n\s*"interactive",\s*\n\] as const;/);
  assert.match(modulesEditor, /interactive: "Interactive 2D experiment",/);
  assert.match(modulesEditor, /if \(type === "interactive"\) return "Experiment";/);
});

test("the resource card treats the experiment like content, not like a link", () => {
  // Ready = inline source OR a hosted page, with no blocking issues.
  assert.match(modulesEditor, /const isExperiment = resource\.type === "interactive";/);
  assert.match(modulesEditor, /const experimentReady = isExperiment && \(Boolean\(experimentHtml\.trim\(\)\) \|\| experimentHosted\) && experimentErrors\.length === 0;/);
  assert.match(modulesEditor, /const readyForPlayer = isBrain \? brainReady : isExperiment \? experimentReady : Boolean\(cleanUrl\);/);
  // Its own pill, its own amber draft state, its own hosted-link field.
  assert.match(modulesEditor, /"Source required"/);
  assert.match(modulesEditor, /"Experiment ready"/);
  assert.match(modulesEditor, /Hosted experiment link \(optional\)/);
  // The generic "add a valid public URL" warning must not fire for it…
  assert.match(modulesEditor, /\{!cleanUrl && !isBrain && !isExperiment \?/);
  // …and an inline-only experiment offers no "Open URL" button.
  assert.match(modulesEditor, /\{!isBrain && \(!isExperiment \|\| cleanUrl\) \?/);
});

// ---------------------------------------------------------------------------
// 2. The admin builder IS the learner's builder (same modules, other skin)
// ---------------------------------------------------------------------------

test("the admin panel reuses the prompt, templates, checks and stage", () => {
  // Same building blocks as MyCourseExperimentEditor — this is what keeps the
  // two builders from diverging.
  for (const hook of [
    "buildExperimentAiPrompt",
    "EXPERIMENT_PROMPT_RULES",
    "EXPERIMENT_TEMPLATES",
    "templateBytes",
    "experimentIssues",
    "experimentByteLength",
    "EXPERIMENT_MAX_BYTES",
    "navigator.clipboard",
    "const text = await file.text();",
    "<ExperimentStage html={html} url={resource.url || \"\"} title={resource.name || \"Experiment\"} compact />",
  ]) {
    assert.ok(adminPanel.includes(hook), `the admin builder must reuse ${hook}`);
    assert.ok(learnerPanel.includes(hook), `the learner builder must use ${hook} (the pair must match)`);
  }
  // …with one deliberate difference: the admin page is light, so the preview
  // box sets the player's dark palette explicitly for the stage.
  assert.match(adminPanel, /"--course-text": "#ffffff"/);
  assert.match(adminPanel, /bg-slate-950/);
});

test("the admin panel exposes its own test hooks (it never reuses the learner's)", () => {
  for (const hook of [
    "data-admin-experiment-editor",
    "data-admin-experiment-topic",
    "data-admin-experiment-copy-prompt",
    "data-admin-experiment-template=",
    "data-admin-experiment-file",
    "data-admin-experiment-html",
    "data-admin-experiment-preview",
    "data-admin-experiment-status",
  ]) {
    assert.ok(adminPanel.includes(hook), `the admin builder must expose ${hook}`);
  }
  assert.ok(!/data-my-experiment-/.test(adminPanel), "admin hooks must not collide with the learner's");
  assert.match(modulesEditor, /<AdminExperimentEditor resource=\{resource\} onChange=\{onUpdate\} \/>/);
});

test("the product editor validates experiments and gates every save on the budget", () => {
  // Publish checklist: a source (or hosted link) is required…
  assert.match(productEditor, /r\.type === "interactive"/);
  assert.match(productEditor, /has no source yet — paste the HTML, upload the \.html file, start from a template, or add a hosted link\./);
  // …an over-size experiment blocks even when hidden (it would break the write)…
  assert.match(productEditor, /for \(const issue of experimentBlockingIssues\(html\)\)/);
  // …the whole-product budget is checked with the same readable message…
  assert.match(productEditor, /const experimentBudget = productExperimentBudget\(form\.modules\);/);
  assert.match(productEditor, /const totalError = productExperimentBudgetError\(form\.modules\);/);
  // …and the budget gates DRAFT saves too, not just publishing.
  assert.match(productEditor, /const budgetError = productExperimentBudgetError\(form\.modules\);/);
  // The save keeps the inline source and the optional hosted link.
  assert.match(productEditor, /if \(resource\.type === "interactive"\)/);
  assert.match(productEditor, /interactiveHtml: typeof resource\.interactiveHtml === "string" \? resource\.interactiveHtml : "",/);
});

// ---------------------------------------------------------------------------
// 3. The source survives every mapping step
// ---------------------------------------------------------------------------

test("normResourceType keeps the experiment instead of narrowing it to embed", () => {
  assert.match(mapping, /s === "brain" \|\| s === "interactive" \|/);
  const canonical = editorResourceToCanonical(makeExperiment());
  assert.ok(canonical, "an inline experiment must survive the URL-only rule");
  assert.equal(canonical.type, "interactive");
});

test("editor → canonical → legacy CourseFile carries the source to the player", () => {
  const canonical = editorResourceToCanonical(makeExperiment());
  assert.equal(canonical.interactiveHtml, EXPERIMENT_HTML);
  const legacy = canonicalResourceToLegacyFile(canonical);
  assert.ok(legacy);
  assert.equal(legacy.type, "interactive");
  assert.equal(legacy.interactiveHtml, EXPERIMENT_HTML);
  // A hosted experiment arrives via `url` instead (nothing inline to carry).
  const hosted = canonicalResourceToLegacyFile(
    editorResourceToCanonical(makeExperiment({ interactiveHtml: "", url: "https://example.com/lab.html" })),
  );
  assert.ok(hosted);
  assert.equal(hosted.type, "interactive");
  assert.equal(hosted.interactiveHtml, undefined);
  assert.match(hosted.url, /^https:\/\/example\.com\/lab\.html/);
});

test("editor → Firestore → editor round-trips the source for the next edit", () => {
  const stored = editorResourceToFirestore(makeExperiment());
  assert.equal(stored.type, "interactive");
  assert.equal(stored.interactiveHtml, EXPERIMENT_HTML);
  const back = firestoreResourceToEditor(stored);
  assert.equal(back.type, "interactive");
  assert.equal(back.interactiveHtml, EXPERIMENT_HTML);
  // The full product body keeps it in BOTH trees (player + admin blob)…
  const body = editorToFirestoreBody({ modules: [makeModule([makeExperiment()])], paidUpdates: [] });
  assert.equal(body.courseContent[0].files[0].interactiveHtml, EXPERIMENT_HTML);
  assert.equal(body.adminProduct.modules[0].resources[0].interactiveHtml, EXPERIMENT_HTML);
  // …and the catalog projection hands the player the same bytes.
  const catalog = firestoreToCatalogProduct(
    { adminProduct: body.adminProduct, courseContent: body.courseContent, paidUpdates: [] },
    "prod_1",
  );
  assert.equal(catalog.courseContent[0].files[0].type, "interactive");
  assert.equal(catalog.courseContent[0].files[0].interactiveHtml, EXPERIMENT_HTML);
});

test("a Firestore tree read straight into the catalog keeps the experiment", () => {
  const canonical = firestoreResourceToCanonical(
    editorResourceToFirestore(makeExperiment({ url: "", interactiveHtml: EXPERIMENT_HTML })),
  );
  assert.ok(canonical);
  assert.equal(canonical.type, "interactive");
  assert.equal(canonical.interactiveHtml, EXPERIMENT_HTML);
  const tree = editorModulesToCanonicalTree([makeModule([makeExperiment()])]);
  assert.equal(tree[0].resources[0].type, "interactive");
  assert.equal(tree[0].resources[0].interactiveHtml, EXPERIMENT_HTML);
});

// ---------------------------------------------------------------------------
// 4. Usability — and the Brain set stays byte-for-byte
// ---------------------------------------------------------------------------

test("inline source OR a hosted page is usable; an empty experiment is dropped", () => {
  assert.ok(editorResourceToCanonical(makeExperiment()), "inline source is usable with no URL");
  assert.ok(
    editorResourceToCanonical(makeExperiment({ interactiveHtml: "", url: "https://example.com/lab.html" })),
    "a hosted page is usable with no inline source",
  );
  assert.equal(
    editorResourceToCanonical(makeExperiment({ interactiveHtml: "  ", url: "" })),
    null,
    "an experiment with neither source nor link is dropped like any URL-less type",
  );
  assert.equal(
    editorResourceToFirestore(makeExperiment({ interactiveHtml: "", url: "not a url" })),
    null,
    "a garbage link does not rescue an empty experiment",
  );
});

test("every Brain behaviour is unchanged by the experiment", () => {
  const ready = {
    id: "res_brain",
    name: "Set 1",
    type: "brain",
    url: "",
    provider: "Brain",
    sortOrder: 0,
    visibility: "visible",
    accessLevel: "included",
    paidUpdateId: null,
    cashPrice: null,
    coinPrice: null,
    practiceQuestions: [
      { id: "q1", prompt: "2+2?", options: ["3", "4"], correctIndex: 1, explanation: "", difficulty: "easy", topic: "" },
    ],
  };
  const canonical = editorResourceToCanonical(ready);
  assert.ok(canonical, "a complete Brain set stays usable");
  assert.equal(canonical.type, "brain");
  assert.equal(canonical.interactiveHtml, undefined, "a Brain set never gains an experiment payload");
  const legacy = canonicalResourceToLegacyFile(canonical);
  assert.equal(legacy.practiceQuestions.length, 1);
  assert.equal(legacy.interactiveHtml, undefined);
  assert.equal(
    editorResourceToCanonical({ ...ready, practiceQuestions: [] }),
    null,
    "an empty Brain set is still dropped",
  );
  const experiment = editorResourceToCanonical(makeExperiment());
  assert.equal(experiment.practiceQuestions, undefined, "an experiment never gains a Brain payload");
});

// ---------------------------------------------------------------------------
// 5. The official budget
// ---------------------------------------------------------------------------

test("the caps are 200 KB per experiment and 320 KB per product (stored twice)", () => {
  assert.equal(PRODUCT_EXPERIMENT_MAX_BYTES, 200 * 1024);
  assert.equal(PRODUCT_MAX_EXPERIMENT_BYTES, 320 * 1024);
  assert.match(mapping, /export const PRODUCT_EXPERIMENT_MAX_BYTES = 200 \* 1024;/);
  assert.match(mapping, /export const PRODUCT_MAX_EXPERIMENT_BYTES = 320 \* 1024;/);
});

test("the budget names the over-size file and refuses a readable message", () => {
  const small = [makeModule([makeExperiment()])];
  assert.deepEqual(productExperimentBudget(small).over, null);
  assert.equal(productExperimentBudgetError(small), null);

  const big = makeExperiment({ name: "Huge lab", interactiveHtml: `<!doctype html><html><body>${"x".repeat(210 * 1024)}</body></html>` });
  const over = productExperimentBudget([makeModule([big])]);
  assert.equal(over.over.name, "Huge lab");
  assert.match(productExperimentBudgetError([makeModule([big])]), /Huge lab.*210 KB.*at most 200 KB/);

  // Many small experiments can still overflow the whole-product budget.
  const oneKb = EXPERIMENT_HTML.padEnd(32 * 1024, " ");
  const many = Array.from({ length: 11 }, (_, index) =>
    makeExperiment({ id: `res_${index}`, name: `Lab ${index}`, interactiveHtml: oneKb }),
  );
  const total = productExperimentBudget([makeModule(many)]);
  assert.equal(total.over, null, "no single file is over the per-experiment cap");
  assert.ok(total.total > PRODUCT_MAX_EXPERIMENT_BYTES);
  assert.match(productExperimentBudgetError([makeModule(many)]), /add up to 352 KB.*limit is 320 KB/);

  // Non-experiment resources never count towards the budget.
  const other = productExperimentBudget([makeModule([{ ...makeExperiment(), type: "pdf", url: "https://example.com/a.pdf" }])]);
  assert.equal(other.total, 0);
});
