// tests/nature3dSanctuaryModulesContract.test.mjs
//
// The sanctuary bottom tray now carries scenery views (moved out of the ⋮
// settings dropdown) plus a Module button. Creating a module uses the same
// My Study Library storage (`createSanctuaryModule` → users/{uid}/myCourses)
// so the reading board and the dedicated Course Player both see it.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const MENU = read("src/nature3d/boards/SanctuaryModuleMenu.tsx");
const MOD = read("src/nature3d/boards/sanctuaryModules.ts");
const READING = read("src/nature3d/boards/ReadingBoard.tsx");
const BOARDS = read("src/nature3d/boards/StudyBoards.tsx");
const pageCode = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const modCode = MOD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("scenery views live on the bottom tray, not in the settings dropdown", () => {
  assert.match(PAGE, /PRESETS\.map\(\(\{ key, label, short, Icon \}\)/, "views render on the tray");
  assert.match(PAGE, /focusSceneryView/, "tray views fly the camera");
  assert.doesNotMatch(pageCode, /MenuSection label=\"Views\"/, "the ⋮ menu no longer lists views");
  for (const key of ["world", "trek", "sanctuary", "warehouse", "houses", "board", "waterfall", "wildlife"]) {
    assert.match(PAGE, new RegExp(`key: \"${key}\"`), `preset ${key} still exists`);
  }
});

test("the tray has a Module button that opens a create/library dropdown", () => {
  assert.match(PAGE, /<SanctuaryModuleMenu/, "the tray mounts the module menu");
  assert.match(MENU, /data-sanctuary-module-menu/, "the control is tagged");
  assert.match(MENU, /data-sanctuary-module-create/, "the create form is tagged");
  assert.match(MENU, /data-sanctuary-module-library/, "created modules are listed");
  assert.match(MENU, />Module</, "the tray button is labelled Module");
  assert.match(MENU, /Create module/, "the form commits a module");
});

test("createSanctuaryModule writes a My Study Library course of every file type", () => {
  assert.match(modCode, /export async function createSanctuaryModule/, "a dedicated create function exists");
  assert.match(modCode, /saveMyCourse\(uid, course\)/, "it persists through the Study Library client");
  assert.match(modCode, /uploadMyCourseResourceFile/, "file uploads reuse the library uploader");
  assert.match(modCode, /sanctuaryModulePlayHash/, "play uses the dedicated course-player route");
  assert.match(modCode, /#\/my-course\//, "the player hash is the library's player");
  for (const type of [
    "youtube", "video", "audio", "pdf", "doc", "sheet", "slides",
    "image", "google_form", "embed", "ebook", "mindmap", "brain",
  ]) {
    assert.match(MOD, new RegExp(`id: \"${type}\"`), `type ${type} is offered`);
  }
});

test("created modules show on the reading board and can open the course player", () => {
  assert.match(READING, /data-reading-mine-library/, "the board has a created-by-you shelf");
  assert.match(READING, /onPlayMyCourse/, "a created module can open the Course Player");
  assert.match(BOARDS, /myCourses/, "board portals receive self-authored courses");
  assert.match(PAGE, /myCourseToProduct/, "sanctuary projects library courses onto the board");
  assert.match(PAGE, /focusStudyView\(\"reading\"\)/, "the Module button lands on the reading board");
  assert.match(PAGE, /setOpenCourseId\(myCourseStorageId\(course\.id\)\)/, "Play loads the self-authored course inline without leaving the Sanctuary");
});
