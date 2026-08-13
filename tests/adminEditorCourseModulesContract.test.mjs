// tests/adminEditorCourseModulesContract.test.mjs
//
// Locks the fix that makes a product's course modules/files visible (and
// editable) in the Admin Product Editor — the same content the Course Player
// renders. Covers two layers:
//
//   1. The mapping layer (`utils/productMapping.js`) reconstructs editor
//      modules from legacy/demo-shaped course content: resources stored under
//      `files` OR `resources`, YouTube links kept via `youtubeUrl`, and
//      legacy `paidUpdatePrice`/`paidUpdateCoinPrice` surfaced as prices.
//
//   2. The admin client (`src/lib/admin/client.ts`) seeds the editor with the
//      built-in demo course when a product has no course content configured,
//      mirroring the CatalogContext fallback the player uses.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { firestoreModulesToEditorFlat, firestoreResourceToEditor } from "../utils/productMapping.js";

const clientSource = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const mappingSource = fs.readFileSync("utils/productMapping.js", "utf8");

// ─── Mapping: legacy/demo shape → editor modules ────────────────────────────

test("firestoreResourceToEditor keeps a YouTube link stored under youtubeUrl", () => {
  const resource = firestoreResourceToEditor({
    id: "file-yt-1",
    name: "Intro video",
    type: "youtube",
    youtubeUrl: "https://www.youtube.com/watch?v=abc12345678",
    accessLevel: "included",
  });
  assert.equal(resource.type, "youtube");
  assert.equal(resource.url, "https://www.youtube.com/watch?v=abc12345678");
});

test("firestoreModulesToEditorFlat reads resources from files OR resources", () => {
  const viaFiles = firestoreModulesToEditorFlat([
    { id: "m1", title: "A", files: [{ id: "r1", name: "Doc", type: "pdf", url: "https://example.com/a.pdf" }], modules: [] },
  ]);
  const viaResources = firestoreModulesToEditorFlat([
    { id: "m1", title: "A", resources: [{ id: "r1", name: "Doc", type: "pdf", url: "https://example.com/a.pdf" }], modules: [] },
  ]);
  assert.equal(viaFiles[0].resources.length, 1);
  assert.equal(viaResources[0].resources.length, 1);
  assert.equal(viaResources[0].resources[0].url, "https://example.com/a.pdf");
});

test("firestoreModulesToEditorFlat surfaces legacy paidUpdatePrice / CoinPrice", () => {
  const [module] = firestoreModulesToEditorFlat([
    { id: "m1", title: "Premium", files: [], modules: [], accessLevel: "paidUpdate", paidUpdateId: "upd1", paidUpdatePrice: "₹199", paidUpdateCoinPrice: 199 },
  ]);
  assert.equal(module.accessLevel, "paid_update");
  assert.equal(module.cashPrice, 199);
  assert.equal(module.coinPrice, 199);
});

test("firestoreModulesToEditorFlat maps a nested demo course tree into flat editor modules", () => {
  const tree = [
    {
      id: "mod-youtube",
      title: "YouTube Video Lessons",
      files: [{ id: "file-youtube-1", name: "Khan Academy", type: "youtube", youtubeUrl: "https://www.youtube.com/watch?v=aircAruvnVk", accessLevel: "included" }],
      modules: [],
      accessLevel: "included",
      paidUpdatePrice: "₹49",
    },
    {
      id: "mod-video",
      title: "Video Lessons (MP4)",
      files: [{ id: "file-video-1", name: "Big Buck Bunny", type: "video", url: "https://example.com/v.mp4", accessLevel: "included" }],
      modules: [],
      accessLevel: "included",
    },
  ];
  const modules = firestoreModulesToEditorFlat(tree);
  assert.equal(modules.length, 2);
  assert.equal(modules[0].resources[0].type, "youtube");
  assert.match(modules[0].resources[0].url, /youtube\.com/);
  assert.equal(modules[1].resources[0].type, "video_url");
});

// ─── Admin client: demo-course fallback ─────────────────────────────────────

test("admin client seeds the editor with demo course modules when a product has none", () => {
  assert.match(clientSource, /fullDemoCourseContent/);
  assert.match(clientSource, /firestoreModulesToEditorFlat\(fullDemoCourseContent\)/);
  assert.match(clientSource, /form\.modules = firestoreModulesToEditorFlat/);
  assert.match(clientSource, /demoPaidUpdatesFromContent/);
});

test("admin client also seeds paid updates from the demo content", () => {
  assert.match(clientSource, /paidUpdateId/);
  assert.match(clientSource, /includedIds/);
});

test("mapping layer documents the files-or-resources round trip", () => {
  assert.match(mappingSource, /m\.files\?\.length \? m\.files : m\.resources/);
  assert.match(mappingSource, /numOrNull\(m\.cashPrice\) \?\? numOrNull\(m\.paidUpdatePrice\)/);
});
