// tests/coursePlayerAiGroundingContract.test.mjs
//
// Why the Course Player's AI used to answer "I don't have access to this
// module" to *every* message — and the four things that must stay true so it
// cannot come back.
//
// The learner's access was never the problem. The problem was the scope:
//
//   · An official lesson's module id is minted by the admin as `mod_<base36>`,
//     which passes `isValidPersonalId`, so the ask was routed into the
//     personal-module resolver, looked under `users/{uid}/personalCourseModules`,
//     found nothing and answered 404 "That module isn't available to this
//     account."
//   · When the id did not look like a personal one, the Course Player branch
//     returned a virtual scope whose `resources` was hard-coded to `[]`. The
//     model was handed an empty CONTENT block plus an instruction never to
//     answer from memory — and obeyed, in every module, for every file type.
//
// Both are fixed by resolving official lessons against the real course tree
// under the learner's real entitlements. These are source-level contracts (the
// handler imports firebase-admin and cannot run under `node --test`), written
// the same way as tests/aiGateCopyClarityContract.test.mjs.
//
// Run: node --test tests/coursePlayerAiGroundingContract.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const server = read("api/_lib/personalAi.ts");
const extractor = read("api/_lib/personalAiContent.ts");
const lumenApp = read("src/lumen/App.tsx");
const productionAi = read("src/lumen/productionAi.ts");
const aiClient = read("src/ai/personalAiClient.ts");
const player = read("src/CoursePlayerApp.tsx");
const courseTypes = read("src/types/course.ts");
const adapters = read("src/lumen/course/adapters.ts");
const bridge = read("src/lumen/course/bridge.ts");
const grounding = read("src/lumen/ai/courseGrounding.ts");
const contentService = read("src/lumen/course/contentService.ts");
const personalLayer = read("utils/personalAi.js");

/** Slice of a source file between two markers, for scoped assertions. */
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `missing marker: ${from}`);
  const end = source.indexOf(to, start);
  assert.notEqual(end, -1, `missing end marker: ${to}`);
  return source.slice(start, end);
};

/* ── 1. the official scope is resolved, not stubbed ───────────────── */

test("an official lesson resolves to its real module files", () => {
  const resolver = between(server, "async function officialCoursePlayerScope", "async function resolveAskScope");
  // It reads the course document, and the ids the player supplied.
  assert.match(resolver, /await loadCourseProductForAi\(db, productId, text\(ctx\.productDocumentId\)\)/);
  assert.match(server, /async function loadCourseProductForAi/);
  assert.match(server, /db\.collection\("siteProducts"\)\.doc\(candidate\)\.get\(\)/);
  assert.match(resolver, /text\(ctx\.moduleId\) \|\| text\(body\.moduleId\)/, "the open module must be identifiable");
  assert.match(resolver, /text\(ctx\.resourceId\) \|\| text\(body\.resourceId\)/, "and the open file too");
  assert.match(server, /firestoreToCatalogProduct\(raw, snapshot\.id\)/, "through the same product mapping the player uses");
  // Access is the player's own resolver, so the AI can never open a locked module.
  assert.match(resolver, /await resolveLearnerCourseAccess\(db, uid, product\)/);
  assert.match(resolver, /access\.accessibleResourceIds\.has\(id\)/);
  assert.match(resolver, /access\.accessibleModuleIds\.has\(moduleId\)/);
  assert.match(resolver, /if \(text\(file\.accessLevel\) === "hidden"\) return false;/, "hidden content stays hidden from the AI");
  // Locked sub-modules are reported, never silently skipped.
  assert.match(resolver, /not unlocked for your account, so their files were not read/);
  // The happy path returns the files, not an empty list.
  assert.match(resolver, /return shell\(resources, note, resourceId, text\(moduleNode\.title\)\);/);
  assert.doesNotMatch(resolver, /resources: \[\],\n\s*resourceId: null,\n\s*\};/, "no empty-shell scope for a resolvable course");
  // The learner's own access must never be described as missing when it is a
  // locked sub-module: the note says what was skipped, and reading continues.
  assert.match(resolver, /locked for your account, so their files were not read/);
});

test("official ids are never mistaken for personal modules", () => {
  const router = between(server, "async function resolveAskScope(db: Db", "/**\n * Resolve the requested scope from the caller's OWN Firestore namespace.");
  // Existence in the caller's namespace decides the route — not the id's shape.
  assert.match(router, /const personal = await moduleCollection\(db, uid\)\.doc\(requested\)\.get\(\)/);
  assert.match(router, /if \(personal\.exists\) return resolveScope\(db, uid, body\);/);
  assert.match(router, /await officialCoursePlayerScope\(db, uid, body\)/);
  // …and no path here may answer an owned course with an ownership error.
  assert.doesNotMatch(router, /MODULE_NOT_FOUND/, "routing must not 404 a module the learner owns");
});

test("an official read is attributed to the course, not to the learner's own copies", () => {
  assert.match(server, /originKind: "official"/);
  assert.match(server, /origin: "official"/);
  assert.match(server, /source: scope\.origin === "official" \? "course" : undefined/);
  // Notes the learner typed on the open lesson keep grounding the answer even
  // though the file is cited under a derived id.
  assert.match(server, /row\.aliases\?\.includes\(requestedResource\)/);
  assert.match(personalLayer, /PERSONAL_AI_COURSE_ROOT_LABEL = "Course library"/);
});

test("the answer says what was read, so a thin answer is not a mystery", () => {
  assert.match(server, /scopeNote: \[scope\.resolutionNote, coverageNote\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(productionAi, /const withGroundingNote = /);
  assert.match(productionAi, /text: withGroundingNote\(result, attachments\.length > 0\)/);
  // The copy never claims a permission problem it has not verified.
  const note = between(productionAi, "const withGroundingNote = ", "export async function runProductionAssistant");
  assert.doesNotMatch(note, /access denied|no access|not entitled/i);
  assert.match(productionAi, /None of this lesson's files could be opened for reading/);
  assert.match(productionAi, /no file I can read text from yet/);
});

/* ── 2. the playground's simulated extractor stays in the playground ─ */

test("no hard-coded learner or course id ships in the chat layer", () => {
  // The seeded claims object is gone; what replaces it can only ever describe
  // the course that is actually open.
  assert.doesNotMatch(grounding, /const CLAIMS = /, "claims must be derived, never seeded");
  assert.doesNotMatch(grounding, /userId: "student-aria"|courseIds: \["crs-phys-201"\]/);
  assert.match(grounding, /function claimsFor\(ctx: CurrentResourceContext\)/);
  assert.match(grounding, /courseIds: \[ctx\.course\.courseId\]/);
  // The live player must not pre-judge the server's answer with a demo fetch.
  assert.doesNotMatch(lumenApp, /prefetchActive\(ctx\)/);
  assert.doesNotMatch(lumenApp, /from "\.\/ai\/courseGrounding"/);
});

test("a denial is never cached against a resource", () => {
  const denied = between(contentService, "if (ctx.resource.accessState !== \"granted\")", "/* Types with no legitimate extraction path");
  assert.doesNotMatch(denied, /cache\.set\(/, "an entitlement that changes must not be frozen into the cache");
  assert.match(denied, /isn't unlocked for your account yet/, "and it must name the real state");
});

/* ── 3. every file type is handled, everywhere ────────────────────── */

test("every CourseFileType has a reader row, an adapter and an icon", async () => {
  const { AI_FILE_TYPES } = await import("../utils/aiFileReaders.js");
  // The union in src/types/course.ts and the registry must list the same types.
  const union = between(courseTypes, "export type CourseFileType =", "export interface CoursePracticeQuestion")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\| "/.test(line))
    .map((line) => line.replace(/[|";]/g, "").trim());
  assert.deepEqual([...union].sort(), [...AI_FILE_TYPES].sort(), "a course type missing from the registry is a type the AI cannot read");
  assert.equal(union.includes("brain"), true);
  assert.equal(union.includes("mindmap"), true);

  // Adapters: one per type, including the ones with no URL.
  for (const type of AI_FILE_TYPES) {
    assert.match(adapters, new RegExp(`  ${type}: `), `${type} has no chat adapter`);
  }
  assert.match(adapters, /const BrainAdapter: ResourceContextAdapter = \{/);
  assert.match(adapters, /registryCaps\("pdf"\)/, "capabilities must come from the registry, not a second table");
  assert.match(bridge, /AI_FILE_TYPES as readonly string\[\]/, "the player must not keep its own type whitelist");
});

test("the extractor executes the registry's decision and nothing else", () => {
  assert.match(extractor, /import \{ aiPayloadText, parseCaptionText \} from "\.\.\/\.\.\/utils\/aiFileReaders\.js"/);
  for (const kind of ["in-document", "caption-file", "pdf-bytes", "google-export", "text-file"]) {
    assert.ok(extractor.includes(`plan.kind === "${kind}"`) || (kind === "text-file" && extractor.includes('// plan.kind === "text-file"')), `${kind} is decided by the registry but never executed`);
  }
  assert.doesNotMatch(extractor, /plan\.kind === "pdf"[^-\w]/, "the old 'pdf' kind must be gone, not half-renamed");
  // A payload read never touches the network, and never serves a stale read.
  const payload = between(extractor, 'if (plan.kind === "in-document") {', "try {\n    assertSafeContentUrl(plan.url);");
  assert.doesNotMatch(payload, /fetchBytes/, "reading the document's own text needs no fetch");
  assert.match(extractor, /if \(!options\.refresh && !isPayload\)/);
});

/* ── 4. the player hands over what the server needs ───────────────── */

test("the player's ask carries the open lesson's ids", () => {
  assert.match(aiClient, /moduleId\?: string \| null;\n  resourceId\?: string \| null;\n  \/\*\*\n   \* `true` for a file the learner owns through the course/);
  assert.match(productionAi, /moduleId: scope\.official \? scope\.officialModuleId \|\| undefined : undefined/);
  assert.match(productionAi, /resourceId: scope\.official \? scope\.officialResourceId \|\| undefined : undefined/);
  assert.match(lumenApp, /officialModuleId: personal \? undefined : moduleId \|\| undefined/);
  assert.match(lumenApp, /officialResourceId: personal \? undefined : selectedFile\?\.id \|\| undefined/);
  // And the module id the server needs is the one the player selected, not a
  // title or a slug — the same string that keys the course tree.
  assert.match(player, /moduleId=\{selectedOfficialModule \? String\(selectedOfficialModule\.id\)/);
});

test("an unreadable file explains itself per type, in the chat's own voice", () => {
  assert.match(grounding, /adapter\.fallbackMessage\(ctx\.resource\)/);
  assert.match(adapters, /export function readerReason\(type: ResourceType\): string \{\n  return aiReaderFor\(type\)\.reason;\n\}/);
  // `permission_required` describes the FILE's sharing, not our API keys.
  const playerUi = read("src/lumen/components/CoursePlayer.tsx");
  assert.match(playerUi, /label: "Not shared yet"/);
  assert.doesNotMatch(playerUi, /label: "No API access"/, "the learner cannot act on our API access");
});
