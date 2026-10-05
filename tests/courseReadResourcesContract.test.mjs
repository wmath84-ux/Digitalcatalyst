import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const courseTypes = read("src/types/course.ts");
const commerceTypes = read("src/types/commerce.ts");
const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const embed = read("src/utils/courseEmbed.ts");
const reader = read("src/course/PdfJsGenericViewer.tsx");
const library = read("src/course/ReadLibraryPanel.tsx");
const admin = read("src/components/admin/products/ModulesResourcesEditor.tsx");
const editor = read("src/components/admin/products/ProductEditor.tsx");
const api = read("src/lib/admin/client.ts");
const mapping = read("utils/productMapping.js");
const storageRules = read("storage.rules");
const vite = read("vite.config.ts");
const serviceWorker = read("public/sw.js");
const docs = read("docs/read-resources.md");

test("Read is additive without changing the official CourseFileType or Note-aware content alias", () => {
  const official = courseTypes.match(/export type CourseFileType =\s*([\s\S]*?);/);
  assert.ok(official);
  assert.equal([...official[1].matchAll(/"([a-z_]+)"/g)].length, 13);
  assert.ok(!official[1].includes('"read"'));
  assert.ok(!official[1].includes('"note"'));
  assert.match(courseTypes, /export type CourseContentFileType = CourseFileType \| CourseInteractiveFileType \| CourseNoteResourceFileType;/);
  assert.match(courseTypes, /export type CourseReadResourceFileType = typeof READ_RESOURCE_FILE_TYPE;/);
  assert.match(courseTypes, /type: CourseContentFileType \| CourseReadResourceFileType;/);
  assert.match(commerceTypes, /\| "read"/);
});

test("Read has its own Course Player dock tab and is excluded from lesson selection, rows and progress", () => {
  assert.match(overlay, /export type DockTab =[^;]*\| "read";/);
  assert.match(overlay, /\{ key: "read", label: "Read", heading: "Read library"/);
  assert.match(overlay, /collectAccessibleReadResources\(props\.modules, unlocked, props\.ownedUpdateIds, props\.productId\)/);
  assert.match(overlay, /unlockedModuleIds\(props\.modules, props\.accessibleModuleIds, props\.ownedUpdateIds\)/);
  assert.match(overlay, /file\.type !== "read" && file\.type !== "note" && isVisibleFile\(file\)/);
  assert.match(player, /allFiles\(modules\)\.filter\(\(file\) => file\.type !== "read" && file\.type !== "note"/);
  assert.match(player, /item\.type !== "read" &&\s*item\.type !== "note"/);
  assert.match(embed, /if \(file\.type === "read"\) return \{ url: "", kind: "none" \}/);
  assert.match(embed, /if \(file\.type === "read"\) return \{ url: "", label: "Read library"/);
});

test("Read viewer is the lazy local PDF.js Generic Viewer, not a hosted or native viewer", () => {
  assert.match(reader, /await import\(\/\* @vite-ignore \*\/ new URL\("pdfjs-viewer-element\.js", viewerBase\)\.href\)/);
  assert.match(reader, /worker-src/);
  assert.match(reader, /pdf\.worker\.min\.mjs/);
  assert.match(reader, /pdf\.sandbox\.min\.mjs/);
  assert.match(reader, /c-map-url/);
  assert.match(reader, /standard-font-data-url/);
  assert.match(reader, /wasm-url/);
  assert.match(reader, /ResizeObserver/);
  assert.doesNotMatch(reader, /mozilla\.github\.io|cdn\.jsdelivr\.net/);
  assert.match(library, /data-course-read-search/);
  assert.match(library, /data-course-read-back/);
  assert.match(library, /sandbox="allow-scripts allow-forms allow-popups allow-downloads"/);
  assert.match(library, /localStorage\.setItem/);
  assert.match(vite, /pdfjs-viewer-assets/);
  assert.match(vite, /pdfjs-viewer\/\$\{PDFJS_VERSION\}/);
  assert.match(vite, /pdfjs-data\/\$\{PDFJS_VERSION\}/);
  assert.match(serviceWorker, /isVersionedPdfJsAsset/);
  assert.ok(serviceWorker.includes("pdfjs-(?:viewer|data)"));
  assert.ok(serviceWorker.includes("6\\.3\\.289"));
  assert.match(docs, /PDF\.js Generic Viewer/);
});

test("admin and Firestore paths validate Read sources, share a finite upload limit and clean only after writes", () => {
  assert.match(admin, /Upload a PDF/);
  assert.match(admin, /Google Drive PDF/);
  assert.match(admin, /Direct PDF URL/);
  assert.match(admin, /Generic embed URL/);
  assert.match(admin, /uploadBytesResumable/);
  assert.match(admin, /READ_PDF_MAX_BYTES/);
  assert.match(editor, /normalizeReadResourceUrl\(r\.url, readSourceKind/);
  assert.match(editor, /cleanupReadUploadsAfterSave\(savedProduct, modules\)/);
  assert.match(editor, /deleteReadStorageObjects\(ownedPaths\)/);
  assert.match(editor, /sanitizeReadUploadsForProduct\(form\.modules, newId\)/);
  assert.match(api, /sanitizeReadUploadsForProduct\(normalizedModules, ref\.id\)/);
  assert.match(mapping, /normalizeReadResourceUrl\(/);
  assert.match(storageRules, /match \/adminProductContent\/read\/\{productId\}\/\{fileName\}/);
  assert.match(storageRules, /request\.resource\.size < 100 \* 1024 \* 1024/);
  assert.match(storageRules, /request\.resource\.contentType == 'application\/pdf'/);
  assert.match(docs, /\*\*smaller than 100 MiB\*\*/);
});
