// tests/personalCourseContract.test.mjs
//
// Contract tests for the Personal Course Modules ("My Modules") pure layer
// (utils/personalCourse.js) — the single source shared by the Course Player
// UI, the admin plan editor and the server-authoritative API:
//
//   · the 12-type registry matches the existing CourseFileType union;
//   · per-plan / per-billing-duration defaults + normalization (paid plans
//     on by default with 5 modules / 50 resources / 20 per module / all 12
//     types; free plans off; migration-safe for old plan docs);
//   · entitlement resolution (plan + cycle + status + expiry) — never
//     inferred from price or client state;
//   · the central URL validation/normalization layer for all 12 types
//     (dangerous protocols rejected, Google + YouTube + Whimsical
//     canonicalization, friendly messages);
//   · structure caps + honest AI availability + provenance labels.
//
// Follows the existing pattern: imports the pure .js runtime directly, so
// `node --test` runs it without any build step.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_PERSONAL_COURSE_TYPES,
  PERSONAL_COURSE_TYPE_ORDER,
  PERSONAL_MODULE_DEFAULT_LIMITS,
  defaultPersonalModulesForPlan,
  isActiveSubscription,
  isPersonalCourseType,
  isPersonalTypeAllowed,
  normalizePersonalResourceUrl,
  normalizePlanPersonalModules,
  personalAllowedTypes,
  personalCourseTypeLabel,
  personalLimitMessage,
  personalModulesCycle,
  personalProvenanceLabel,
  personalAiAvailability,
  resolvePersonalModulesEntitlement,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
  usageAtModuleLimit,
  usageAtResourceLimit,
} from "../utils/personalCourse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const FUTURE = Date.now() + 30 * DAY;
const activeRecord = (overrides = {}) => ({
  planId: "basic",
  cycle: "monthly",
  status: "active",
  expiresAt: FUTURE,
  features: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. The 12-type registry matches the existing CourseFileType union
// ---------------------------------------------------------------------------

test("exactly the 12 required types exist with friendly labels", () => {
  assert.deepEqual(ALL_PERSONAL_COURSE_TYPES, [
    "youtube", "video", "audio", "pdf", "doc", "sheet", "slides",
    "ebook", "image", "google_form", "embed", "mindmap",
  ]);
  assert.equal(PERSONAL_COURSE_TYPE_ORDER.length, 12);
  assert.equal(personalCourseTypeLabel("youtube"), "YouTube");
  assert.equal(personalCourseTypeLabel("video"), "Video / MP4");
  assert.equal(personalCourseTypeLabel("doc"), "Google Docs");
  assert.equal(personalCourseTypeLabel("sheet"), "Google Sheets");
  assert.equal(personalCourseTypeLabel("slides"), "Google Slides");
  assert.equal(personalCourseTypeLabel("google_form"), "Google Form");
  assert.equal(personalCourseTypeLabel("embed"), "Embed / Website");
  assert.equal(personalCourseTypeLabel("mindmap"), "Mindmap");
});

test("registry values are a subset of the CourseFileType union in src/types/course.ts", () => {
  const courseTypesSource = readSource("src/types/course.ts");
  const union = courseTypesSource.match(/export type CourseFileType = "([^"]+)"(?:\s*\|\s*"([^"]+)")+/);
  assert.ok(union, "CourseFileType union must exist in src/types/course.ts");
  const match = courseTypesSource.match(/export type CourseFileType = ([\s\S]*?);/);
  assert.ok(match, "CourseFileType union must exist in src/types/course.ts");
  const unionText = match[1];
  const declaredTypes = [...unionText.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  for (const type of ALL_PERSONAL_COURSE_TYPES) {
    assert.ok(declaredTypes.includes(type), `${type} must stay inside CourseFileType`);
  }
  assert.equal(ALL_PERSONAL_COURSE_TYPES.length, declaredTypes.length, "registry must not drift from the union");
});

// ---------------------------------------------------------------------------
// 2. Defaults — paid plans on, free plans off
// ---------------------------------------------------------------------------

test("paid plans default to enabled with 5 modules / 50 resources / 20 per module / all types", () => {
  const config = defaultPersonalModulesForPlan("basic", 19900, 199000);
  assert.equal(config.enabled, true);
  assert.equal(config.customEmbedEnabled, true);
  for (const cycle of ["monthly", "yearly"]) {
    assert.deepEqual(personalModulesCycle(config, cycle), {
      moduleLimit: PERSONAL_MODULE_DEFAULT_LIMITS.moduleLimit,
      resourceLimit: PERSONAL_MODULE_DEFAULT_LIMITS.resourceLimit,
      perModuleResourceLimit: PERSONAL_MODULE_DEFAULT_LIMITS.perModuleResourceLimit,
      allowedTypes: null,
    });
    assert.deepEqual(personalAllowedTypes(config, cycle), ALL_PERSONAL_COURSE_TYPES);
  }
});

test("free plans (zero priced or free/trial ids) default to disabled", () => {
  assert.equal(defaultPersonalModulesForPlan("free", 0, 0).enabled, false);
  assert.equal(defaultPersonalModulesForPlan("basic-free-trial", 19900, 199000).enabled, false);
  // A plan id that just contains "free" as a word but is priced is still free-ish by id.
  assert.equal(defaultPersonalModulesForPlan("free-access", 0, 0).enabled, false);
});

test("existing plan docs without the new fields migrate safely via normalization", () => {
  const legacyPaidPlan = { id: "basic", name: "Basic", monthlyPrice: 199, yearlyPrice: 1990 };
  const config = normalizePlanPersonalModules(legacyPaidPlan, "basic");
  assert.equal(config.enabled, true);
  assert.equal(personalModulesCycle(config, "monthly").moduleLimit, 5);
  const legacyFreePlan = { id: "free", name: "Free", monthlyPrice: 0, yearlyPrice: 0 };
  assert.equal(normalizePlanPersonalModules(legacyFreePlan, "free").enabled, false);
});

test("flat legacy fields map onto both durations; structured block wins", () => {
  const config = normalizePlanPersonalModules({
    id: "basic",
    personalModulesEnabled: true,
    personalModuleLimit: 3,
    personalResourceLimit: 15,
    personalMaxResourcesPerModule: 10,
    personalAllowedResourceTypes: ["youtube", "pdf"],
    personalCustomEmbedEnabled: false,
  }, "basic");
  assert.equal(config.enabled, true);
  assert.equal(config.customEmbedEnabled, false);
  assert.equal(isPersonalTypeAllowed(config, "monthly", "embed"), false);
  assert.equal(isPersonalTypeAllowed(config, "yearly", "embed"), false);
  for (const cycle of ["monthly", "yearly"]) {
    const slice = personalModulesCycle(config, cycle);
    assert.equal(slice.moduleLimit, 3);
    assert.equal(slice.resourceLimit, 15);
    assert.equal(slice.perModuleResourceLimit, 10);
    assert.deepEqual(slice.allowedTypes, ["youtube", "pdf"]);
  }
  const structured = normalizePlanPersonalModules({
    id: "pro",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    personalModules: {
      enabled: true,
      monthly: { moduleLimit: 10, resourceLimit: 100 },
      yearly: { moduleLimit: 30, resourceLimit: 300, allowedTypes: ["pdf", "image"] },
    },
  }, "pro");
  assert.equal(personalModulesCycle(structured, "monthly").moduleLimit, 10);
  assert.equal(personalModulesCycle(structured, "yearly").moduleLimit, 30);
  assert.deepEqual(personalAllowedTypes(structured, "yearly"), ["pdf", "image"]);
  // Structured `enabled:false` beats the paid default.
  const off = normalizePlanPersonalModules({ id: "pro", monthlyPrice: 999, personalModules: { enabled: false } }, "pro");
  assert.equal(off.enabled, false);
});

test("monthly and yearly limits are independently configurable", () => {
  const config = normalizePlanPersonalModules({
    id: "basic",
    monthlyPrice: 199,
    yearlyPrice: 1990,
    personalModules: {
      enabled: true,
      monthly: { moduleLimit: 3, resourceLimit: 15, perModuleResourceLimit: 5, allowedTypes: ["youtube", "pdf"] },
      yearly: { moduleLimit: 10, resourceLimit: 60, perModuleResourceLimit: 20, allowedTypes: null },
    },
  }, "basic");
  assert.deepEqual(personalModulesCycle(config, "monthly"), {
    moduleLimit: 3, resourceLimit: 15, perModuleResourceLimit: 5, allowedTypes: ["youtube", "pdf"],
  });
  assert.deepEqual(personalModulesCycle(config, "yearly"), {
    moduleLimit: 10, resourceLimit: 60, perModuleResourceLimit: 20, allowedTypes: null,
  });
  assert.equal(isPersonalTypeAllowed(config, "monthly", "image"), false);
  assert.equal(isPersonalTypeAllowed(config, "yearly", "image"), true);
});

// ---------------------------------------------------------------------------
// 3. Entitlement resolution
// ---------------------------------------------------------------------------

test("user without an active subscription is not entitled", () => {
  const result = resolvePersonalModulesEntitlement({ record: null });
  assert.equal(result.status, "not-entitled");
  assert.equal(result.entitled, false);
});

test("expired / cancelled / paused records are never entitled", () => {
  for (const status of ["cancelled", "expired", "paused"]) {
    const result = resolvePersonalModulesEntitlement({ record: activeRecord({ status }) });
    assert.equal(result.entitled, false, status);
  }
  const expired = resolvePersonalModulesEntitlement({ record: activeRecord({ expiresAt: Date.now() - DAY }) });
  assert.equal(expired.entitled, false);
});

test("eligible monthly + yearly users are entitled with their own cycle's limits", () => {
  const plan = {
    id: "basic", name: "Basic", monthlyPrice: 199, yearlyPrice: 1990,
    personalModules: {
      enabled: true,
      monthly: { moduleLimit: 3, resourceLimit: 15, perModuleResourceLimit: 5, allowedTypes: ["youtube"] },
      yearly: { moduleLimit: 10, resourceLimit: 60, perModuleResourceLimit: 20, allowedTypes: null },
    },
  };
  const monthly = resolvePersonalModulesEntitlement({ record: activeRecord({ planId: "basic", cycle: "monthly" }), plan });
  assert.equal(monthly.entitled, true);
  assert.equal(monthly.cycle, "monthly");
  assert.equal(monthly.limits.moduleLimit, 3);
  const yearly = resolvePersonalModulesEntitlement({ record: activeRecord({ planId: "basic", cycle: "yearly" }), plan });
  assert.equal(yearly.cycle, "yearly");
  assert.equal(yearly.limits.moduleLimit, 10);
});

test("admin-disabled feature yields a 'disabled' state even on an active paid plan", () => {
  const plan = { id: "pro", name: "Pro", monthlyPrice: 999, personalModules: { enabled: false } };
  const result = resolvePersonalModulesEntitlement({ record: activeRecord({ planId: "pro" }), plan });
  assert.equal(result.status, "disabled");
  assert.equal(result.entitled, false);
  assert.equal(result.planName, "Pro");
});

test("isActiveSubscription accepts Firestore + admin timestamps", () => {
  const record = activeRecord({
    expiresAt: { seconds: Math.floor(FUTURE / 1000), nanoseconds: 0 },
  });
  assert.equal(isActiveSubscription(record), true);
  const adminRecord = activeRecord({ expiresAt: { toMillis: () => FUTURE } });
  assert.equal(isActiveSubscription(adminRecord), true);
});

test("usage-at-limit helpers match the requirement semantics", () => {
  const limits = { moduleLimit: 5, resourceLimit: 50, perModuleResourceLimit: 20, allowedTypes: null };
  assert.equal(usageAtModuleLimit({ moduleCount: 5, resourceCount: 10 }, limits), true);
  assert.equal(usageAtModuleLimit({ moduleCount: 4, resourceCount: 10 }, limits), false);
  assert.equal(usageAtResourceLimit({ moduleCount: 5, resourceCount: 50 }, limits), true);
  assert.equal(usageAtResourceLimit({ moduleCount: 5, resourceCount: 49 }, limits), false);
});

test("limit messages are user-friendly and carry the plan name", () => {
  const limits = { moduleLimit: 5, resourceLimit: 50, perModuleResourceLimit: 20, allowedTypes: null };
  assert.equal(personalLimitMessage("module", limits, "Basic"), "You've reached your 5-module limit on Basic.");
  assert.equal(personalLimitMessage("resource", limits, null), "You've reached your 50-resource limit on this plan.");
  assert.equal(personalLimitMessage("per-module", limits, "Basic"), "This module is at its 20-resource limit on Basic.");
});

// ---------------------------------------------------------------------------
// 4. URL validation — security + canonicalization for all 12 types
// ---------------------------------------------------------------------------

test("dangerous URL forms are rejected for every type", () => {
  for (const type of ALL_PERSONAL_COURSE_TYPES) {
    assert.equal(normalizePersonalResourceUrl(type, "javascript:alert(1)").ok, false, `javascript: ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "data:text/html,<script>1</script>").ok, false, `data: ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "vbscript:x").ok, false, `vbscript: ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "http://example.com/x").ok, false, `http: ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "").ok, false, `empty ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "https://user:pass@example.com/x").ok, false, `credentials ${type}`);
    assert.equal(normalizePersonalResourceUrl(type, "not a url").ok, false, `garbage ${type}`);
  }
});

test("YouTube URL normalization handles watch / youtu.be / shorts / embed / bare ids", () => {
  const ID = "aircAruvnVk";
  const cases = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?t=42`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    ID,
  ];
  for (const value of cases) {
    const result = normalizePersonalResourceUrl("youtube", value);
    assert.equal(result.ok, true, value);
    assert.equal(result.canonical.youtubeVideoId, ID, value);
    assert.equal(result.canonical.youtubeUrl, `https://www.youtube.com/watch?v=${ID}`, value);
  }
  assert.equal(normalizePersonalResourceUrl("youtube", "https://www.youtube.com/watch?v=tooshort").ok, false);
  assert.equal(normalizePersonalResourceUrl("youtube", "https://www.youtube.com/playlist?list=PL123").ok, false);
});

test("video / audio accept direct file URLs only — never web pages", () => {
  assert.ok(normalizePersonalResourceUrl("video", "https://cdn.example.com/lesson.mp4").ok);
  assert.ok(normalizePersonalResourceUrl("video", "https://cdn.example.com/lesson.mp4?download=1").ok);
  assert.ok(normalizePersonalResourceUrl("video", "https://drive.google.com/file/d/1abc/view").ok);
  assert.equal(normalizePersonalResourceUrl("video", "https://www.youtube.com/watch?v=aircAruvnVk").ok, false);
  assert.equal(normalizePersonalResourceUrl("video", "https://example.com/watch.html").ok, false);
  assert.ok(normalizePersonalResourceUrl("audio", "https://cdn.example.com/podcast.mp3").ok);
  assert.equal(normalizePersonalResourceUrl("audio", "https://example.com/podcast.html").ok, false);
});

test("PDF validation accepts .pdf + Drive and rejects arbitrary pages", () => {
  assert.ok(normalizePersonalResourceUrl("pdf", "https://example.com/notes.pdf").ok);
  assert.ok(normalizePersonalResourceUrl("pdf", "https://drive.google.com/file/d/1doc/view").ok);
  assert.equal(normalizePersonalResourceUrl("pdf", "https://example.com/notes.docx").ok, false);
  assert.equal(normalizePersonalResourceUrl("pdf", "https://example.com/landing").ok, false);
});

test("Google Docs/Sheets/Slides URLs normalize and cross-type links are rejected", () => {
  const doc = normalizePersonalResourceUrl("doc", "https://docs.google.com/document/d/1Doc/edit?usp=sharing#heading=h.x");
  assert.equal(doc.ok, true);
  assert.equal(doc.canonical.url, "https://docs.google.com/document/d/1Doc");
  const sheet = normalizePersonalResourceUrl("sheet", "https://docs.google.com/spreadsheets/d/1Sheet/htmlview");
  assert.ok(sheet.ok);
  assert.equal(sheet.canonical.url, "https://docs.google.com/spreadsheets/d/1Sheet");
  const slides = normalizePersonalResourceUrl("slides", "https://docs.google.com/presentation/d/1Slides/present?slide=id.p");
  assert.ok(slides.ok);
  assert.equal(slides.canonical.url, "https://docs.google.com/presentation/d/1Slides");
  // Mismatch: docs link under sheets.
  const mismatch = normalizePersonalResourceUrl("sheet", "https://docs.google.com/document/d/1Doc/edit");
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "GOOGLE_KIND_MISMATCH");
  // Non-Google host never validates for the Google types.
  assert.equal(normalizePersonalResourceUrl("doc", "https://example.com/x").ok, false);
});

test("Google Form URLs are normalized to the embedded viewform form", () => {
  const form = normalizePersonalResourceUrl("google_form", "https://docs.google.com/forms/d/e/1FAIpQLSf9x/viewform?usp=sf_link");
  assert.equal(form.ok, true);
  assert.match(form.canonical.url, /\/viewform\?/);
  assert.match(form.canonical.url, /embedded=true/);
  const gle = normalizePersonalResourceUrl("google_form", "https://forms.gle/AbCdEfG123");
  assert.equal(gle.ok, true);
  assert.match(gle.canonical.url, /embedded=true/);
  // An edit link becomes viewform.
  const edit = normalizePersonalResourceUrl("google_form", "https://docs.google.com/forms/d/e/1FAIpQLSf9x/edit");
  assert.equal(edit.ok, true);
  assert.match(edit.canonical.url, /\/viewform/);
});

test("image validation accepts image files + Drive and rejects pages", () => {
  assert.ok(normalizePersonalResourceUrl("image", "https://i.imgur.com/abc.png").ok);
  assert.ok(normalizePersonalResourceUrl("image", "https://cdn.example.com/pic.webp?w=100").ok);
  assert.equal(normalizePersonalResourceUrl("image", "https://example.com/page.html").ok, false);
});

test("embed/website keeps strong validation and blocks private hosts", () => {
  assert.ok(normalizePersonalResourceUrl("embed", "https://example.com/interactive").ok);
  assert.ok(normalizePersonalResourceUrl("embed", "https://github.com/user/repo").ok);
  assert.equal(normalizePersonalResourceUrl("embed", "https://localhost:3000/x").ok, false);
  assert.equal(normalizePersonalResourceUrl("embed", "https://192.168.1.1/x").ok, false);
  assert.equal(normalizePersonalResourceUrl("embed", "https://10.0.0.5/x").ok, false);
});

test("mindmap accepts Whimsical links and canonicalizes to the embed form", () => {
  const direct = normalizePersonalResourceUrl("mindmap", "https://whimsical.com/embed/Lz5g1RqDfM3xKrBxYv7");
  assert.ok(direct.ok);
  assert.equal(direct.canonical.provider, "whimsical_mindmap");
  const board = normalizePersonalResourceUrl("mindmap", "https://whimsical.com/flowchart-Lz5g1RqDfM3xKrBxYv7@2Ux7HV9wA7f");
  assert.equal(board.ok, true);
  assert.match(board.canonical.url, /^https:\/\/whimsical\.com\/embed\//);
  assert.equal(normalizePersonalResourceUrl("mindmap", "https://www.figma.com/file/abc").ok, false);
});

test("ebook preserves existing fallback behaviour (PDF native, others via gview)", () => {
  const pdf = normalizePersonalResourceUrl("ebook", "https://example.com/book.pdf");
  assert.equal(pdf.ok, true);
  assert.equal(pdf.canonical.contentType, "application/pdf");
  const epub = normalizePersonalResourceUrl("ebook", "https://example.com/book.epub");
  assert.equal(epub.ok, true);
  const other = normalizePersonalResourceUrl("ebook", "https://example.com/publication");
  assert.equal(other.ok, true);
});

// ---------------------------------------------------------------------------
// 5. Structure validation
// ---------------------------------------------------------------------------

test("module input: trims, rejects empty titles and over-long text", () => {
  const empty = sanitizePersonalModuleInput({ title: "   " });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors[0].code, "REQUIRED");
  const good = sanitizePersonalModuleInput({ title: "  My Formulas  ", description: "  Notes  " });
  assert.equal(good.ok, true);
  assert.deepEqual(good.value, { title: "My Formulas", description: "Notes" });
  const tooLong = sanitizePersonalModuleInput({ title: "x".repeat(121) });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.errors[0].code, "TOO_LONG");
  const longDesc = sanitizePersonalModuleInput({ title: "ok", description: "y".repeat(601) });
  assert.equal(longDesc.ok, false);
});

test("resource input validates type, name, and URL through the central layer", () => {
  const badType = sanitizePersonalResourceInput({ type: "not-a-type", url: "https://x.com/a.mp4" });
  assert.equal(badType.ok, false);
  assert.equal(badType.errors[0].code, "TYPE_UNKNOWN");
  const disallowed = sanitizePersonalResourceInput(
    { type: "image", name: "Pic", url: "https://x.com/a.png" },
    { allowedTypes: ["youtube", "pdf"] },
  );
  assert.equal(disallowed.ok, false);
  assert.equal(disallowed.errors[0].code, "TYPE_NOT_ALLOWED");
  const badUrl = sanitizePersonalResourceInput({ type: "pdf", name: "", url: "https://x.com/page.html" });
  assert.equal(badUrl.ok, false);
  assert.equal(badUrl.errors[0].code, "PDF_URL_INVALID");
  const good = sanitizePersonalResourceInput({
    type: "youtube",
    name: "",
    url: "https://youtu.be/aircAruvnVk",
  });
  assert.equal(good.ok, true);
  assert.equal(good.value.youtubeVideoId, "aircAruvnVk");
  assert.equal(good.value.name, "YouTube — aircAruvnVk");
  const giantName = sanitizePersonalResourceInput({ type: "pdf", name: "n".repeat(130), url: "https://x.com/a.pdf" });
  assert.equal(giantName.ok, false);
});

test("module ids must look like safe doc ids", async () => {
  const { isValidPersonalId } = await import("../utils/personalCourse.js");
  assert.equal(isValidPersonalId("mod_abc-123"), true);
  assert.equal(isValidPersonalId(""), false);
  assert.equal(isValidPersonalId("../etc"), false);
  assert.equal(isValidPersonalId("a".repeat(200)), false);
});

// ---------------------------------------------------------------------------
// 6. AI-context honesty + provenance
// ---------------------------------------------------------------------------

test("personal resources are never claimed AI-readable when no real pipeline exists", () => {
  for (const type of ALL_PERSONAL_COURSE_TYPES) {
    const availability = personalAiAvailability(type);
    assert.equal(availability.readable, false, type);
    assert.ok(availability.reason.length > 0, type);
  }
});

test("provenance labels read 'My Modules → module → resource'", () => {
  assert.equal(
    personalProvenanceLabel("Chapter X", "Video Y"),
    "My Modules → Chapter X → Video Y",
  );
  assert.equal(personalProvenanceLabel("", "Video Y"), "My Modules → Video Y");
});
