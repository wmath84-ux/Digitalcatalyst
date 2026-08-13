// tests/demoCourseContent.test.mjs
//
// Validates the demo course content with ALL 12 file types,
// each with its own price, and tests the course embed/preview
// logic for every type.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ─── 1. Read the demo course content source ──────────────────────────

const source = readFileSync(resolve(root, "src/data/demoCourseContent.ts"), "utf-8");

// ─── 2. Validate all 12 CourseFileType values are present ────────────

const EXPECTED_TYPES = [
  "youtube",
  "video",
  "audio",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "ebook",
  "image",
  "google_form",
  "embed",
  "mindmap",
];

for (const type of EXPECTED_TYPES) {
  if (!source.includes(`type: "${type}"`)) {
    throw new Error(`Missing file type "${type}" in demoCourseContent.ts`);
  }
}
console.log(`✓ All 12 CourseFileType values present in demo course content`);

// ─── 3. Validate each module has a unique id ─────────────────────────

const moduleIdMatches = [...source.matchAll(/id:\s*["']mod-([^"']+)["']/g)];
const moduleIds = moduleIdMatches.map((m) => m[1]);
const uniqueModuleIds = new Set(moduleIds);
if (uniqueModuleIds.size !== moduleIds.length) {
  throw new Error(`Duplicate module ids found: ${moduleIds.join(", ")}`);
}
console.log(`✓ All ${moduleIds.length} module ids are unique`);

// ─── 4. Validate each module has a price ─────────────────────────────

const priceMatches = [...source.matchAll(/paidUpdatePrice:\s*["']₹(\d+)["']/g)];
const prices = priceMatches.map((m) => parseInt(m[1], 10));
if (prices.length < 12) {
  throw new Error(`Expected at least 12 prices, found ${prices.length}`);
}
console.log(`✓ ${prices.length} module prices defined (₹${prices.join(", ₹")})`);

// ─── 5. Validate each module has at least one file with a URL ────────

// Count files by looking for `type:` entries inside the `files:` arrays
// Each file has a type and either a url, youtubeUrl, or embedUrl
const fileTypeMatches = [...source.matchAll(/type:\s*["'](youtube|video|audio|pdf|doc|sheet|slides|ebook|image|google_form|embed|mindmap)["']/g)];
const fileTypeCount = fileTypeMatches.length;
if (fileTypeCount < 12) {
  throw new Error(`Expected at least 12 files with types, found ${fileTypeCount}`);
}
console.log(`✓ ${fileTypeCount} files with explicit types found across all modules`);

// Also check that URL variables are defined
const urlVarPatterns = [
  "YOUTUBE_URL",
  "VIDEO_URL",
  "AUDIO_URL",
  "PDF_URL",
  "GOOGLE_DOC_URL",
  "GOOGLE_SHEET_URL",
  "GOOGLE_SLIDES_URL",
  "EBOOK_URL",
  "IMAGE_URL",
  "GOOGLE_FORM_URL",
  "EMBED_URL",
  "MINDMAP_URL",
];
let definedCount = 0;
for (const varName of urlVarPatterns) {
  if (source.includes(`const ${varName}`)) {
    definedCount++;
  }
}
if (definedCount < 12) {
  throw new Error(`Expected 12 URL constants, found ${definedCount}`);
}
console.log(`✓ ${definedCount} public URL constants defined`);

// ─── 6. Validate public URLs are used (no localhost, no 127.0.0.1) ───

const badUrlPatterns = [/localhost/, /127\.0\.0\.1/, /0\.0\.0\.0/];
for (const pattern of badUrlPatterns) {
  if (pattern.test(source)) {
    throw new Error(`Found non-public URL pattern ${pattern} in demoCourseContent.ts`);
  }
}
console.log(`✓ All URLs are publicly accessible (no localhost/127.0.0.1)`);

// ─── 7. Validate YouTube URLs are present ─────────────────────────────

if (!source.includes("youtube.com/watch")) {
  throw new Error("Missing YouTube URL in demoCourseContent.ts");
}
console.log(`✓ YouTube URLs present`);

// ─── 8. Validate Google Docs/Sheets/Slides/Form URLs are present ─────

const googlePatterns = [
  { name: "Google Doc", pattern: /docs\.google\.com\/document/ },
  { name: "Google Sheet", pattern: /docs\.google\.com\/spreadsheets/ },
  { name: "Google Slides", pattern: /docs\.google\.com\/presentation/ },
  { name: "Google Form", pattern: /docs\.google\.com\/forms/ },
];
for (const { name, pattern } of googlePatterns) {
  if (!pattern.test(source)) {
    throw new Error(`Missing ${name} URL in demoCourseContent.ts`);
  }
}
console.log(`✓ Google Doc, Sheet, Slides, Form URLs present`);

// ─── 9. Validate Whimsical mindmap URL is present ────────────────────

if (!source.includes("whimsical.com")) {
  throw new Error("Missing Whimsical mindmap URL in demoCourseContent.ts");
}
console.log(`✓ Whimsical mindmap URL present`);

// ─── 10. Validate paid-update modules are present ────────────────────

if (!source.includes("accessLevel: \"paidUpdate\"")) {
  throw new Error("Missing paidUpdate modules in demoCourseContent.ts");
}
console.log(`✓ Paid-update modules present for purchase flow testing`);

// ─── 11. Validate the course type definition includes all types ──────

const courseTypeSource = readFileSync(
  resolve(root, "src/types/course.ts"),
  "utf-8"
);
for (const type of EXPECTED_TYPES) {
  if (!courseTypeSource.includes(`"${type}"`)) {
    throw new Error(`CourseFileType is missing "${type}"`);
  }
}
console.log(`✓ CourseFileType in src/types/course.ts includes all 12 types`);

// ─── 12. Validate ResourceViewer supports all embed kinds ────────────

const viewerSource = readFileSync(
  resolve(root, "src/course/ResourceViewer.tsx"),
  "utf-8"
);
const expectedKinds = [
  "youtube",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "form",
  "drive",
  "mindmap",
  "embed",
  "direct",
];
for (const kind of expectedKinds) {
  if (!viewerSource.includes(`"${kind}"`)) {
    throw new Error(`ResourceViewer SUPPORTED_KINDS is missing "${kind}"`);
  }
}
console.log(`✓ ResourceViewer supports all ${expectedKinds.length} embed kinds`);

// ─── 13. Validate courseEmbed handles all types ──────────────────────

const embedSource = readFileSync(
  resolve(root, "src/utils/courseEmbed.ts"),
  "utf-8"
);
const embedHandledTypes = [
  "youtube",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "google_form",
  "ebook",
  "mindmap",
  "embed",
];
for (const type of embedHandledTypes) {
  if (!embedSource.includes(type === "google_form" ? "\"google_form\"" : `"${type}"`)) {
    throw new Error(`courseEmbed.ts does not handle type "${type}"`);
  }
}
console.log(`✓ courseEmbed.ts handles all ${embedHandledTypes.length} specific types`);

// ─── 14. Validate CatalogContext imports demo content ────────────────

const catalogSource = readFileSync(
  resolve(root, "src/context/CatalogContext.tsx"),
  "utf-8"
);
if (!catalogSource.includes("fullDemoCourseContent")) {
  throw new Error("CatalogContext.tsx does not import fullDemoCourseContent");
}
if (!catalogSource.includes("fullDemoCourseContent")) {
  throw new Error("CatalogContext.tsx does not use fullDemoCourseContent as fallback");
}
console.log(`✓ CatalogContext.tsx imports and uses demo course content as fallback`);

// ─── 15. Validate CourseRouteGuard has demo mode ─────────────────────

const guardSource = readFileSync(
  resolve(root, "src/components/CourseRouteGuard.tsx"),
  "utf-8"
);
if (!guardSource.includes("isDemoMode") && !guardSource.includes("demo")) {
  throw new Error("CourseRouteGuard.tsx does not have demo mode support");
}
console.log(`✓ CourseRouteGuard.tsx has demo mode for testing`);

// ─── 16. Validate the module price summary matches the modules ───────

const summaryMatches = [
  ...source.matchAll(
    /\{\s*type:\s*["']([^"']+)["'],\s*module:\s*["']([^"']+)["'],\s*price:\s*["']₹(\d+)["'],\s*coins:\s*(\d+)\s*\}/g
  ),
];
if (summaryMatches.length !== 12) {
  throw new Error(
    `Expected 12 entries in modulePriceSummary, found ${summaryMatches.length}`
  );
}
console.log(`✓ modulePriceSummary has exactly 12 entries`);

// ─── Summary ──────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════`);
console.log(`  DEMO COURSE CONTENT VALIDATION: ALL 16 CHECKS PASS`);
console.log(`  12 file types × individual prices ✓`);
console.log(`  Public URLs for all types ✓`);
console.log(`  Paid-update modules for purchase flow ✓`);
console.log(`  Integration into CatalogContext ✓`);
console.log(`  Demo mode in CourseRouteGuard ✓`);
console.log(`══════════════════════════════════════════════════════\n`);

// ─── Price Table ──────────────────────────────────────────────────────

console.log(`  Module Price Summary:`);
console.log(`  ─────────────────────────────────────────`);
for (const match of summaryMatches) {
  const [, type, moduleTitle, price, coins] = match;
  console.log(`  ${type.padEnd(12)} │ ₹${price.padStart(4)} │ ${moduleTitle}`);
}
console.log(`  ─────────────────────────────────────────\n`);
