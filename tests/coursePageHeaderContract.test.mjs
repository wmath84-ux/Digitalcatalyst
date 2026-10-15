// tests/coursePageHeaderContract.test.mjs
//
// The owner's direction:
//   1. Course Player ke sabhi relevant pages ka header Resource Library ke
//      header ke bilkul same size ka ho.
//   2. Har page par page ka naam clear, bold, icon ke saath dikhe — Resource
//      Library par bhi.
//   3. Jahan MASTER / SELF buttons hain, woh header ke andar, Resource
//      Library ke header jitne defined area mein hon.
//   4. Course Player ke main header ki actual current width (strip) mein
//      50% increase ho.
//   5. Baaki pages ka background approximately 95% pure white ho.
//   6. Resource Library ka existing background aur appearance unchanged rahe.
//
// "Same size" is made testable by ONE shared component + ONE defined height
// token: every page below renders `CoursePageHeader`, whose box is
// `--dc-course-page-header-h`. The Resource Library header is built from
// that same component, so it is the reference by construction, not by
// copying numbers into ten files.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const headerComponent = read("src/course/CoursePageHeader.tsx");
const headerCss = read("src/course/coursePageHeader.css");
const headerCssRules = stripComments(headerCss);
const main = read("src/main.tsx");
const player = read("src/CoursePlayerApp.tsx");

const PAGES = [
  ["src/course/CourseResourceLibrary.tsx", "Resource Library"],
  // Notes is NOT here on purpose: the owner's brief removed the page header
  // from every notes page (see the MASTER / SELF test below).
  ["src/course/MindMapPanel.tsx", "Mind map"],
  ["src/course/CourseBrainPanel.tsx", "Brain"],
  ["src/course/ExperimentPanel.tsx", "Live Experiment"],
  ["src/course/ReadLibraryPanel.tsx", "Read library"],
  ["src/course/PersonalModulesPanel.tsx", "My Modules"],
  ["src/course/PlayerPanel.tsx", "Player"],
  ["src/course/CourseOverlay.tsx", "Paid content"],
];

const headerSlice = (source) => {
  const start = source.indexOf("<CoursePageHeader");
  assert.notEqual(start, -1, "page renders the shared CoursePageHeader");
  const closed = source.indexOf("</CoursePageHeader>", start);
  const selfClosed = source.indexOf("/>", start);
  const end = closed !== -1 ? closed : selfClosed;
  assert.notEqual(end, -1, "the shared header is closed");
  return source.slice(start, end);
};

test("one shared header defines the Resource Library header's area for every page", () => {
  assert.match(headerComponent, /data-course-page-header=""/);
  assert.match(headerComponent, /data-course-page-title/);
  assert.match(headerComponent, /course-page-header__actions/);
  // The defined area: one height token, applied as the header's exact height.
  assert.match(headerCss, /--dc-course-page-header-h: 48px;/);
  assert.match(headerCssRules, /header\.course-page-header \{[\s\S]*?height: var\(--dc-course-page-header-h, 48px\);/);
  assert.match(headerCssRules, /header\.course-page-header \{[\s\S]*?min-height: var\(--dc-course-page-header-h, 48px\);/);
  // Clear, bold page names with an icon slot, aligned the same way everywhere.
  assert.match(headerCssRules, /\.course-page-header__title \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 800;/);
  assert.match(headerComponent, /course-page-header__icon/);
  // Loaded once for the whole player, after the theme sheet it must out-rank.
  assert.ok(
    main.indexOf('import "./course/courseTheme.css"') < main.indexOf('import "./course/coursePageHeader.css"'),
    "coursePageHeader.css loads after courseTheme.css",
  );
});

test("every relevant Course Player page renders the shared header with its name and icon", () => {
  for (const [file, title] of PAGES) {
    const source = read(file);
    const slice = headerSlice(source);
    assert.ok(slice.includes(`title="${title}"`), `${file} names its page "${title}" in the header`);
    assert.match(slice, /icon=\{<[A-Z]\w+ size=\{20\}/, `${file} gives its header a 20px icon`);
  }
});

test("MASTER / SELF controls live inside the header, in the defined area", () => {
  // The shared control, inside the header element (not the scrolling body).
  for (const file of ["src/course/CourseBrainPanel.tsx", "src/course/ExperimentPanel.tsx", "src/course/MindMapPanel.tsx"]) {
    assert.match(headerSlice(read(file)), /<MasterSelfControl/, `${file} keeps MASTER / SELF inside its page header`);
  }
  // Notes has NO header at all any more (owner brief 2026-10-15: "koi header
  // hoga hi nahin kahin bhi, pure note me"). Its MASTER / SELF tablist heads
  // the ONE library panel instead — same shared control, same hooks.
  const notes = read("src/course/NotesPanel.tsx");
  assert.doesNotMatch(notes, /CoursePageHeader|data-course-page-header/);
  const headAt = notes.indexOf("data-note-library-head");
  const notesHead = notes.slice(notes.lastIndexOf("<div", headAt), notes.indexOf("data-note-library-foot"));
  assert.match(notesHead, /<MasterSelfControl/);
  assert.match(notesHead, /feature="notes"/);
  // …and the shared control keeps the hooks the tabs have always had.
  const control = read("src/course/MasterSelfControl.tsx");
  assert.match(control, /data-course-note-collection="master"/);
  assert.match(control, /data-course-note-collection="self"/);
  assert.match(notesHead, /justify-center/, "the filter sits at the panel's top CENTRE");
  assert.match(headerSlice(read("src/course/CourseBrainPanel.tsx")), /data-brain-collection/);
  assert.match(headerSlice(read("src/course/ExperimentPanel.tsx")), /data-experiment-collection/);
  assert.match(headerSlice(read("src/course/MindMapPanel.tsx")), /data-course-mindmap-collections/);
});

test("the Resource Library keeps its header hooks and its existing background", () => {
  const library = read("src/course/CourseResourceLibrary.tsx");
  const slice = headerSlice(library);
  assert.match(slice, /data-library-header/);
  assert.match(slice, /library-header__count/);
  // No background rule for the library anywhere in the new sheet, and the
  // library's own sheet still paints no background on its root/header/body.
  assert.doesNotMatch(headerCssRules, /data-course-resource-library/);
  assert.doesNotMatch(headerCssRules, /\.library-(header|body)/);
  const libraryCss = stripComments(read("src/course/courseResourceLibrary.css"));
  assert.doesNotMatch(libraryCss, /\.course-resource-library \{[^}]*background/);
  assert.doesNotMatch(libraryCss, /\.library-body \{[^}]*background/);
});

test("the main (top) header grows by an actual 50%: 21px to 31.5px", () => {
  assert.match(player, /data-course-top-progress/);
  assert.match(headerCssRules, /\[data-course-top-progress\] \{[\s\S]*?min-height: 31\.5px;/);
});

test("the other pages sit on approximately 95% pure white", () => {
  assert.match(headerCss, /--dc-course-page-bg: #f2f2f2;/);
  for (const hook of [
    'data-course-notes-panel',
    "data-course-brain-panel",
    "data-course-experiment-panel",
    "data-course-read-panel",
    "data-course-music-panel",
    "data-course-personal-modules",
    "data-course-player-panel",
    "data-course-mindmap-library",
    'data-course-overlay-tab="paid"',
  ]) {
    assert.ok(headerCssRules.includes(hook), `${hook} gets the ~95% white page background`);
  }
});
