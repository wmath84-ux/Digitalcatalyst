// tests/coursePlayerSelfExperimentContract.test.mjs
//
// Contract for the Course Player's Experiment page SELF side: the learner's own
// 2D experiments, made from the “+” in the header (behind its dropdown).
//
// The contract pins:
//   1. what a created experiment IS — an `interactive` resource inside ONE
//      library course (“My experiments”), so it syncs on the Study Library
//      shelf and is editable there with the same builder;
//   2. how the Experiment page knows an experiment belongs to THIS course — the
//      `experimentSourceProductId` tag, filtered by `selfExperimentsFromCourses`;
//   3. the creation sheet being the LIBRARY'S OWN builder (MyCourseExperimentEditor):
//      the shared AI prompt/format, the paste / upload / template row, the live
//      preview — no second builder to drift;
//   4. Create being immediate and gated on the shared runnability rule, wired
//      end to end (`selfExperiments`, `onCreateSelfExperiment` → `myLibrary.save`).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExperimentAiPrompt, EXPERIMENT_MAX_BYTES } from "../src/utils/experimentSpec.ts";
import {
  SELF_EXPERIMENTS_COURSE_DESCRIPTION,
  SELF_EXPERIMENTS_COURSE_ID,
  SELF_EXPERIMENTS_COURSE_TITLE,
  placeSelfExperiment,
  selfExperimentCourseFile,
  selfExperimentIssues,
  selfExperimentReady,
  selfExperimentsFromCourses,
} from "../src/utils/selfExperiments.ts";

const read = (path) => readFileSync(path, "utf8");

const panel = read("src/course/ExperimentPanel.tsx");
const composer = read("src/course/ExperimentComposer.tsx");
const player = read("src/CoursePlayerApp.tsx");
const overlay = read("src/course/CourseOverlay.tsx");
const client = read("src/lib/myCourseClient.ts");
const types = read("src/types/myCourse.ts");
const preferences = read("src/course/playerPreferences.tsx");
const control = read("src/course/MasterSelfControl.tsx");
const libraryEditor = read("src/personal-library/MyCourseExperimentEditor.tsx");

const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><canvas id="c"></canvas><input type="range"><script>requestAnimationFrame(function loop(){document.getElementById("c");requestAnimationFrame(loop)});</script></body></html>`;

/** The library's own document builders, stubbed (the util never imports them). */
const factories = () => {
  let id = 0;
  return {
    createCourse: (uid, title) => ({
      id: SELF_EXPERIMENTS_COURSE_ID,
      uid,
      title,
      description: "",
      coverImage: "",
      modules: [],
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 1,
    }),
    createModule: (title) => ({ id: `m${++id}`, title, description: "", resources: [], modules: [], createdAt: 1, updatedAt: 1 }),
    createResource: (type) => ({ id: `r${++id}`, name: "", type, url: "", description: "", source: "link", createdAt: 1, updatedAt: 1 }),
  };
};

// ---------------------------------------------------------------------------
// 1. A created experiment is one resource on the Study Library shelf
// ---------------------------------------------------------------------------

test("self experiments live in ONE owner-scoped library course, created on first use", () => {
  assert.equal(SELF_EXPERIMENTS_COURSE_ID, "my-experiments");
  assert.equal(SELF_EXPERIMENTS_COURSE_TITLE, "My experiments");
  assert.match(SELF_EXPERIMENTS_COURSE_DESCRIPTION, /Course Player's Experiment page/);
  // The hooks the shelf itself uses — the same live listener the Study Library
  // renders, so an experiment made in the player is on the shelf immediately.
  assert.match(player, /import \{ useMyCourses \} from "\.\/hooks\/useMyCourses";/);
  assert.match(player, /const myLibrary = useMyCourses\(\);/);
  assert.match(player, /const result = await myLibrary\.save\(placed\.course\);/);
  // The document builders stay the library's own (myCourseClient), injected.
  assert.match(player, /createModule: \(moduleTitle\) => createMyModule\(moduleTitle\),/);
  assert.match(player, /createResource: \(type\) => createMyResource\(type\),/);
});

test("an experiment lands in a module for the source and carries the scope tag", () => {
  const first = placeSelfExperiment(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light — Reflection",
      name: "Mirror angles",
      html: HTML,
    },
    factories(),
  );
  assert.deepEqual(first.issues, []);
  assert.equal(first.course.id, SELF_EXPERIMENTS_COURSE_ID);
  assert.equal(first.course.title, SELF_EXPERIMENTS_COURSE_TITLE);
  assert.equal(first.course.modules.length, 1);
  assert.equal(first.course.modules[0].title, "Light — Reflection");
  assert.equal(first.resource.type, "interactive");
  assert.equal(first.resource.name, "Mirror angles");
  assert.equal(first.resource.experimentSourceProductId, "p1");
  assert.equal(first.resource.interactiveHtml, HTML);
  assert.equal(first.resource.size, new TextEncoder().encode(HTML).length);
  assert.match(first.resource.description, /Created from Live Experiment · Class 10 Physics/);

  // A second experiment for the same module reuses the module (one module per
  // source, in shelf order) and appends — never a second “Light — Reflection”.
  const second = placeSelfExperiment(
    {
      course: first.course,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "light — reflection",
      name: "One more",
      html: HTML,
    },
    factories(),
  );
  assert.equal(second.course.modules.length, 1);
  assert.equal(second.course.modules[0].resources.length, 2);
  // The live snapshot was not mutated: placement works on a clone.
  assert.equal(first.course.modules[0].resources.length, 1);
});

test("a broken experiment can never reach the shelf", () => {
  const nothing = placeSelfExperiment(
    { course: null, uid: "u1", productId: "p1", courseTitle: "Physics", moduleTitle: "Light", name: "Empty", html: "  " },
    factories(),
  );
  assert.equal(nothing.course, null);
  assert.equal(nothing.resource, null);
  assert.deepEqual(nothing.issues, ["add the experiment's HTML first"]);

  // Past the shared cap the Create button is refused with the shared message.
  const oversized = `<canvas></canvas><script>requestAnimationFrame(function l(){l()});</script>${"/* pad */".repeat(
    Math.ceil(EXPERIMENT_MAX_BYTES / 8) + 64,
  )}`;
  const refused = placeSelfExperiment(
    { course: null, uid: "u1", productId: "p1", courseTitle: "Physics", moduleTitle: "Light", name: "Too big", html: oversized },
    factories(),
  );
  assert.equal(refused.course, null);
  assert.match(refused.issues[0], /KB/);
  assert.equal(selfExperimentReady(HTML), true);
  assert.deepEqual(selfExperimentIssues(HTML), []);
});

// ---------------------------------------------------------------------------
// 2. SELF lists only this course's own experiments
// ---------------------------------------------------------------------------

test("SELF is the shelf's experiments tagged for this course — and nothing else", () => {
  const shelf = {
    id: SELF_EXPERIMENTS_COURSE_ID,
    title: SELF_EXPERIMENTS_COURSE_TITLE,
    modules: [
      {
        id: "m1",
        title: "Light — Reflection",
        resources: [
          { id: "r1", type: "interactive", name: "Mine", interactiveHtml: HTML, experimentSourceProductId: "p1" },
          { id: "r2", type: "interactive", name: "Other course", interactiveHtml: HTML, experimentSourceProductId: "p2" },
          { id: "r3", type: "interactive", name: "Made in the library", interactiveHtml: HTML },
          { id: "r4", type: "interactive", name: "Not runnable", interactiveHtml: "", experimentSourceProductId: "p1" },
          { id: "r5", type: "brain", name: "A practice set", experimentSourceProductId: "p1" },
        ],
      },
      { id: "m2", title: "Nested", modules: [{ id: "m3", title: "Deeper", resources: [
        { id: "r6", type: "interactive", name: "Nested one", interactiveHtml: HTML, experimentSourceProductId: "p1" },
      ] }], resources: [] },
    ],
  };
  const list = selfExperimentsFromCourses([shelf], "p1");
  assert.deepEqual(list.map((item) => item.id), ["r1", "r6"]);
  assert.equal(list[0].title, "Mine");
  assert.equal(list[0].moduleTitle, "Light — Reflection");
  assert.equal(list[0].html, HTML);
  assert.equal(list[1].moduleTitle, "Deeper");
  // Another course's Experiment page sees none of this learner's p1 work.
  assert.deepEqual(selfExperimentsFromCourses([shelf], "p2").map((item) => item.id), ["r2"]);
  // No scope → no list (never “show everything”), and a missing shelf is safe.
  assert.deepEqual(selfExperimentsFromCourses([shelf], ""), []);
  assert.deepEqual(selfExperimentsFromCourses(null, "p1"), []);

  // The stored experiment opens as a CourseFile the viewer stack can run —
  // inline source, the experiment provider, no URL required.
  const file = selfExperimentCourseFile(list[0]);
  assert.equal(file.type, "interactive");
  assert.equal(file.name, "Mine");
  assert.equal(file.interactiveHtml, HTML);
  assert.equal(file.provider, "dc_experiment");
  assert.equal(file.accessLevel, "included");
});

test("the schema carries the tag through a Firestore round trip", () => {
  assert.match(types, /experimentSourceProductId\?: string;/);
  assert.match(
    client,
    /experimentSourceProductId: typeof source\.experimentSourceProductId === "string" \? source\.experimentSourceProductId : undefined,/,
  );
});

// ---------------------------------------------------------------------------
// 3. The sheet IS the library's builder — prompt, paste, preview, checks
// ---------------------------------------------------------------------------

test("the composer reuses the Study Library's own experiment editor", () => {
  assert.match(composer, /import MyCourseExperimentEditor from "\.\.\/personal-library\/MyCourseExperimentEditor";/);
  assert.match(composer, /<MyCourseExperimentEditor\s+resource=\{draft\}/);
  // …and it does NOT re-write the prompt/checks itself: one builder, one
  // contract (the editor owns buildExperimentAiPrompt + the issue checks).
  assert.ok(!/buildExperimentAiPrompt/.test(composer.replace(/\/\/[^\n]*/g, "")), "no second prompt builder");
  assert.match(libraryEditor, /buildExperimentAiPrompt/);
  // The options the owner asked for are the editor's own hooks, unchanged:
  assert.match(libraryEditor, /data-my-experiment-prompt-text/);
  assert.match(libraryEditor, /data-my-experiment-copy-prompt/);
  assert.match(libraryEditor, /data-my-experiment-html/);
  assert.match(libraryEditor, /data-my-experiment-template=\{template\.id\}/);
  assert.match(libraryEditor, /data-my-experiment-preview/);
});

test("the CMD the learner copies asks for a single HTML file with the topic and class placeholders", () => {
  const prompt = buildExperimentAiPrompt({ topic: "Projectile motion", level: "Class 11", language: "Hinglish" });
  assert.match(prompt, /teaches: Projectile motion\./);
  assert.match(prompt, /OUTPUT FORMAT \(strict\)/);
  assert.match(prompt, /ONE complete HTML file and nothing else/);
  assert.match(prompt, /no markdown fences/);
  assert.match(prompt, /On-screen labels in Hinglish\./);
  assert.match(prompt, /Keep the maths at the level of Class 11\./);
  // The sandbox rules the player enforces are IN the CMD, so an AI answer is
  // runnable as-is instead of failing after the paste.
  assert.match(prompt, /No localStorage \/ sessionStorage \/ cookies \/ IndexedDB/);
  assert.match(prompt, /No fetch \/ XMLHttpRequest \/ WebSocket/);
});

test("Create is immediate and waits for a runnable draft", () => {
  assert.match(composer, /const \[draft, setDraft\] = useState<MyCourseResource>\(\(\) => \(\{/);
  assert.match(composer, /createMyResource\("interactive"\)/);
  assert.match(composer, /const issues = useMemo\(\(\) => selfExperimentIssues\(html, url\), \[html, url\]\);/);
  assert.match(composer, /const canCreate = Boolean\(draft\.name\.trim\(\)\) && issues\.length === 0 && !busy;/);
  assert.match(composer, /disabled=\{!canCreate\}/);
  assert.match(composer, /data-experiment-self-create/);
  // Submit hands the name + HTML (and the optional hosted link) to the parent
  // and closes only after the library write succeeded.
  assert.match(composer, /const result = await onCreate\(\{ name: draft\.name\.trim\(\), html, url \}\);/);
  assert.match(composer, /if \(!result\?\.ok\) \{/);
  assert.match(panel, /onCreate=\{onCreateSelfExperiment\}/);
  // The player builds the document from the sheet's draft and saves it.
  assert.match(player, /const placed = placeSelfExperiment\(/);
  assert.match(player, /trackFeatureEvent\("experiment_created", \{ surface: "course_player" \}\);/);
});

// ---------------------------------------------------------------------------
// 4. The “+” and its dropdown, wired end to end
// ---------------------------------------------------------------------------

test("the header '+' opens a dropdown with the ways in and the templates", () => {
  assert.match(panel, /data-experiment-self-add=""/);
  assert.match(panel, /aria-label="Create your own experiment"/);
  // The “+” belongs to the learner's OWN side: from MASTER it opens SELF first,
  // so the list behind the dropdown is where the new experiment will land.
  assert.match(panel, /masterSelfCtl\.setMode\("self"\);/);
  assert.match(panel, /data-experiment-self-menu=""/);
  assert.match(panel, /role="menu"/);
  assert.match(panel, /data-experiment-self-menu-item="scratch"/);
  assert.match(panel, /data-experiment-self-menu-item=\{`template:\$\{template\.id\}`\}/);
  assert.match(panel, /import \{ EXPERIMENT_TEMPLATES, templateBytes \} from "\.\.\/personal-library\/experimentTemplates";/);
  assert.match(panel, /composerOpen && onCreateSelfExperiment \? \(/);
  assert.match(panel, /<ExperimentComposer/);
  assert.match(composer, /data-experiment-self-composer=""/);
  // Leaving SELF closes a half-made experiment instead of floating it over MASTER.
  assert.match(panel, /if \(masterSelfCtl\.mode !== "self"\) \{\s*setMenuOpen\(false\);\s*setComposerOpen\(false\);/);
});

test("the page is a MASTER/SELF list with both empty states and the shared control", () => {
  assert.match(panel, /data-course-experiment-panel=""/);
  assert.match(panel, /<MasterSelfControl\s+feature="experiment"/);
  assert.match(panel, /masterCount=\{masterExperiments\.length\}/);
  assert.match(panel, /selfCount=\{selfExperiments\.length\}/);
  assert.match(panel, /data-experiment-self-empty=""/);
  assert.match(panel, /data-experiment-master-empty=""/);
  assert.match(panel, /Tap \+ in the header to create your own 2D experiment/);
  assert.match(panel, /data-experiment-card=\{experiment\.id\}/);
  // The filter is the shared, persisted preference — per feature, per learner.
  assert.match(panel, /const masterSelfCtl = useMasterSelfPreference\("experiment", uid \?\? null, "master"\);/);
  assert.match(preferences, /export type MasterSelfFeature = "notes" \| "mindMap" \| "brain" \| "experiment";/);
  assert.match(control, /feature: "notes" \| "mindMap" \| "brain" \| "experiment";/);
});

test("the player feeds the panel the SELF list, the course list and the writer", () => {
  assert.match(
    player,
    /selfExperimentsFromCourses\(myLibrary\.courses, storageProductId\)\.map\(\(experiment\) => \(\{/,
  );
  assert.match(player, /file: selfExperimentCourseFile\(experiment\),/);
  assert.match(player, /experimentPanel=\{\s*<ExperimentPanel/);
  assert.match(player, /onCreateSelfExperiment=\{createSelfExperiment\}/);
  assert.match(player, /selfExperimentSeed=\{\{/);
  assert.match(player, /const masterExperimentItems = useMemo<PlayerExperiment\[\]>\(/);
  // MASTER opens the official lesson; SELF stays out of course progress.
  assert.match(player, /if \(source === "self"\) selectPersonalFile\(experiment\.file\);/);
  assert.match(overlay, /experimentPanel\?: ReactNode;/);
  assert.match(overlay, /\) : tab === "experiment" \? \(/);
  assert.match(overlay, /experimentPanel \?\? \(/);
});
