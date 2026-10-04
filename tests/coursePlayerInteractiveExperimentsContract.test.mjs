// tests/coursePlayerInteractiveExperimentsContract.test.mjs
//
// "Interactive 2D experiment" — the learner-authored file type that plays
// inside the Course Player.
//
// The learner asks an AI for ONE self-contained HTML file, pastes (or uploads)
// it in My Study Library's builder, and the lesson plays in a sandboxed iframe
// — offline, with no hosting at all.
//
// This suite pins the contract that makes that safe and honest:
//
//   1. the type is ADDITIVE: `CourseFileType`'s 13 official members (and the
//      three registries that mirror them: AI readers, the lumen resource type,
//      the personal-course registry) are untouched, so nothing official grows a
//      type it does not offer;
//   2. isolation: inline source runs in a sandbox WITHOUT `allow-same-origin`,
//      so pasted HTML can never reach the app's DOM, storage or Firebase
//      session;
//   3. the frame ⇄ player bridge: the shell injects `window.dcExperiment` and
//      the error/ready reporting before any author script runs;
//   4. the builder's checks name the real breakages (over-size, external
//      scripts, storage, alert) instead of failing silently;
//   5. the source is stored INSIDE the course document, with the same caps in
//      both writers (client `myCourseClient` + server `utils/myCourseDoc.js`);
//   6. the player actually shows and completes it: the Modules tab, the
//      viewer stack, first-lesson/resume and the progress denominator;
//   7. the four shipped starter experiments are valid, offline, single files.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

import {
  COURSE_EXPERIMENT_MAX_BYTES,
  EXPERIMENT_ALLOW,
  EXPERIMENT_FILE_TYPE,
  EXPERIMENT_HOST_SOURCE,
  EXPERIMENT_MAX_BYTES,
  EXPERIMENT_MESSAGE_SOURCE,
  EXPERIMENT_PROMPT_RULES,
  EXPERIMENT_SANDBOX_HOSTED,
  EXPERIMENT_SANDBOX_INLINE,
  buildExperimentAiPrompt,
  buildExperimentDocument,
  experimentBlockingIssues,
  experimentByteLength,
  experimentDownloadName,
  experimentIssues,
  parseExperimentMessage,
} from "../src/utils/experimentSpec.ts";

const read = (path) => readFileSync(path, "utf8");

const courseTypes = read("src/types/course.ts");
const player = read("src/CoursePlayerApp.tsx");
const overlay = read("src/course/CourseOverlay.tsx");
const viewer = read("src/course/ResourceViewer.tsx");
const stage = read("src/course/ExperimentStage.tsx");
const adapter = read("src/lib/myCourseAdapter.ts");
const client = read("src/lib/myCourseClient.ts");
const myTypes = read("src/types/myCourse.ts");
const sharedDoc = read("utils/myCourseDoc.js");
const editor = read("src/personal-library/MyCourseEditorPage.tsx");
const panel = read("src/personal-library/MyCourseExperimentEditor.tsx");
const templates = read("src/personal-library/experimentTemplates.ts");
const lumenTypes = read("src/lumen/course/types.ts");
const aiReaders = read("utils/aiFileReaders.js");

// ---------------------------------------------------------------------------
// 1. ADDITIVE typing — the official vocabulary must not grow
// ---------------------------------------------------------------------------

test("the experiment is its own union member and CourseFileType keeps its 13 official values", () => {
  const union = courseTypes.match(/export type CourseFileType =\s*([\s\S]*?);/);
  assert.ok(union, "CourseFileType union must stay declared in src/types/course.ts");
  const declared = [...union[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  assert.equal(declared.length, 13, "the official catalogue has exactly 13 file types");
  assert.ok(!declared.includes("interactive"), "the experiment must NOT be an official CourseFileType");

  assert.match(courseTypes, /export const EXPERIMENT_FILE_TYPE = "interactive" as const;/);
  assert.match(courseTypes, /export type CourseContentFileType = CourseFileType \| CourseInteractiveFileType;/);
  assert.match(courseTypes, /export const isExperimentFileType = \(type\?: string \| null\): type is CourseInteractiveFileType =>/);
  // The two declarations of the id (types + spec) must agree.
  assert.equal(EXPERIMENT_FILE_TYPE, "interactive");
  // A CourseFile may carry the experiment and the separate admin Read type;
  // neither expands the official 13-member CourseFileType union.
  assert.match(courseTypes, /export interface CourseFile extends CourseAccessMeta \{[\s\S]*?type: CourseContentFileType \| CourseReadResourceFileType;/);
  assert.match(courseTypes, /interactiveHtml\?: string;/);
});

test("the three mirrors of the official union are untouched by the experiment", () => {
  // AI reader registry — the 13 reader entries, no experiment.
  assert.ok(!/interactive/.test(aiReaders.split("AI_FILE_READERS")[1]?.slice(0, 6000) || ""), "no experiment reader entry");
  // lumen's ResourceType — still the 13 official members.
  const lumen = lumenTypes.match(/export type ResourceType =\s*([\s\S]*?);/);
  assert.ok(lumen, "ResourceType must stay declared");
  assert.ok(!lumen[1].includes("interactive"));
  // …which is exactly why the AI bridge demotes it to "embed" (metadata only).
  assert.match(read("src/lumen/course/bridge.ts"), /AI_FILE_TYPES as readonly string\[\]\)\.includes\(value\) \? \(value as ResourceType\) : "embed"/);
});

// ---------------------------------------------------------------------------
// 2. Isolation — the sandbox, and the one token that must never appear
// ---------------------------------------------------------------------------

test("inline experiments run with scripts but never with allow-same-origin", () => {
  assert.ok(EXPERIMENT_SANDBOX_INLINE.includes("allow-scripts"));
  assert.ok(!EXPERIMENT_SANDBOX_INLINE.includes("allow-same-origin"), "an inline frame sharing our origin could read the learner's session");
  assert.ok(EXPERIMENT_SANDBOX_HOSTED.includes("allow-same-origin"), "a hosted page keeps ITS OWN origin, which is safe");
  assert.match(EXPERIMENT_ALLOW, /fullscreen/);

  // The stage picks the sandbox by mode and frames inline source with srcDoc.
  assert.match(stage, /sandbox=\{inline \? EXPERIMENT_SANDBOX_INLINE : EXPERIMENT_SANDBOX_HOSTED\}/);
  assert.match(stage, /\.\.\.\(inline \? \{ srcDoc: experimentDocument \} : \{ src: source \}\)/);
  assert.match(stage, /referrerPolicy="no-referrer"/);
});

// ---------------------------------------------------------------------------
// 3. The bridge — what the player sends in, what the frame sends back
// ---------------------------------------------------------------------------

test("the injected shell defines window.dcExperiment and reports errors before author code runs", () => {
  const document = buildExperimentDocument("<html><head><title>t</title></head><body><canvas></canvas></body></html>", { theme: "light" });
  assert.ok(document.includes("<html"), "the author document is preserved");
  assert.ok(document.includes("<canvas>"));
  // The shell lands in <head>, i.e. BEFORE the author's own <script>.
  assert.ok(document.indexOf("dc-experiment-shell") < document.indexOf("<canvas>"));
  assert.ok(document.indexOf("window.dcExperiment") < document.indexOf("<canvas>"));
  for (const method of ["ready", "progress", "complete", "note"]) {
    assert.ok(document.includes(`${method}: function`), `dcExperiment.${method} must exist`);
  }
  assert.ok(document.includes('"dc:pause"'));
  assert.ok(document.includes('"dc:play"'));
  assert.ok(document.includes("data-dc-theme"));
  assert.ok(document.includes("unhandledrejection"), "runtime errors are surfaced, not swallowed");
  assert.equal(document.match(/<\/head>/g)?.length, 1);
});

test("a fragment still becomes a complete document and the bridge markers are namespaced", () => {
  const fragment = buildExperimentDocument("<canvas id='c'></canvas><script>1</script>", {});
  assert.match(fragment, /^<!doctype html><html lang="en">/);
  assert.match(fragment, /window\.dcExperiment/);
  assert.equal(EXPERIMENT_HOST_SOURCE, "dc-host");
  assert.equal(EXPERIMENT_MESSAGE_SOURCE, "dc-experiment");
  // Foreign messages are ignored, ours are parsed.
  assert.equal(parseExperimentMessage({ type: "ready" }), null);
  assert.equal(parseExperimentMessage({ source: "somewhere-else", type: "ready" }), null);
  assert.deepEqual(parseExperimentMessage({ source: "dc-experiment", type: "progress", value: 0.5 }), {
    type: "progress", value: 0.5, text: undefined, message: undefined,
  });
});

test("completion is reported to the player, which only ever completes the open lesson", () => {
  assert.match(viewer, /const handleExperimentComplete = useCallback\(\(\) => \{\s*\n\s*if \(!active\) return;\s*\n\s*onComplete\?\.\(file\.id\);/);
  assert.match(viewer, /onComplete=\{handleExperimentComplete\}/);
  assert.match(player, /const completeFromExperiment = useCallback\(\(fileId: string\) => \{/);
  assert.match(player, /if \(completedIds\.has\(fileId\)\) return;/);
  assert.match(player, /onComplete=\{completeFromExperiment\}/);
  assert.match(stage, /if \(parsed\.type === "complete"\) \{/);
});

// ---------------------------------------------------------------------------
// 4. Honest checks in the builder
// ---------------------------------------------------------------------------

test("experimentIssues names the real breakages and only size/empty block a save", () => {
  assert.equal(experimentIssues("").filter((issue) => issue.level === "error").length, 1, "no source is a hard error");
  const oversized = `<html><body>${"x".repeat(EXPERIMENT_MAX_BYTES + 64)}</body></html>`;
  assert.equal(experimentBlockingIssues(oversized).length, 1, "over the per-experiment cap is a hard error");
  assert.match(experimentBlockingIssues(oversized)[0].message, /KB/);

  const broken = [
    '<script src="https://cdn.example.com/p5.js"></script>',
    "localStorage.setItem('a','b')",
    "alert('hi')",
    "fetch('/data')",
    "window.parent.document.body.innerHTML = ''",
  ].join("");
  const warnings = experimentIssues(`<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>${broken}<canvas></canvas><script>requestAnimationFrame(function f(){requestAnimationFrame(f)})</script></body></html>`);
  const text = warnings.map((issue) => issue.message).join(" | ");
  for (const needle of ["internet", "storage", "alert", "server", "around it"]) {
    assert.ok(text.includes(needle), `the checks must mention ${needle}`);
  }
  assert.equal(experimentIssues("<html><body>x</body></html>").filter((issue) => issue.level === "error").length, 0, "a small odd file still SAVES — warnings are advice");

  // Size limits + download name behaviour.
  assert.equal(experimentByteLength("é"), 2, "bytes, not characters (Firestore counts bytes)");
  assert.equal(experimentDownloadName("Projectile Motion!"), "projectile-motion.html");
  assert.equal(experimentDownloadName(""), "experiment.html");
});

test("the AI prompt carries every constraint the player enforces", () => {
  const prompt = buildExperimentAiPrompt({ topic: "Projectile motion", details: "add slow motion", level: "Class 11–12", language: "Hinglish" });
  for (const needle of [
    "<!doctype html>",
    "requestAnimationFrame",
    "no external libraries",
    "localStorage",
    "alert",
    "fetch",
    "window.parent",
    "touch-action: none",
    "Reset",
    "Projectile motion",
    "Hinglish",
  ]) {
    assert.ok(prompt.includes(needle), `the prompt must mention ${needle}`);
  }
  assert.ok(EXPERIMENT_PROMPT_RULES.length >= 5);
  assert.match(panel, /buildExperimentAiPrompt/);
  assert.match(panel, /navigator\.clipboard/);
});

// ---------------------------------------------------------------------------
// 5. Storage: inside the course document, capped in BOTH writers
// ---------------------------------------------------------------------------

test("the client and the server agree on the experiment budget", () => {
  // Same constants on both sides (the client is a TS module, the server JS).
  assert.match(myTypes, /export const MY_EXPERIMENT_MAX_BYTES = 200 \* 1024;/);
  assert.match(myTypes, /export const MY_COURSE_MAX_EXPERIMENT_BYTES = 640 \* 1024;/);
  assert.match(sharedDoc, /export const MY_EXPERIMENT_MAX_BYTES = 200 \* 1024;/);
  assert.match(sharedDoc, /export const MY_COURSE_MAX_EXPERIMENT_BYTES = 640 \* 1024;/);
  assert.equal(EXPERIMENT_MAX_BYTES, 200 * 1024);
  assert.equal(COURSE_EXPERIMENT_MAX_BYTES, 640 * 1024);
  // The server rejects with a readable code instead of truncating a lesson.
  assert.match(sharedDoc, /code: "EXPERIMENT_TOO_LARGE"/);
  assert.match(sharedDoc, /code: "EXPERIMENTS_TOO_LARGE"/);
  assert.match(sharedDoc, /resource\.interactiveHtml = typeof source\.interactiveHtml === "string" \? source\.interactiveHtml : "";/);
  // The client refuses the same way before any write happens.
  assert.match(client, /export const myCourseExperimentBudget = \(modules: MyCourseModule\[\]\): ExperimentBudget =>/);
  assert.match(client, /export const myCourseExperimentBudgetError = \(course: MyCourse\): string \| null =>/);
  assert.match(client, /const budgetError = myCourseExperimentBudgetError\(clean\);\s*\n\s*if \(budgetError\) throw new Error\(budgetError\);/);
});

test("the shared sanitiser keeps the source, and the firestore rule does not need to grow", () => {
  const rules = read("firestore.rules");
  const start = rules.indexOf("match /myCourses/{courseId} {");
  const block = rules.slice(start, start + 1400);
  assert.ok(!/interactive/.test(block), "the owner-scoped rule stays field-agnostic — no type allowlist to drift");
  assert.match(sharedDoc, /const type = clamp\(source\.type \|\| "embed", 40\);/);
});

// ---------------------------------------------------------------------------
// 6. Player wiring — visible, openable, completable
// ---------------------------------------------------------------------------

test("the Modules tab shows an experiment and gives it its own icon", () => {
  assert.match(overlay, /const isExperimentFile = \(file: CourseFile\) =>/);
  assert.match(overlay, /file\.type === "interactive"/);
  assert.match(overlay, /const isVisibleFile = \(file: CourseFile\) =>\s*\n\s*file\.accessLevel !== "hidden" && \(hasUrlContent\(file\) \|\| isExperimentFile\(file\)\);/);
  assert.match(overlay, /if \(file\.type === "interactive"\) return FlaskConical;/);
});

test("the viewer stack opens experiments and never a URL-less type it cannot render", () => {
  // `files` stays URL-backed lesson content, with Read explicitly kept out of
  // the lesson stack (Brain and Read each open from their own dock tab)…
  assert.match(player, /const files = useMemo\(\(\) => allFiles\(modules\)\.filter\(\(file\) => file\.type !== "read" && file\.accessLevel !== "hidden" && Boolean\(file\.url \|\| file\.embedUrl \|\| file\.youtubeUrl \|\| file\.youtubeVideoId\)\), \[modules\]\);/);
  // …while experiments join `playableFiles`, which drives the first-lesson /
  // deep-link selection, resume, and the progress denominator.
  assert.match(player, /const experimentFiles = useMemo\(\s*\n\s*\(\) => allFiles\(modules\)\.filter\(\(file\) => file\.accessLevel !== "hidden" && isExperimentFileType\(file\.type\) && Boolean\(String\(file\.interactiveHtml \|\| ""\)\.trim\(\)\)\),/);
  assert.match(player, /const playableFiles = useMemo\(\(\) => \(experimentFiles\.length \? \[\.\.\.files, \.\.\.experimentFiles\] : files\), \[files, experimentFiles\]\);/);
  assert.match(player, /if \(selectedFile \|\| playableFiles\.length === 0\) return;/);
  assert.match(player, /const eligible = playableFiles\.filter\(\(file\) => \{/);

  // ResourceViewer has a first-class branch, not an embed fallback.
  assert.match(viewer, /const isExperiment = isExperimentFileType\(file\.type\);/);
  assert.match(viewer, /\{isExperiment \? \(\s*\n\s*<ExperimentStage/);
  assert.match(viewer, /kindLabel: isExperiment \? fileKindLabel :/);
  // Inline experiments are downloadable (their own bytes) and openable in a tab.
  assert.match(viewer, /new Blob\(\[experimentHtml\], \{ type: "text\/html" \}\)/);
  assert.match(viewer, /experimentDownloadName\(file\.name\)/);
  assert.match(viewer, /URL\.revokeObjectURL\(experimentDownload\.url\)/);
  // …and the adapter marks them playable with no URL at all.
  assert.match(adapter, /const isExperimentResource = \(resource: MyCourseResource\): boolean =>/);
  assert.match(adapter, /interactiveHtml: resource\.type === "interactive" \? resource\.interactiveHtml \|\| "" : undefined,/);
  assert.match(adapter, /provider: resource\.type === "interactive" \? "dc_experiment" :/);
});

// ---------------------------------------------------------------------------
// 7. The builder + the four shipped starters
// ---------------------------------------------------------------------------

test("My Study Library offers the type and wires the whole prompt → paste → preview flow", () => {
  assert.match(editor, /\{ id: "interactive", label: "Interactive 2D experiment", icon: FlaskConical, hint: "Make it with AI — one HTML file" \}/);
  assert.match(editor, /\{isExperiment \? \(\s*\n\s*<MyCourseExperimentEditor/);
  assert.match(editor, /import \{ experimentBlockingIssues \} from "\.\.\/utils\/experimentSpec";/);
  for (const hook of [
    "data-my-experiment-editor",
    "data-my-experiment-topic",
    "data-my-experiment-copy-prompt",
    "data-my-experiment-template=",
    "data-my-experiment-file",
    "data-my-experiment-html",
    "data-my-experiment-preview",
    "data-my-experiment-status",
  ]) {
    assert.ok(panel.includes(hook), `the builder must expose ${hook}`);
  }
  // The live preview IS the player's stage (same framing ⇒ no preview-only bug).
  assert.match(panel, /<ExperimentStage html=\{html\} url=\{resource\.url \|\| ""\} title=\{resource\.name \|\| "Experiment"\} compact \/>/);
  assert.match(panel, /const text = await file\.text\(\);/);
  assert.match(templates, /import projectileMotion from "\.\/experiments\/projectile-motion\.html\?raw";/);
  assert.match(templates, /import simplePendulum from "\.\/experiments\/simple-pendulum\.html\?raw";/);
  assert.match(templates, /import waveSuperposition from "\.\/experiments\/wave-superposition\.html\?raw";/);
  assert.match(templates, /import sortingVisualizer from "\.\/experiments\/sorting-visualizer\.html\?raw";/);
  assert.equal((templates.match(/id: "/g) || []).length, 4, "four starter experiments");
});

test("every starter experiment is a valid, offline, single HTML file", () => {
  const files = [
    "src/personal-library/experiments/projectile-motion.html",
    "src/personal-library/experiments/simple-pendulum.html",
    "src/personal-library/experiments/wave-superposition.html",
    "src/personal-library/experiments/sorting-visualizer.html",
  ];
  for (const file of files) {
    const html = read(file);
    assert.match(html, /^<!doctype html>/i, `${file}: doctype`);
    assert.match(html, /<\/html>\s*$/i, `${file}: closing html`);
    assert.match(html, /<meta name="viewport"/, `${file}: viewport`);
    assert.match(html, /<canvas/, `${file}: canvas`);
    assert.match(html, /requestAnimationFrame/, `${file}: animation loop`);
    assert.ok(html.includes('document.addEventListener("dc:pause"'), `${file}: host pause bridge`);
    assert.ok(!/https?:\/\//.test(html), `${file}: no external URLs (must work offline)`);
    assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(html), `${file}: no sandbox-blocked storage`);
    assert.ok(!/\balert\s*\(/.test(html), `${file}: no dialogs`);
    assert.ok(!/<script[^>]+src=/i.test(html), `${file}: no external scripts`);
    assert.ok(statSync(file).size < EXPERIMENT_MAX_BYTES, `${file}: under the per-experiment cap`);
    assert.equal(experimentBlockingIssues(html).length, 0, `${file}: no blocking issues`);
  }
});

// ---------------------------------------------------------------------------
// 8. Runtime: the shell + a real starter experiment, in a real DOM
// ---------------------------------------------------------------------------
//
// The source assertions above prove the wiring exists; this proves it RUNS.
// Each template is wrapped by the real `buildExperimentDocument`, mounted in
// jsdom with a stubbed 2D context (jsdom ships no canvas), and driven for a few
// frames: the bridge must announce `ready`, the template's own progress calls
// must arrive tagged `dc-experiment`, the host's pause/play signals must be
// harmless, and nothing may throw.

/** jsdom has no canvas backend — every 2D call is a no-op. */
const stubContext2d = () => new Proxy({}, {
  get: (target, property) => {
    if (property === "createRadialGradient" || property === "createLinearGradient") return () => ({ addColorStop() {} });
    if (property === "measureText") return () => ({ width: 10 });
    if (property === "canvas") return null;
    return () => undefined;
  },
  set: () => true,
});

async function runTemplate(file, milliseconds = 220) {
  const source = read(file);
  const wrapped = buildExperimentDocument(source, { theme: "dark", ink: "#ffffff", background: "transparent" });
  const messages = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  let alive = true;
  const dom = new JSDOM(wrapped, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => stubContext2d();
      window.parent.postMessage = (message) => { messages.push(message); };
      window.addEventListener("error", (event) => errors.push(event.message));
      // Deterministic frames instead of jsdom's visual timer.
      window.requestAnimationFrame = (callback) => setTimeout(() => { if (alive) callback(window.performance.now()); }, 0);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  // The player's own signals — every template must survive them.
  for (const type of ["pause", "play", "theme"]) {
    dom.window.document.dispatchEvent(new dom.window.MessageEvent("message", { data: { source: EXPERIMENT_HOST_SOURCE, type, theme: "light" } }));
  }
  await new Promise((resolve) => setTimeout(resolve, 60));
  alive = false;
  dom.window.close();
  return { messages, errors };
}

test("a starter experiment really runs inside the wrapped, sandboxed document", async () => {
  for (const file of [
    "src/personal-library/experiments/projectile-motion.html",
    "src/personal-library/experiments/simple-pendulum.html",
    "src/personal-library/experiments/wave-superposition.html",
    "src/personal-library/experiments/sorting-visualizer.html",
  ]) {
    const { messages, errors } = await runTemplate(file);
    const types = new Set(messages.map((message) => message.type));
    assert.deepEqual(errors, [], `${file}: the experiment must run without throwing`);
    assert.ok(types.has("ready"), `${file}: the shell must report itself ready`);
    assert.ok(types.has("progress"), `${file}: the template must report progress through the bridge`);
    assert.ok(messages.every((message) => message.source === EXPERIMENT_MESSAGE_SOURCE), `${file}: every message must be namespaced`);
    // The host's messages are consumed by the bridge, never answered blindly.
    assert.ok(!types.has("error"), `${file}: no runtime error may be reported`);
  }
});
