// tests/productMapping.test.mjs
//
// Round-trip tests for the Admin Product Editor mapping layer.
//
// The contract under test:
//   Admin Editor  →  Firestore mapper  →  Catalog sanitizer  →  Admin mapper
//   (and back)
//
// Every valid commerce/access field must survive intact across the chain.
// No valid price may be silently coerced to 0/null. No valid resource with
// a valid URL may be dropped. The URL-only rule only fires for resources
// whose URL is missing or non-HTTPS / data: / Firebase Storage.

import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalResourceToLegacyFile,
  canonicalTreeToLegacyTree,
  editorModuleToCanonical,
  editorModulesToCanonicalTree,
  editorModulesToFirestoreTree,
  editorPaidUpdateToFirestore,
  editorResourceToCanonical,
  editorResourceToFirestore,
  editorToFirestoreBody,
  firestoreModulesToEditorFlat,
  firestorePaidUpdateToCanonical,
  firestorePaidUpdateToEditor,
  firestoreResourceToCanonical,
  firestoreToCatalogProduct,
  firestoreToEditorForm,
  firestoreTreeToCanonicalTree,
  sanitizeCanonicalCourseContent,
  __testHelpers,
} from "../utils/productMapping.js";

const { pickValidUrl, isValidHttpsUrl, normAccessLevel, normVisibility } = __testHelpers;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const buildBaseModule = (overrides = {}) => ({
  id: "mod_1",
  title: "Introduction",
  description: "Course overview and setup",
  sortOrder: 0,
  visibility: "visible",
  active: true,
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: true,
  requiredPreviousModuleIds: [],
  entitlementId: "mod_1",
  badge: null,
  parentModuleId: null,
  resources: [
    {
      id: "res_yt",
      name: "Welcome video",
      type: "youtube",
      url: "https://www.youtube.com/watch?v=abc123",
      provider: "YouTube",
      sortOrder: 0,
      visibility: "visible",
      accessLevel: "included",
      individuallyPurchasable: false,
      cashPrice: null,
      salePrice: null,
      coinPrice: null,
      paidUpdateId: null,
      entitlementId: "res_yt",
      parentModuleId: "mod_1",
    },
  ],
  ...overrides,
});

const buildPurchasableModule = (overrides = {}) => ({
  id: "mod_premium",
  title: "Premium deep dive",
  description: "Bonus material",
  sortOrder: 1,
  visibility: "visible",
  active: true,
  accessLevel: "purchasable",
  individuallyPurchasable: true,
  cashPrice: 499,
  salePrice: 399,
  coinPrice: 100,
  includeInBundle: false,
  previewAvailable: false,
  requiredPreviousModuleIds: ["mod_1"],
  entitlementId: "mod_premium_ent",
  badge: "PRO",
  parentModuleId: null,
  resources: [
    {
      id: "res_pdf_premium",
      name: "Premium PDF workbook",
      type: "pdf",
      url: "https://cdn.example.com/workbook.pdf",
      provider: "public",
      sortOrder: 0,
      visibility: "visible",
      accessLevel: "purchasable",
      individuallyPurchasable: true,
      cashPrice: 199,
      salePrice: 149,
      coinPrice: 50,
      paidUpdateId: null,
      entitlementId: "res_pdf_premium_ent",
      parentModuleId: "mod_premium",
    },
  ],
  ...overrides,
});

const buildNestedModule = (overrides = {}) => ({
  id: "mod_nested",
  title: "Bonus track",
  description: "Nested module inside Introduction",
  sortOrder: 5,
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
  entitlementId: "mod_nested",
  badge: null,
  parentModuleId: "mod_1",
  resources: [],
  ...overrides,
});

const buildForm = (overrides = {}) => ({
  id: "prod_1",
  title: "React Mastery",
  shortDescription: "Master React 19",
  longDescription: "Long form description with details.",
  instructor: "Jane Doe",
  category: "Course",
  productType: "course",
  classLevel: "Intermediate",
  subject: "Frontend",
  sku: "SKU-001",
  tags: ["react", "frontend"],
  searchKeywords: ["hooks", "context"],
  features: ["Source code", "Quizzes"],
  estimatedDuration: "12 hours",
  language: "English",
  manualRating: "4.5",
  visibility: "visible",
  availableForSale: true,
  images: [
    { id: "img_1", url: "https://res.cloudinary.com/demo/image/upload/v1/cover.jpg", provider: "cloudinary", sortOrder: 0, isPrimary: true },
    { id: "img_2", url: "https://res.cloudinary.com/demo/image/upload/v1/cover2.jpg", provider: "cloudinary", sortOrder: 1, isPrimary: false },
  ],
  regularPrice: "1999",
  salePrice: "1499",
  coinPrice: 200,
  coinPurchaseEnabled: true,
  isFree: false,
  eligibleCouponIds: ["WELCOME20"],
  minPayableAmount: "0",
  availabilityDate: null,
  saleStart: null,
  saleEnd: null,
  modules: [buildBaseModule(), buildPurchasableModule(), buildNestedModule()],
  paidUpdates: [
    {
      id: "upd_q1",
      title: "Q1 2024 Update",
      description: "New lessons on Server Components",
      includedIds: ["mod_1", "res_pdf_premium"],
      cashPrice: 299,
      coinPrice: 50,
      active: true,
      publishDate: "2024-01-15",
      visibility: "visible",
      sortOrder: 0,
    },
  ],
  status: "published",
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. URL helper: only valid HTTPS (non-Storage) URLs survive
// ---------------------------------------------------------------------------

test("isValidHttpsUrl accepts public HTTPS URLs", () => {
  assert.equal(isValidHttpsUrl("https://res.cloudinary.com/demo/image.jpg"), true);
  assert.equal(isValidHttpsUrl("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(isValidHttpsUrl("https://docs.google.com/forms/d/e/123"), true);
});

test("isValidHttpsUrl rejects base64/data URLs, Firebase Storage, http, internal paths", () => {
  assert.equal(isValidHttpsUrl("data:image/png;base64,iVBORw0KG"), false);
  assert.equal(isValidHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isValidHttpsUrl("https://firebasestorage.googleapis.com/v0/b/x/o/x.png"), false);
  assert.equal(isValidHttpsUrl("http://insecure.example.com/a"), false);
  assert.equal(isValidHttpsUrl("/relative/path"), false);
  assert.equal(isValidHttpsUrl(""), false);
  assert.equal(isValidHttpsUrl(null), false);
  assert.equal(isValidHttpsUrl(undefined), false);
  assert.equal(isValidHttpsUrl("<svg></svg>"), false);
});

test("pickValidUrl returns the first usable candidate", () => {
  assert.equal(pickValidUrl("", "https://example.com/a", "https://example.com/b"), "https://example.com/a");
  assert.equal(pickValidUrl("data:image/png;base64,x", "https://example.com/a"), "https://example.com/a");
  assert.equal(pickValidUrl("data:image/png;base64,x", null), "");
});

// ---------------------------------------------------------------------------
// 2. Editor resource round-trip preserves every required field
// ---------------------------------------------------------------------------

test("editorResourceToCanonical preserves every required resource field", () => {
  const r = {
    id: "res_a",
    parentModuleId: "mod_1",
    name: "Sample",
    type: "pdf",
    url: "https://example.com/a.pdf",
    provider: "public",
    sortOrder: 3,
    visibility: "visible",
    accessLevel: "purchasable",
    individuallyPurchasable: true,
    cashPrice: 199,
    salePrice: 149,
    coinPrice: 50,
    entitlementId: "res_a_ent",
    paidUpdateId: null,
  };
  const c = editorResourceToCanonical(r);
  assert.ok(c, "expected canonical resource");
  assert.equal(c.id, "res_a");
  assert.equal(c.parentModuleId, "mod_1");
  assert.equal(c.name, "Sample");
  assert.equal(c.type, "pdf");
  assert.equal(c.url, "https://example.com/a.pdf");
  assert.equal(c.provider, "public");
  assert.equal(c.sortOrder, 3);
  assert.equal(c.visibility, "visible");
  assert.equal(c.accessLevel, "purchasable");
  assert.equal(c.individuallyPurchasable, true);
  assert.equal(c.cashPrice, 199);
  assert.equal(c.salePrice, 149);
  assert.equal(c.coinPrice, 50);
  assert.equal(c.entitlementId, "res_a_ent");
  assert.equal(c.paidUpdateId, null);
});

test("editorResourceToCanonical rejects data: URLs, http URLs, and empty URLs", () => {
  assert.equal(editorResourceToCanonical({ id: "x", type: "pdf", url: "data:application/pdf;base64,AAA" }), null);
  assert.equal(editorResourceToCanonical({ id: "x", type: "pdf", url: "http://example.com/a" }), null);
  assert.equal(editorResourceToCanonical({ id: "x", type: "pdf", url: "" }), null);
  assert.equal(editorResourceToCanonical({ id: "x", type: "pdf", url: "https://firebasestorage.googleapis.com/v0/b/k/o/x" }), null);
});

test("editorResourceToCanonical treats YouTube videoId as a valid URL-less link", () => {
  const c = editorResourceToCanonical({
    id: "res_yt",
    type: "youtube",
    name: "YT",
    url: "",
    youtubeVideoId: "abc123",
    provider: "YouTube",
  });
  assert.ok(c);
  assert.equal(c.type, "youtube");
});

// ---------------------------------------------------------------------------
// 3. Editor module round-trip preserves every required field
// ---------------------------------------------------------------------------

test("editorModuleToCanonical preserves every required module field including badge/active/sortOrder", () => {
  const m = {
    id: "mod_X",
    title: "X",
    description: "Desc",
    sortOrder: 7,
    visibility: "visible",
    active: true,
    accessLevel: "purchasable",
    individuallyPurchasable: true,
    cashPrice: 499,
    salePrice: 399,
    coinPrice: 100,
    includeInBundle: false,
    previewAvailable: true,
    requiredPreviousModuleIds: ["mod_prev_1", "mod_prev_2"],
    entitlementId: "mod_X_ent",
    badge: "PRO",
    parentModuleId: null,
    resources: [],
  };
  const c = editorModuleToCanonical(m);
  assert.ok(c);
  assert.equal(c.id, "mod_X");
  assert.equal(c.title, "X");
  assert.equal(c.description, "Desc");
  assert.equal(c.sortOrder, 7);
  assert.equal(c.visibility, "visible");
  assert.equal(c.active, true);
  assert.equal(c.accessLevel, "purchasable");
  assert.equal(c.individuallyPurchasable, true);
  assert.equal(c.cashPrice, 499);
  assert.equal(c.salePrice, 399);
  assert.equal(c.coinPrice, 100);
  assert.equal(c.includeInBundle, false);
  assert.equal(c.previewAvailable, true);
  assert.deepEqual(c.requiredPreviousModuleIds, ["mod_prev_1", "mod_prev_2"]);
  assert.equal(c.entitlementId, "mod_X_ent");
  assert.equal(c.badge, "PRO");
  assert.equal(c.parentModuleId, null);
  assert.deepEqual(c.resources, []);
  assert.deepEqual(c.modules, []);
});

test("editorModuleToCanonical normalises the 3-way legacy accessLevel 'paidUpdate' to 'paid_update'", () => {
  const c = editorModuleToCanonical({ id: "m", accessLevel: "paidUpdate", resources: [] });
  assert.equal(c.accessLevel, "paid_update");
});

test("editorModuleToCanonical defaults salePrice=0 to null (not preserved as 0)", () => {
  const c = editorModuleToCanonical({ id: "m", salePrice: 0, cashPrice: 100, resources: [] });
  assert.equal(c.salePrice, 0); // zero is a valid sale price
});

test("editorModuleToCanonical does not coerce valid null prices to undefined", () => {
  const c = editorModuleToCanonical({ id: "m", cashPrice: null, salePrice: null, coinPrice: null, resources: [] });
  assert.equal(c.cashPrice, null);
  assert.equal(c.salePrice, null);
  assert.equal(c.coinPrice, null);
});

// ---------------------------------------------------------------------------
// 4. Nesting + dependencies
// ---------------------------------------------------------------------------

test("editorModulesToCanonicalTree nests children under their parentModuleId and sorts by sortOrder", () => {
  const tree = editorModulesToCanonicalTree([
    buildBaseModule({ id: "mod_b", title: "B", sortOrder: 1, parentModuleId: null }),
    buildBaseModule({ id: "mod_a", title: "A", sortOrder: 0, parentModuleId: null }),
    buildNestedModule({ id: "mod_child", parentModuleId: "mod_a", sortOrder: 0 }),
    buildNestedModule({ id: "mod_child2", parentModuleId: "mod_a", sortOrder: 1 }),
  ]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, "mod_a");
  assert.equal(tree[1].id, "mod_b");
  assert.equal(tree[0].modules.length, 2);
  assert.equal(tree[0].modules[0].id, "mod_child");
  assert.equal(tree[0].modules[1].id, "mod_child2");
});

test("editorModulesToCanonicalTree preserves module dependencies (requiredPreviousModuleIds)", () => {
  const tree = editorModulesToCanonicalTree([
    buildBaseModule({ id: "mod_1", sortOrder: 0 }),
    buildPurchasableModule({ id: "mod_2", sortOrder: 1, requiredPreviousModuleIds: ["mod_1"] }),
  ]);
  assert.equal(tree[1].requiredPreviousModuleIds[0], "mod_1");
});

// ---------------------------------------------------------------------------
// 5. Whimsical / Google Form / Cloudinary fixtures (URL type coverage)
// ---------------------------------------------------------------------------

test("Whimsical resource round-trips with type=whimsical → mindmap on the player side", () => {
  const form = buildForm({
    modules: [buildBaseModule({
      resources: [{
        id: "res_whim",
        name: "Mind map",
        type: "whimsical",
        url: "https://whimsical.com/embed/abcd123",
        provider: "Whimsical",
        sortOrder: 0,
        visibility: "visible",
        accessLevel: "included",
        individuallyPurchasable: false,
        cashPrice: null,
        salePrice: null,
        coinPrice: null,
        paidUpdateId: null,
        entitlementId: "res_whim",
        parentModuleId: "mod_1",
      }],
    })],
  });
  const firestore = editorToFirestoreBody(form);
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  assert.equal(canonical[0].resources[0].type, "mindmap");
  const legacy = canonicalTreeToLegacyTree(canonical);
  assert.equal(legacy[0].files[0].type, "mindmap");
});

test("Google Form resource round-trips with type=gform → google_form", () => {
  const form = buildForm({
    modules: [buildBaseModule({
      resources: [{
        id: "res_gf",
        name: "Survey",
        type: "gform",
        url: "https://docs.google.com/forms/d/e/FORMID/viewform",
        provider: "Google Forms",
        sortOrder: 0,
        visibility: "visible",
        accessLevel: "included",
        individuallyPurchasable: false,
        cashPrice: null,
        salePrice: null,
        coinPrice: null,
        paidUpdateId: null,
        entitlementId: "res_gf",
        parentModuleId: "mod_1",
      }],
    })],
  });
  const firestore = editorToFirestoreBody(form);
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  assert.equal(canonical[0].resources[0].type, "google_form");
});

test("Cloudinary image URL survives round-trip as type=image", () => {
  const form = buildForm({
    modules: [buildBaseModule({
      resources: [{
        id: "res_cld",
        name: "Cover",
        type: "image_url",
        url: "https://res.cloudinary.com/demo/image/upload/v123/cover.jpg",
        provider: "Cloudinary",
        sortOrder: 0,
        visibility: "visible",
        accessLevel: "included",
        individuallyPurchasable: false,
        cashPrice: null,
        salePrice: null,
        coinPrice: null,
        paidUpdateId: null,
        entitlementId: "res_cld",
        parentModuleId: "mod_1",
      }],
    })],
  });
  const firestore = editorToFirestoreBody(form);
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  assert.equal(canonical[0].resources[0].type, "image");
  assert.equal(canonical[0].resources[0].url, "https://res.cloudinary.com/demo/image/upload/v123/cover.jpg");
});

// ---------------------------------------------------------------------------
// 6. Individually purchasable module + sale price + resource-level purchase
// ---------------------------------------------------------------------------

test("Individually purchasable module with sale price survives Editor → Firestore → Catalog → Editor", () => {
  const form = buildForm();
  const firestore = editorToFirestoreBody(form);
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  const flat = firestoreModulesToEditorFlat(firestore.courseContent);
  // The premium module is in the flat list.
  const premium = flat.find((m) => m.id === "mod_premium");
  assert.ok(premium, "premium module must round-trip back into the editor list");
  assert.equal(premium.individuallyPurchasable, true);
  assert.equal(premium.accessLevel, "purchasable");
  assert.equal(premium.cashPrice, 499);
  assert.equal(premium.salePrice, 399);
  assert.equal(premium.coinPrice, 100);
  assert.equal(premium.badge, "PRO");
  assert.equal(premium.includeInBundle, false);
  assert.deepEqual(premium.requiredPreviousModuleIds, ["mod_1"]);
  // The premium resource (a separate "resource-level purchase") is preserved.
  const r = premium.resources[0];
  assert.equal(r.id, "res_pdf_premium");
  assert.equal(r.cashPrice, 199);
  assert.equal(r.salePrice, 149);
  assert.equal(r.coinPrice, 50);
  assert.equal(r.accessLevel, "purchasable");
  assert.equal(r.individuallyPurchasable, true);
});

test("Sale price is never silently defaulted to 0 or null when present in the editor", () => {
  const form = buildForm();
  const firestore = editorToFirestoreBody(form);
  const flat = firestoreModulesToEditorFlat(firestore.courseContent);
  const premium = flat.find((m) => m.id === "mod_premium");
  assert.equal(premium.salePrice, 399);
  // The catalog (canonical) shape also retains the sale price.
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  const cpremium = canonical.flatMap((m) => [m, ...m.modules]).find((m) => m.id === "mod_premium");
  assert.equal(cpremium.salePrice, 399);
});

// ---------------------------------------------------------------------------
// 7. Paid update round-trip
// ---------------------------------------------------------------------------

test("Paid update with description, publishDate, includedIds and prices survives the full round trip", () => {
  const form = buildForm();
  const firestore = editorToFirestoreBody(form);
  const updates = firestore.paidUpdates;
  assert.equal(updates.length, 1);
  // Canonical split form is filled.
  assert.deepEqual(updates[0].includedModuleIds, ["mod_1"]);
  assert.deepEqual(updates[0].includedResourceIds, ["res_pdf_premium"]);
  // Original joined form is also kept.
  assert.deepEqual(updates[0].includedIds, ["mod_1", "res_pdf_premium"]);
  assert.equal(updates[0].cashPrice, 299);
  assert.equal(updates[0].coinPrice, 50);
  assert.equal(updates[0].publishDate, "2024-01-15");
  assert.equal(updates[0].active, true);
  assert.equal(updates[0].visibility, "visible");

  // Back to the editor form (preserves the joined `includedIds` for the
  // textbox). Order of includedIds is preserved.
  const editor = firestorePaidUpdateToEditor(updates[0]);
  assert.deepEqual(editor.includedIds, ["mod_1", "res_pdf_premium"]);
  assert.equal(editor.title, "Q1 2024 Update");
  assert.equal(editor.description, "New lessons on Server Components");
  assert.equal(editor.cashPrice, 299);
  assert.equal(editor.coinPrice, 50);
  assert.equal(editor.publishDate, "2024-01-15");
});

test("Editor paid-update writer splits includedIds by module vs resource bucket", () => {
  const flat = [
    { id: "mod_1", resources: [{ id: "res_a" }, { id: "res_b" }] },
    { id: "mod_2", resources: [] },
  ];
  const out = editorPaidUpdateToFirestore(
    { id: "upd", title: "x", includedIds: ["res_b", "mod_1", "res_a", "mod_2", "unknown"] },
    flat,
  );
  assert.deepEqual(out.includedModuleIds, ["mod_1", "mod_2"]);
  assert.deepEqual(out.includedResourceIds, ["res_b", "res_a"]);
  // The unknown id is silently dropped — matches the editor UX.
  assert.ok(!out.includedIds.includes("unknown"));
});

// ---------------------------------------------------------------------------
// 8. Full pipeline: Editor → Firestore → Catalog (canonical) → Editor
// ---------------------------------------------------------------------------

test("Full round trip: Editor form → Firestore → Catalog → Editor form loses no required field", () => {
  const form = buildForm();
  const firestoreBody = editorToFirestoreBody(form);

  // Simulate Firestore round trip: the form blob is stored as `adminProduct`,
  // and the canonical tree is stored as `courseContent`.
  const firestoreDoc = {
    id: "prod_1",
    title: form.title,
    description: form.shortDescription,
    longDescription: form.longDescription,
    instructor: form.instructor,
    category: form.category,
    subject: form.subject,
    sku: form.sku,
    tags: form.tags,
    keywords: form.searchKeywords,
    features: form.features,
    images: form.images.map((i) => i.url),
    productImages: { card: form.images.find((i) => i.isPrimary).url },
    price: `₹${form.regularPrice}`,
    salePrice: form.salePrice ? `₹${form.salePrice}` : null,
    coinPrice: form.coinPrice,
    isFree: form.isFree,
    isVisible: form.visibility === "visible",
    inStock: form.availableForSale,
    manualRating: form.manualRating,
    dimensions: form.estimatedDuration,
    courseContent: firestoreBody.courseContent,
    paidUpdates: firestoreBody.paidUpdates,
    adminProduct: form,
  };

  // Catalog → canonical + paid updates.
  const catalog = firestoreToCatalogProduct(firestoreDoc, "prod_1");
  assert.equal(catalog.documentId, "prod_1");
  assert.equal(catalog.canonicalModules.length, 2); // mod_1 (root) + mod_premium (root); mod_nested is a child
  // The nested module is preserved as a child of mod_1.
  const mod1 = catalog.canonicalModules.find((m) => m.id === "mod_1");
  assert.equal(mod1.modules.length, 1);
  assert.equal(mod1.modules[0].id, "mod_nested");
  // Paid updates preserved.
  assert.equal(catalog.paidUpdates.length, 1);
  assert.equal(catalog.paidUpdates[0].id, "upd_q1");

  // Admin reload → editor form.
  const editor = firestoreToEditorForm(firestoreDoc, "prod_1");
  assert.equal(editor.id, "prod_1");
  assert.equal(editor.title, form.title);
  assert.equal(editor.shortDescription, form.shortDescription);
  assert.equal(editor.regularPrice, "1999");
  assert.equal(editor.salePrice, "1499");
  assert.equal(editor.modules.length, 3);
  assert.equal(editor.paidUpdates.length, 1);
  // Required fields still on the premium module after the round trip.
  const premium = editor.modules.find((m) => m.id === "mod_premium");
  assert.equal(premium.individuallyPurchasable, true);
  assert.equal(premium.cashPrice, 499);
  assert.equal(premium.salePrice, 399);
  assert.equal(premium.coinPrice, 100);
  assert.equal(premium.badge, "PRO");
  assert.equal(premium.includeInBundle, false);
  assert.deepEqual(premium.requiredPreviousModuleIds, ["mod_1"]);
  assert.equal(premium.resources[0].cashPrice, 199);
  assert.equal(premium.resources[0].salePrice, 149);
  assert.equal(premium.resources[0].coinPrice, 50);
});

test("Firestore doc without adminProduct blob still round-trips modules from the courseContent tree", () => {
  const form = buildForm();
  const firestoreBody = editorToFirestoreBody(form);
  const legacyDoc = {
    id: "prod_legacy",
    title: "Legacy",
    description: "Desc",
    price: "₹1999",
    courseContent: firestoreBody.courseContent,
    paidUpdates: firestoreBody.paidUpdates,
  };
  const editor = firestoreToEditorForm(legacyDoc, "prod_legacy");
  assert.equal(editor.id, "prod_legacy");
  assert.equal(editor.modules.length, 3);
  assert.equal(editor.paidUpdates.length, 1);
  const premium = editor.modules.find((m) => m.id === "mod_premium");
  assert.equal(premium.cashPrice, 499);
  assert.equal(premium.salePrice, 399);
  assert.equal(premium.badge, "PRO");
});

test("Catalog sanitizer strips only resources with invalid URLs and never the parent module", () => {
  const raw = [
    {
      id: "mod_1", title: "Has 1 valid + 1 invalid", sortOrder: 0, accessLevel: "included",
      active: true, visibility: "visible", individuallyPurchasable: false,
      cashPrice: null, salePrice: null, coinPrice: null, includeInBundle: true,
      previewAvailable: false, requiredPreviousModuleIds: [], entitlementId: "mod_1",
      badge: null, parentModuleId: null,
      files: [
        { id: "r1", name: "ok", type: "pdf", url: "https://example.com/a.pdf" },
        { id: "r2", name: "broken", type: "pdf", url: "data:application/pdf;base64,AAA" },
        { id: "r3", name: "http", type: "pdf", url: "http://insecure.example.com/a.pdf" },
      ],
      modules: [],
    },
  ];
  const out = sanitizeCanonicalCourseContent(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "mod_1");
  assert.equal(out[0].resources.length, 1);
  assert.equal(out[0].resources[0].id, "r1");
});

test("Catalog sanitizer keeps modules whose resources are all invalid", () => {
  const raw = [{
    id: "mod_only_invalid", title: "All resources invalid", sortOrder: 0, accessLevel: "included",
    active: true, visibility: "visible", individuallyPurchasable: true, cashPrice: 100,
    salePrice: 80, coinPrice: 10, includeInBundle: true, previewAvailable: false,
    requiredPreviousModuleIds: [], entitlementId: "mod_only_invalid", badge: null,
    parentModuleId: null,
    files: [
      { id: "x1", name: "broken", type: "pdf", url: "" },
      { id: "x2", name: "data", type: "pdf", url: "data:application/pdf;base64,AAA" },
    ],
    modules: [],
  }];
  const out = sanitizeCanonicalCourseContent(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "mod_only_invalid");
  assert.equal(out[0].resources.length, 0);
  // Commerce fields survive.
  assert.equal(out[0].cashPrice, 100);
  assert.equal(out[0].salePrice, 80);
  assert.equal(out[0].coinPrice, 10);
  assert.equal(out[0].individuallyPurchasable, true);
});

// ---------------------------------------------------------------------------
// 9. Sanitiser guards: HTML / docPages / Open Docs are dropped
// ---------------------------------------------------------------------------

test("Sanitiser drops records that contain internal HTML content as the URL", () => {
  const c = editorResourceToCanonical({ id: "x", name: "y", type: "iframe", url: "<svg onload=alert(1)>" });
  assert.equal(c, null);
});

test("Sanitiser accepts an iframe URL as a generic embed when HTTPS", () => {
  const c = editorResourceToCanonical({ id: "x", name: "y", type: "iframe", url: "https://example.com/embed/abc" });
  assert.ok(c);
  assert.equal(c.type, "embed");
});

// ---------------------------------------------------------------------------
// 10. Legacy bridge → CoursePlayerApp still sees the old shape
// ---------------------------------------------------------------------------

test("canonicalTreeToLegacyTree produces the CourseModule shape (paidUpdate on access_level=paid_update)", () => {
  const form = buildForm();
  const firestore = editorToFirestoreBody(form);
  const canonical = sanitizeCanonicalCourseContent(firestore.courseContent);
  const legacy = canonicalTreeToLegacyTree(canonical);
  // Root modules
  assert.equal(legacy.length, 2);
  // Children preserved
  const mod1Legacy = legacy.find((m) => m.id === "mod_1");
  assert.equal(mod1Legacy.modules.length, 1);
  assert.equal(mod1Legacy.modules[0].id, "mod_nested");
  // accessLevel mapping: included → "included" (legacy)
  assert.equal(mod1Legacy.accessLevel, "included");
  // Resource types map to the 11-type enum
  assert.equal(mod1Legacy.files[0].type, "youtube");
});

test("Paid-update module becomes accessLevel=paidUpdate in the legacy bridge", () => {
  const raw = [{
    id: "mod_paid", title: "Paid", sortOrder: 0, accessLevel: "paid_update",
    active: true, visibility: "visible", individuallyPurchasable: false,
    cashPrice: 99, salePrice: null, coinPrice: null, includeInBundle: true,
    previewAvailable: false, requiredPreviousModuleIds: [], entitlementId: "mod_paid_ent",
    badge: null, parentModuleId: null,
    files: [], modules: [],
  }];
  const canonical = sanitizeCanonicalCourseContent(raw);
  const legacy = canonicalTreeToLegacyTree(canonical);
  assert.equal(legacy[0].accessLevel, "paidUpdate");
  assert.equal(legacy[0].paidUpdateId, "mod_paid_ent");
  assert.equal(legacy[0].paidUpdatePrice, "₹99");
});
