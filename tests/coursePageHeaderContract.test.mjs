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
//   6. Resource Library ka existing background aur appearance unchanged rahe —
//      with ONE exception the owner asked for on 2026-10-16: that page, its
//      header strip included, is PURE white, and its name/icon/count live on
//      the page itself (its header strip carries the page's search box).
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
  // Notes and the mind map are NOT here on purpose: the owner's brief removed
  // the page header from every notes page, and the mind map followed the same
  // design system (see the MASTER / SELF test below).

  ["src/course/CourseBrainPanel.tsx", "Brain"],
  ["src/course/ExperimentPanel.tsx", "Live Experiment"],
  ["src/course/ReadLibraryPanel.tsx", "Read library"],
  ["src/course/PersonalModulesPanel.tsx", "My Modules"],
  ["src/course/PlayerPanel.tsx", "Player"],
  ["src/course/CourseOverlay.tsx", "Paid content"],
];

const LIBRARY = "src/course/CourseResourceLibrary.tsx";

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
    if (file === LIBRARY) {
      // The library keeps the shared header BOX (same area, same size), but the
      // owner moved its name, icon and count DOWN onto the page itself
      // (2026-10-16) — the strip carries the page's search box instead.
      assert.doesNotMatch(headerSlice(source), /title="Resource Library"/);
      const row = source.indexOf("data-library-title-row");
      const rowSlice = source.slice(row, source.indexOf("</div>", row));
      assert.ok(row > 0, "the library's name row sits on the page");
      assert.match(rowSlice, /data-course-page-title/);
      assert.match(rowSlice, />Resource Library</);
      assert.match(rowSlice, /library-header__count/, "…with the resource count beside it");
      assert.match(rowSlice, /<BookOpen size=\{20\}/, "…and the same 20px icon");
      continue;
    }
    const slice = headerSlice(source);
    assert.ok(slice.includes(`title="${title}"`), `${file} names its page "${title}" in the header`);
    assert.match(slice, /icon=\{<[A-Z]\w+ size=\{20\}/, `${file} gives its header a 20px icon`);
  }
});

test("MASTER / SELF controls live inside the header, in the defined area", () => {
  // The shared control, inside the header element (not the scrolling body).
  for (const file of ["src/course/CourseBrainPanel.tsx", "src/course/ExperimentPanel.tsx"]) {
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
  // The filter is EXPANDED at the top of the panel (owner, 2026-10-17: "top
  // control ko theek / expand karo") — it fills the row beside the back
  // button, and it reads "Course library" / "My library".
  assert.match(notesHead, /masterLabel="Course library"/);
  assert.match(notesHead, /selfLabel="My library"/);
  assert.match(notesHead, /expand/);
  assert.doesNotMatch(notesHead, /justify-center/, "it is not a tiny centred pill any more");
  assert.match(headerSlice(read("src/course/CourseBrainPanel.tsx")), /data-brain-collection/);
  assert.match(headerSlice(read("src/course/ExperimentPanel.tsx")), /data-experiment-collection/);
  // The mind map is headless too ("use that same complete, exact UI design
  // system in the mind map"). Its MASTER / SELF control sits at the top centre
  // of the ONE library panel, beside the notes page's own.
  const mindMap = read("src/course/MindMapPanel.tsx");
  assert.doesNotMatch(mindMap, /CoursePageHeader|data-course-page-header/);
  const mapHeadAt = mindMap.indexOf("data-mindmap-panel-head");
  const mapHead = mindMap.slice(mindMap.lastIndexOf("<div", mapHeadAt), mindMap.indexOf("data-course-mindmap-map-list"));
  assert.match(mapHead, /<MasterSelfControl/);
  assert.match(mapHead, /feature="mindMap"/);
  assert.match(mapHead, /data-course-mindmap-collections/, "the collection switcher keeps its hook");
  // The map's filter is expanded the very same way.
  assert.match(mapHead, /masterLabel="Course library"/);
  assert.match(mapHead, /selfLabel="My library"/);
  assert.match(mapHead, /expand/);
  assert.doesNotMatch(mapHead, /justify-center/, "it is not a tiny centred pill any more");
});

test("the Resource Library is PURE white — the page, its header and its body", () => {
  const library = read("src/course/CourseResourceLibrary.tsx");
  assert.match(headerSlice(library), /data-library-header/);
  assert.match(library, /library-header__count/);
  // The shared sheet paints this ONE page pure white (owner brief, 2026-10-16);
  // the ~95% plate below deliberately does not list it.
  const white = headerCssRules.slice(headerCssRules.indexOf("[data-course-resource-library]"));
  assert.match(white.slice(0, 400), /background: #ffffff !important;/);
  assert.match(white.slice(0, 400), /\[data-course-resource-library\] \.library-header/);
  assert.match(white.slice(0, 400), /\[data-course-resource-library\] \.library-body/);
  const plate = headerCssRules.slice(headerCssRules.indexOf(":is("), headerCssRules.indexOf(":is(") + 900);
  assert.doesNotMatch(plate, /data-course-resource-library/);
  // …and the library's own sheet says the same thing for its root and body.
  const libraryCss = stripComments(read("src/course/courseResourceLibrary.css"));
  assert.match(libraryCss, /\.course-resource-library \{[^}]*background: #ffffff;/);
  assert.match(libraryCss, /\.library-body \{[^}]*background: #ffffff;/);
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
    // The mind map's pages are headless now, so they wear their own --mm-*
    // palette (Light / Dark with the map's own theme) instead of the plate.
    'data-course-overlay-tab="paid"',
  ]) {
    assert.ok(headerCssRules.includes(hook), `${hook} gets the ~95% white page background`);
  }
});
