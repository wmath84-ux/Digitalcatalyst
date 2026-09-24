// tests/myStudyLibraryCourseBuilderContract.test.mjs
//
// My Study Library is a CREATION surface now.
//
// The old library was a flat organiser for links saved out of official
// courses (plan-limited, entitlement-gated, server-authoritative). It is gone:
// the page is the learner's own course shelf, and "+" opens a builder where
// they author a real course (cover image, modules, folders inside folders,
// resources, Brain MCQ sets) that opens in the SAME Course Player a purchased
// course opens.
//
// This suite pins that contract so neither surface can silently drift back:
//
//   1. the shelf: product-card grid + the "+" entry points, nothing else;
//   2. the builder: cover upload, module CRUD + nesting, resource CRUD
//      (name / file type / link or upload / description) and the Brain MCQ
//      editor (bulk paste + hand-written, like the admin's);
//   3. storage: one owner-scoped Firestore document per course (rules derive
//      ownership from the path);
//   4. the player: the SAME CoursePlayer, flagged `mine` — no Paid tab, no
//      "Get personal access" / "Add to My Module" / "Save for later" rows, and
//      every store (progress / notes / playback / mind maps / AI) namespaced
//      under `mine-<courseId>`;
//   5. routing: `#/my-course/new`, `#/my-course/<id>`, `#/my-course/<id>/edit`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const study = read("src/personal-library/StudyLibraryPage.tsx");
const card = read("src/personal-library/MyCourseCard.tsx");
const editor = read("src/personal-library/MyCourseEditorPage.tsx");
const brain = read("src/personal-library/MyCourseBrainEditor.tsx");
const playerHost = read("src/personal-library/MyCoursePlayerPage.tsx");
const adapter = read("src/lib/myCourseAdapter.ts");
const client = read("src/lib/myCourseClient.ts");
const types = read("src/types/myCourse.ts");
const player = read("src/CoursePlayerApp.tsx");
const playerPanel = read("src/course/PlayerPanel.tsx");
const overlay = read("src/course/CourseOverlay.tsx");
const peekDock = read("src/course/CoursePeekDock.tsx");
const routes = read("src/utils/appRoutes.ts");
const main = read("src/main.tsx");
const rules = read("firestore.rules");

// ---------------------------------------------------------------------------
// 1. The shelf — a grid of the learner's own courses + the "+" entry
// ---------------------------------------------------------------------------

test("the Study Library is a course shelf, not the old saved-link organiser", () => {
  assert.match(study, /My Study Library/);
  assert.match(study, /data-my-course-grid/);
  // The old organiser's surfaces are gone for good.
  for (const gone of [
    /Saved for Later/,
    /Recently opened/,
    /data-library-plan-usage/,
    /data-library-resource-grid/,
    /usageAtModuleLimit/,
    /usePersonalModules\(/,
    /personalResourceToCourseFile/,
  ]) {
    assert.doesNotMatch(study, gone, `study library still pins the old surface: ${gone}`);
  }
});

test("every course card is the store's product card — image, title, Play and Edit only", () => {
  // Same material and geometry as src/home/components/ProductCard.tsx.
  assert.match(card, /dc-scene-plate/);
  assert.match(card, /radius=\{24\}/);
  assert.match(card, /aspect-\[4\/3\]/);
  assert.match(card, /data-my-course-cover/);
  assert.match(card, /data-my-course-title/);
  assert.match(card, /data-my-course-play/);
  assert.match(card, /data-my-course-edit/);
  // Nothing else on the card: no favourite heart, no price, no rating, no
  // rating count, no share/study-pack row.
  for (const gone of [/onToggleFavorite/, /₹/, /ratingCount/, /Trending/, /data-create-study-pack/]) {
    assert.doesNotMatch(card, gone, `card carries an extra control: ${gone}`);
  }
});

test("the '+' opens the builder from the grid tile, the empty state and a floating button", () => {
  assert.match(study, /MY_COURSE_NEW_HASH = "#\/my-course\/new"/);
  assert.match(study, /data-my-course-create\b/);
  assert.match(study, /data-my-course-create-empty/);
  assert.match(study, /data-my-course-create-fab/);
  // Play and Edit go to the player / editor routes for that course.
  assert.match(study, /export const myCoursePlayHash = \(courseId: string\) => `#\/my-course\/\$\{encodeURIComponent\(courseId\)\}`;/);
  assert.match(study, /export const myCourseEditHash = \(courseId: string\) => `#\/my-course\/\$\{encodeURIComponent\(courseId\)\}\/edit`;/);
});

// ---------------------------------------------------------------------------
// 2. The builder — everything the learner needs to design a course
// ---------------------------------------------------------------------------

test("the builder captures the cover image by upload or by URL", () => {
  assert.match(editor, /data-my-course-cover-input/);
  assert.match(editor, /uploadMyCourseCover\(/);
  assert.match(editor, /paste an image URL/);
  // Uploads fall back so a cover never dead-ends: Cloudinary → Firebase
  // Storage → a downscaled in-document data URL.
  assert.match(client, /uploadImageToCloudinary\(/);
  assert.match(client, /community\/myCourses\//);
  assert.match(client, /imageToDataUrl\(/);
});

test("the builder creates modules, folders inside folders, and reorders / deletes them", () => {
  assert.match(editor, /data-my-course-add-module/);
  assert.match(editor, /data-my-module-add-child/);
  assert.match(editor, /createMyModule\(/);
  assert.match(editor, /addChildNode\(draft\.modules, parentId, createMyModule/);
  assert.match(editor, /const updateNode = /);
  assert.match(editor, /const removeNode = /);
  assert.match(editor, /const moveNode = /);
  assert.match(editor, /MY_COURSE_MAX_DEPTH/);
  assert.match(editor, /Nesting limit reached/);
  // Destructive actions confirm first.
  assert.match(editor, /ConfirmDialog/);
  assert.match(editor, /data-my-course-delete/);
});

test("a resource carries name, file type, a link OR an upload, and details", () => {
  assert.match(editor, /data-my-resource-name/);
  assert.match(editor, /data-my-resource-type-select/);
  assert.match(editor, /data-my-resource-url/);
  assert.match(editor, /data-my-resource-file/);
  assert.match(editor, /uploadMyCourseResourceFile\(/);
  // Every file type the official player understands, plus Brain.
  for (const type of ["youtube", "video", "audio", "pdf", "doc", "sheet", "slides", "image", "google_form", "embed", "ebook", "mindmap", "brain"]) {
    assert.match(editor, new RegExp(`id: "${type}"`), `resource type missing: ${type}`);
  }
  // A resource the player cannot open is named out loud in the editor.
  assert.match(editor, /the player opens a resource only when it has something to show/);
});

test("Brain (MCQ) creation mirrors the admin: bulk paste AND hand-written questions", () => {
  // Same parser as the admin's Practice Set importer.
  assert.match(brain, /parseQuestionText/);
  assert.match(brain, /data-my-brain-paste-input/);
  assert.match(brain, /data-my-brain-import/);
  // Hand-written: prompt, options, marking the answer, explanation,
  // difficulty and topic — the exact fields utils/practiceSet.js defines.
  assert.match(brain, /data-my-brain-add/);
  assert.match(brain, /data-my-brain-prompt/);
  assert.match(brain, /data-my-brain-option-mark/);
  assert.match(brain, /difficulty/);
  assert.match(brain, /Explanation \(shown after answering\)/);
  assert.match(brain, /MAX_PRACTICE_OPTIONS/);
  assert.match(brain, /MIN_PRACTICE_OPTIONS/);
  // Readiness rule: prompt + ≥2 options + a marked answer.
  assert.match(brain, /no answer marked/);
});

// ---------------------------------------------------------------------------
// 3. Storage — one owner-scoped document per course
// ---------------------------------------------------------------------------

test("courses live in users/{uid}/myCourses and the rules re-derive ownership from the path", () => {
  assert.match(client, /MY_COURSES_COLLECTION = "myCourses"/);
  assert.match(client, /collection\(db, "users", uid, MY_COURSES_COLLECTION\)/);
  assert.match(client, /doc\(db, "users", uid, MY_COURSES_COLLECTION, courseId\)/);
  assert.match(rules, /match \/myCourses\/\{courseId\}/);
  assert.match(rules, /allow read, delete: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(rules, /allow create, update: if isOwner\(uid\)[\s\S]*?request\.resource\.data\.uid == uid/);
  // Never writable into another learner's namespace, never a plan/entitlement
  // surface: no purchase, coin or subscription fields may ride along.
  assert.match(rules, /!request\.resource\.data\.keys\(\)\.hasAny\(\['role', 'status', 'purchasedProductIds'/);
  // Document-size guard rails.
  assert.match(types, /MY_COURSE_MAX_MODULES/);
  assert.match(types, /MY_COURSE_MAX_RESOURCES/);
  assert.match(types, /MY_COURSE_MAX_COVER_BYTES/);
});

test("the stored shape is normalised on read so a bad document can never crash the page", () => {
  assert.match(client, /export const parseMyCourse = /);
  assert.match(client, /export const sanitizeMyCourse = /);
  assert.match(client, /schemaVersion/);
  assert.doesNotMatch(client, /JSON\.parse\(course/);
});

// ---------------------------------------------------------------------------
// 4. The player — the SAME Course Player, on the learner's own content
// ---------------------------------------------------------------------------

test("a learner-authored course is projected into the player's own Product shape", () => {
  assert.match(playerHost, /lazy\(\(\) => import\("\.\.\/CoursePlayerApp"\)\)/);
  assert.match(playerHost, /<CoursePlayer/);
  assert.match(adapter, /export const myCourseToProduct/);
  assert.match(adapter, /courseContent: course\.modules\.map\(toCourseModule\)/);
  assert.match(adapter, /id: myCourseStorageId\(course\.id\)/);
  // Brain sets survive the projection with their questions…
  assert.match(adapter, /practiceQuestions: toPracticeQuestions\(resource\)/);
  // …and a resource the player cannot open is filtered out, never a blank frame.
  assert.match(adapter, /export const myResourceIsPlayable/);
  assert.match(adapter, /module\.resources\.filter\(myResourceIsPlayable\)/);
});

test("the player knows it is showing the learner's own course", () => {
  assert.match(player, /mine\?: \{ courseId: string \} \| null/);
  assert.match(playerHost, /mine=\{\{ courseId: course\.id \}\}/);
  // No access resolution (they own it), whole tree granted.
  assert.match(player, /useCourseAccess\(\{ product, skip: isMine \}\)/);
  assert.match(player, /hasFullProductAccess: true/);
});

test("no premium (Paid) tab in a learner-authored course", () => {
  assert.match(player, /MINE_HIDDEN_TABS: DockTab\[\] = \["paid"\]/);
  // The tab is filtered out of both docks and out of the ⌘/Ctrl+1… walk…
  assert.match(overlay, /hiddenTabs\?: DockTab\[\]/);
  assert.match(overlay, /buildDockItems = \(tab: DockTab, hiddenTabs: DockTab\[\] = \[\]\)/);
  assert.match(overlay, /TABS\.filter\(\(\{ key \}\) => !hiddenTabs\.includes\(key\)\)/);
  assert.match(peekDock, /buildDockItems\(tab, hiddenTabs\)/);
  assert.match(player, /const visibleTabOrder = useMemo\(/);
  // …and a hidden tab can never be the open one.
  assert.match(player, /if \(hiddenTabs\.includes\(dockTab\)\) setDockTab\("modules"\);/);
});

test("settings stay, the three official-resource rows do not", () => {
  // "Get personal access" (the Drive email gate), "Add to My Module" and
  // "Save for later" exist only for OFFICIAL course resources.
  assert.match(playerPanel, /mine\?: boolean/);
  assert.match(playerPanel, /!mine && gateFile \? \(/);
  assert.match(playerPanel, /!mine && showPersonalLibraryActions && onAddToPersonalModule/);
  assert.match(playerPanel, /!mine && showPersonalLibraryActions && onSaveForLater/);
  // Every other preference is untouched.
  assert.match(playerPanel, /settingsRow\("Snowfall"/);
  assert.match(playerPanel, /settingsRow\("Always-visible footer dock"/);
});

test("everything the learner writes is stored under mine-<courseId>", () => {
  assert.match(player, /storageProductId = isMine && mine \? `mine-\$\{mine\.courseId\}` : String\(product\.id\)/);
  assert.match(types, /export const myCourseStorageId = \(courseId: string\): string => `mine-\$\{courseId\}`;/);
  // progress · notes · playback · mind maps · AI chat · split ratio
  assert.match(player, /doc\(db, "users", user\.id, "courseProgress", storageProductId\)/);
  assert.match(player, /loadLocalNotes\(user\.id, storageProductId\)/);
  assert.match(player, /persistLocalNotes\(user\.id, storageProductId, next\)/);
  assert.match(player, /loadPlaybackStore\(user\.id, storageProductId\)/);
  assert.match(player, /persistPlaybackStore\(user\.id, storageProductId, playbackRef\.current\)/);
  assert.match(player, /productId: storageProductId,\s*\n\s*moduleId: activeMindMapModuleId,/);
  assert.match(player, /<LumenChat\s*\n\s*key=\{storageProductId\}/);
  assert.match(player, /courseId=\{storageProductId\}/);
});

test("the player never offers the official 'My Modules' manager on a learner-authored course", () => {
  assert.match(player, /personalModulesEntry=\{isMine \? null : personalModulesEntry\}/);
});

// ---------------------------------------------------------------------------
// 5. Routing
// ---------------------------------------------------------------------------

test("the builder and the player are authenticated lazy routes", () => {
  assert.match(main, /MY_COURSE_HASH = "#\/my-course\/"/);
  assert.match(main, /lazyRoute\(\(\) => import\("\.\/personal-library\/MyCourseEditorPage"\)\)/);
  assert.match(main, /lazyRoute\(\(\) => import\("\.\/personal-library\/MyCoursePlayerPage"\)\)/);
  assert.match(main, /hash\.startsWith\(MY_COURSE_HASH\)/);
  assert.match(main, /<MyCourseEditorPage/);
  assert.match(main, /<MyCoursePlayerPage/);
  assert.match(routes, /"#\/my-course\/"/);
  // Both require a signed-in learner (the guard bounces to login).
  const prefixes = routes.slice(routes.indexOf("AUTH_REQUIRED_PREFIXES"), routes.indexOf("] as const;"));
  assert.match(prefixes, /MY_COURSE_PREFIX/);
});

test("#/my-course/new and #/my-course/<id>/edit open the builder; #/my-course/<id> opens the player", () => {
  assert.match(routes, /export const isMyCourseEditorRoute = /);
  assert.match(routes, /export const isMyCoursePlayerRoute = /);
  assert.match(routes, /export const readMyCourseId = /);
  // `new` → a blank course; an id → that course; `/edit` → the builder.
  assert.match(routes, /if \(!rest \|\| rest === "new"\) return null;/);
  assert.match(routes, /if \(!rest \|\| rest === "new"\) return true;/);
  assert.match(routes, /rest\.split\("\/"\)\[1\] === "edit"/);
  assert.match(routes, /tail\[0\] === "edit" \? id : id/);
  assert.match(main, /isMyCourseEditorRoute\(hash\) \? \(/);
});

test("the player route is a full-screen experience; the builder keeps the app chrome", () => {
  assert.match(main, /isMyCoursePlayerRoute\(hash\)/);
  assert.doesNotMatch(main, /hash\.startsWith\("#\/my-course\/"\)\s*\n\s*\|\| hash\.startsWith\(PROFILE_PREVIEW_HASH\)/);
});
