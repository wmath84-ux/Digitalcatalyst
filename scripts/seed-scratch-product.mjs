#!/usr/bin/env node
// Seed a "Scratch — All File Types" product into Firestore `siteProducts`
// using the exact same data shape the Admin Product Editor writes (see
// `src/lib/admin/client.ts` → `saveProduct` + `utils/productMapping.js`).
//
// The product contains ONE module per file type the host Course Player can
// render, each with a real public sample URL where one exists, and a clear
// `PASTE_YOUR_…` placeholder for the Google-account types (doc / sheet /
// slides / form / drive / whimsical) that require a file shared as
// "Anyone with the link".
//
// Usage:
//   # requires the server-side service account (same as Vercel)
//   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/seed-scratch-product.mjs
//
//   # also grant instant access to a specific user so the player opens
//   # without going through (free) checkout:
//   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/seed-scratch-product.mjs --grant <firebase-uid>
//
//   # preview the exact document that would be written (no credentials):
//   node scripts/seed-scratch-product.mjs --dry-run
//
// Options:
//   --product-id <id>   override the Firestore doc id (default: scratch-all-file-types)
//   --grant <uid>       write a full-product entitlement + legacy purchase for <uid>
//   --dry-run           print the product JSON and exit without writing

import { editorToFirestoreBody } from "../utils/productMapping.js";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const hasFlag = (name) => args.includes(name);

const PRODUCT_ID = getArg("--product-id") || "scratch-all-file-types";
const GRANT_UID = getArg("--grant");
const DRY_RUN = hasFlag("--dry-run");

// ---------------------------------------------------------------------------
// File-type catalogue. `type` is the editor resource type; `url` is a real
// public sample (or a clear placeholder for Google-account files).
// ---------------------------------------------------------------------------
const FILE_TYPES = [
  { type: "youtube", name: "YouTube — video embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", note: "Works out of the box (no-cookie embed)." },
  { type: "video_url", name: "Direct video (MP4)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", note: "Native <video> element." },
  { type: "audio_url", name: "Direct audio (MP3)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", note: "Native <audio> element." },
  { type: "image_url", name: "Image (JPG)", url: "https://picsum.photos/seed/eduvora-scratch/1600/900", note: "Zoomable image viewer." },
  { type: "gdrive", name: "Google Drive file", url: "https://drive.google.com/file/d/PASTE_YOUR_DRIVE_FILE_ID/view", note: "REPLACE — share the file as “Anyone with the link”." },
  { type: "pdf", name: "PDF (direct link)", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", note: "Renders in the built-in PDF viewer." },
  { type: "gdoc", name: "Google Doc", url: "https://docs.google.com/document/d/PASTE_YOUR_DOC_ID/edit", note: "REPLACE — share as “Anyone with the link”." },
  { type: "gsheet", name: "Google Sheet", url: "https://docs.google.com/spreadsheets/d/PASTE_YOUR_SHEET_ID/edit", note: "REPLACE — share as “Anyone with the link”." },
  { type: "gslides", name: "Google Slides", url: "https://docs.google.com/presentation/d/PASTE_YOUR_SLIDES_ID/edit", note: "REPLACE — share as “Anyone with the link”." },
  { type: "gform", name: "Google Form", url: "https://docs.google.com/forms/d/e/PASTE_YOUR_FORM_ID/viewform", note: "REPLACE — share as “Anyone with the link”." },
  { type: "ebook", name: "E-book (PDF sample)", url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", note: "PDF e-books render natively." },
  { type: "github_pages", name: "GitHub Pages / external site", url: "https://example.com", note: "Generic sandboxed embed (any HTTPS page)." },
  { type: "whimsical", name: "Whimsical mind map", url: "https://whimsical.com/embed/PASTE_YOUR_BOARD_ID", note: "REPLACE — Whimsical → Share → Enable public access." },
  { type: "iframe", name: "Embedded map (iframe)", url: "https://www.openstreetmap.org/export/embed.html?bbox=77.15%2C28.55%2C77.25%2C28.65&layer=mapnik&marker=28.6%2C77.2", note: "Any embeddable HTTPS page." },
];

// ---------------------------------------------------------------------------
// Build the editor-form product (the exact `ProductForm` shape the admin
// editor submits) so the mapping layer produces the identical Firestore doc.
// ---------------------------------------------------------------------------
const now = Date.now();
const id = (prefix, index) => `${prefix}_${now.toString(36)}_${index}`;

const modules = FILE_TYPES.map((entry, index) => ({
  id: `mod_${index + 1}`,
  title: `${String(index + 1).padStart(2, "0")} · ${entry.name}`,
  description: entry.note,
  sortOrder: index,
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
  entitlementId: `mod_${index + 1}`,
  badge: entry.url.includes("PASTE_YOUR") ? "REPLACE URL" : null,
  parentModuleId: null,
  resources: [
    {
      id: id("res", index),
      name: entry.name,
      type: entry.type,
      url: entry.url,
      provider: entry.type === "whimsical" ? "Whimsical" : entry.type === "youtube" ? "YouTube" : "public",
      sortOrder: 0,
      visibility: "visible",
      accessLevel: "included",
      paidUpdateId: null,
      cashPrice: null,
      coinPrice: null,
    },
  ],
}));

const form = {
  id: PRODUCT_ID,
  title: "🎯 Scratch — All File Types",
  shortDescription: "One module per file type the course player can host. Use this to test what renders and what doesn't.",
  longDescription:
    "A scratch product for testing the host player. Each module contains exactly one resource of a different file type — YouTube, direct video, direct audio, image, Google Drive, PDF, Google Doc, Google Sheet, Google Slides, Google Form, e-book, external embed, Whimsical mind map and a generic iframe. Modules whose URL contains PASTE_YOUR need a real file shared as “Anyone with the link”.",
  instructor: "Digital Catalyst QA",
  category: "Scratch",
  productType: "course",
  classLevel: "Test",
  subject: "File types",
  sku: "SCRATCH-ALL-FILE-TYPES",
  tags: ["SCRATCH", "TEST", "ALL FILE TYPES"],
  searchKeywords: ["scratch", "file types", "player test"],
  features: ["Every supported file type", "One module per type", "Free to open"],
  estimatedDuration: "15 min",
  language: "English",
  manualRating: "5",
  visibility: "visible",
  availableForSale: true,
  images: [
    { id: "img-1", url: "https://picsum.photos/seed/eduvora-scratch/800/600", provider: "public", sortOrder: 0, isPrimary: true },
  ],
  regularPrice: "0",
  salePrice: null,
  coinPrice: 0,
  coinPurchaseEnabled: false,
  isFree: true,
  eligibleCouponIds: [],
  minPayableAmount: "0",
  availabilityDate: null,
  saleStart: null,
  saleEnd: null,
  modules,
  paidUpdates: [],
  status: "published",
};

// The Firestore body — identical to `saveProduct` in src/lib/admin/client.ts.
const mapped = editorToFirestoreBody(form);
const images = form.images.slice().sort((a, b) => a.sortOrder - b.sortOrder);
const docBody = {
  adminProduct: mapped.adminProduct,
  id: PRODUCT_ID,
  title: form.title,
  description: form.shortDescription,
  longDescription: form.longDescription,
  instructor: form.instructor,
  category: form.category,
  subject: form.subject,
  tags: form.tags,
  features: form.features,
  images: images.map((i) => i.url),
  productImages: { card: (images.find((i) => i.isPrimary) || images[0])?.url || "" },
  price: `₹${form.regularPrice || 0}`,
  salePrice: form.salePrice ? `₹${form.salePrice}` : null,
  isFree: Boolean(form.isFree),
  isVisible: form.visibility === "visible",
  inStock: Boolean(form.availableForSale),
  courseContent: mapped.courseContent,
  paidUpdates: mapped.paidUpdates,
};

if (DRY_RUN) {
  console.log("DRY RUN — nothing was written.\n");
  console.log(JSON.stringify({ product: docBody, grant: GRANT_UID ? { uid: GRANT_UID, entitlementId: PRODUCT_ID } : null }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write path (requires FIREBASE_SERVICE_ACCOUNT).
// ---------------------------------------------------------------------------
const loadServiceAccount = async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (raw.trim().startsWith("{")) return JSON.parse(raw);
  const fs = await import("node:fs");
  return JSON.parse(fs.readFileSync(raw, "utf8"));
};

const account = await loadServiceAccount();
if (!account) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT. Re-run with the service account, or use --dry-run to preview.");
  process.exit(1);
}

const { initializeApp, getApps, cert } = await import("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = await import("firebase-admin/firestore");
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(account) });
const db = getFirestore(app);

await db.collection("siteProducts").doc(PRODUCT_ID).set({ ...docBody, updatedAt: Timestamp.now() }, { merge: true });
console.log(`✅ Product written: siteProducts/${PRODUCT_ID} ("${form.title}")`);
console.log(`   ${FILE_TYPES.length} file-type modules, ${FILE_TYPES.length} resources.`);

if (GRANT_UID) {
  const entRef = db.collection("entitlements").doc(`${GRANT_UID}__${PRODUCT_ID}`);
  await entRef.set(
    {
      uid: GRANT_UID,
      productId: PRODUCT_ID,
      kind: "full_product",
      moduleId: null,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: null,
      featureId: null,
      entitlementId: PRODUCT_ID,
      orderId: null,
      paymentId: null,
      status: "active",
      amount: 0,
      currency: "INR",
      source: "admin",
      unlockedAt: Timestamp.now(),
      title: form.title,
      parentTitle: null,
    },
    { merge: true },
  );
  await db
    .collection("users")
    .doc(GRANT_UID)
    .set({ purchasedProductIds: FieldValue.arrayUnion(PRODUCT_ID), updatedAt: Timestamp.now() }, { merge: true });
  console.log(`✅ Full access granted to uid=${GRANT_UID} (entitlements/${GRANT_UID}__${PRODUCT_ID} + users/${GRANT_UID}.purchasedProductIds).`);
}

console.log("\nNext: open the app, sign in, and open the product. Each module = one file type.");
console.log("Modules whose name shows “REPLACE URL” need a real Google/Whimsical link shared as “Anyone with the link”.");
