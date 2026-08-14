import test from "node:test";
import assert from "node:assert/strict";
import {
  editorResourceToCanonical,
  editorResourceToFirestore,
  canonicalResourceToLegacyFile,
  canonicalTreeToLegacyTree,
  firestoreTreeToCanonicalTree,
  editorModulesToFirestoreTree,
} from "../utils/productMapping.js";
import { getCourseEmbed } from "../src/utils/courseEmbed.ts";

// The host player (ResourceViewer) declares these supported embed kinds.
const SUPPORTED_KINDS = new Set([
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
  "none",
]);

// The canonical CourseFileType union the player understands.
const VALID_FILE_TYPES = new Set([
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
]);

// Every editor resource type the Admin Product Editor offers, mapped to a
// representative sample URL (mirrors scripts/seed-scratch-product.mjs).
const EDITOR_TYPES = [
  ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["video_url", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"],
  ["audio_url", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"],
  ["image_url", "https://picsum.photos/seed/eduvora-scratch/1600/900"],
  ["gdrive", "https://drive.google.com/file/d/ABC123XYZ/view"],
  ["pdf", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
  ["gdoc", "https://docs.google.com/document/d/ABC123XYZ/edit"],
  ["gsheet", "https://docs.google.com/spreadsheets/d/ABC123XYZ/edit"],
  ["gslides", "https://docs.google.com/presentation/d/ABC123XYZ/edit"],
  ["gform", "https://docs.google.com/forms/d/e/1FAIpQLSfABC/viewform"],
  ["ebook", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
  ["github_pages", "https://example.com"],
  ["whimsical", "https://whimsical.com/embed/AbCdEfGhIjKlMnOpQrSt"],
  ["iframe", "https://www.openstreetmap.org/export/embed.html?bbox=77.15%2C28.55%2C77.25%2C28.65&layer=mapnik"],
];

const makeResource = (type, url) => ({
  id: `res_${type}`,
  name: type,
  type,
  url,
  provider: "",
  sortOrder: 0,
  visibility: "visible",
  accessLevel: "included",
  paidUpdateId: null,
  cashPrice: null,
  coinPrice: null,
});

test("every editor resource type survives mapping and resolves to a supported player kind", () => {
  for (const [type, url] of EDITOR_TYPES) {
    const canonical = editorResourceToCanonical(makeResource(type, url));
    assert.ok(canonical, `${type} should not be dropped by the URL-only rule`);
    assert.ok(VALID_FILE_TYPES.has(canonical.type), `${type} mapped to unknown player type "${canonical.type}"`);

    const legacy = canonicalResourceToLegacyFile(canonical);
    assert.ok(legacy, `${type} should bridge to a legacy CourseFile`);
    assert.ok(VALID_FILE_TYPES.has(legacy.type), `${type} → legacy type "${legacy.type}" is not a CourseFileType`);

    const embed = getCourseEmbed(legacy);
    assert.ok(SUPPORTED_KINDS.has(embed.kind), `${type} resolved to unsupported kind "${embed.kind}"`);
    if (!url.includes("PASTE_YOUR")) {
      assert.match(embed.url, /^https:\/\//, `${type} should produce an https preview url, got "${embed.url}"`);
    }
  }
});

test("YouTube ids are extracted correctly for watch / youtu.be / shorts / embed", () => {
  const cases = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ];
  for (const [url, expectedId] of cases) {
    const canonical = editorResourceToCanonical(makeResource("youtube", url));
    const legacy = canonicalResourceToLegacyFile(canonical);
    assert.equal(legacy.youtubeVideoId, expectedId, `youtubeVideoId mismatch for ${url}`);
    const embed = getCourseEmbed(legacy);
    assert.equal(embed.kind, "youtube", `kind mismatch for ${url}`);
    assert.ok(
      embed.url.includes(encodeURIComponent(expectedId)),
      `embed url should reference the bare id for ${url}, got ${embed.url}`,
    );
  }
});

test("YouTube bare-id via the youtubeVideoId field still resolves to an embed", () => {
  const canonical = editorResourceToCanonical({
    ...makeResource("youtube", ""),
    url: "",
    youtubeVideoId: "dQw4w9WgXcQ",
  });
  assert.ok(canonical, "bare-id YouTube resource should not be dropped");
  const legacy = canonicalResourceToLegacyFile(canonical);
  const embed = getCourseEmbed(legacy);
  assert.equal(embed.kind, "youtube");
  assert.ok(embed.url.includes("dQw4w9WgXcQ"));
});

test("YouTube bare id / scheme-less / http links are kept and resolve to an embed", () => {
  // Admins often paste a bare 11-char id, a link missing its https:// scheme,
  // or an http:// link. None of these should silently delete the resource and
  // leave the module showing "0 files".
  const urls = [
    "dQw4w9WgXcQ",
    "youtu.be/dQw4w9WgXcQ",
    "www.youtube.com/watch?v=dQw4w9WgXcQ",
    "m.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
  ];
  for (const url of urls) {
    const canonical = editorResourceToCanonical(makeResource("youtube", url));
    assert.ok(canonical, `YouTube "${url}" should not be dropped`);
    assert.equal(canonical.youtubeVideoId, "dQw4w9WgXcQ", `videoId mismatch for "${url}"`);

    const firestore = editorResourceToFirestore(makeResource("youtube", url));
    assert.ok(firestore, `Firestore write should keep "${url}"`);
    assert.equal(firestore.youtubeVideoId, "dQw4w9WgXcQ", `stored videoId mismatch for "${url}"`);

    const legacy = canonicalResourceToLegacyFile(canonical);
    const embed = getCourseEmbed(legacy);
    assert.equal(embed.kind, "youtube", `kind mismatch for "${url}"`);
    assert.ok(embed.url.includes("dQw4w9WgXcQ"), `embed url mismatch for "${url}"`);
  }
});

test("gslides resolves to the slides player kind (Google Slides embed)", () => {
  const canonical = editorResourceToCanonical(
    makeResource("gslides", "https://docs.google.com/presentation/d/ABC123XYZ/edit"),
  );
  assert.equal(canonical.type, "slides");
  const legacy = canonicalResourceToLegacyFile(canonical);
  assert.equal(legacy.type, "slides");
  const embed = getCourseEmbed(legacy);
  assert.equal(embed.kind, "slides");
  assert.match(embed.url, /presentation\/d\/ABC123XYZ\/embed/);
});

test("ebook with a .pdf url renders natively instead of the deprecated gview", () => {
  const canonical = editorResourceToCanonical(
    makeResource("ebook", "https://cdn.example.com/book.pdf"),
  );
  const legacy = canonicalResourceToLegacyFile(canonical);
  const embed = getCourseEmbed(legacy);
  assert.equal(embed.kind, "pdf");
  assert.equal(embed.url, "https://cdn.example.com/book.pdf");
});

test("a full 14-module scratch tree round-trips with one resource per module", () => {
  const modules = EDITOR_TYPES.map(([type, url], index) => ({
    id: `mod_${index + 1}`,
    title: type,
    description: "",
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
    badge: null,
    parentModuleId: null,
    resources: [makeResource(type, url)],
  }));

  const tree = editorModulesToFirestoreTree(modules);
  assert.equal(tree.length, EDITOR_TYPES.length);

  // Each Firestore module carries exactly one file.
  for (const module of tree) {
    assert.equal((module.files || []).length, 1, `${module.title} should have exactly one resource`);
  }

  // Full round-trip: Firestore tree → canonical → legacy (what the
  // CoursePlayerApp consumes) keeps one file per module and a valid type.
  const canonical = firestoreTreeToCanonicalTree(tree);
  const legacy = canonicalTreeToLegacyTree(canonical);
  assert.equal(legacy.length, EDITOR_TYPES.length);
  for (const module of legacy) {
    assert.equal((module.files || []).length, 1);
    assert.ok(VALID_FILE_TYPES.has(module.files[0].type), `unexpected legacy type ${module.files[0].type}`);
  }
});
