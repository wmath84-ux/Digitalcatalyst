// Contract for the ONE listing system used by every Course Player library:
// the Modules library, the Notes library (MASTER + SELF) and the Mind Map
// library (MASTER + SELF). All of them render `BranchedMenu`, which follows the
// React Bits Branched Menu design (connected branch lines, folding sections,
// accent-drawn active branch). The old folder burst, the classic module list,
// the flat module rows and the study-resource card family are gone.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const menu = read("src/components/branched-menu/BranchedMenu.tsx");
const menuCss = read("src/components/branched-menu/BranchedMenu.css");
const tree = read("src/components/branched-menu/branchedTree.ts");
const library = read("src/course/CourseResourceLibrary.tsx");
const libraryCss = read("src/course/courseResourceLibrary.css");
const notes = read("src/course/NotesPanel.tsx");
const maps = read("src/course/MindMapPanel.tsx");
const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const states = read("src/course/StudyLibraryStates.tsx");
const statesCss = read("src/course/study-library-states.css");
const visibility = read("src/course/fileVisibility.ts");

test("one shared BranchedMenu module exports the menu, its skeleton and the open-state hook", () => {
  assert.match(menu, /export default function BranchedMenu\b/);
  assert.match(menu, /export function BranchedMenuSkeleton\b/);
  assert.match(menu, /export function useBranchedOpen\b/);
  assert.match(tree, /export function buildBranchTree\b/);
  assert.match(tree, /export function ancestorSectionValues\b/);
  assert.match(tree, /export function allSectionValues\b/);
});

test("the Modules, Notes and Mind Map libraries all render the shared menu", () => {
  for (const [name, source] of [["Modules", library], ["Notes", notes], ["Mind Maps", maps]]) {
    assert.match(source, /import BranchedMenu\b[^\n]*branched-menu\/BranchedMenu"/, `${name} imports the shared menu`);
    assert.match(source, /<BranchedMenu\b/, `${name} renders the shared menu`);
    assert.match(source, /useBranchedOpen\(/, `${name} keeps controlled open state through the shared hook`);
  }
});

test("the replaced listing implementations are gone and nothing imports them", () => {
  for (const gone of [
    "src/course/ModuleFolderBurst.tsx",
    "src/course/uiverse-folder-card.css",
    "src/course/ClassicModuleList.tsx",
    "src/course/StudyResourceCard.tsx",
    "src/course/study-resource-card.css",
  ]) {
    assert.equal(fs.existsSync(new URL(`../${gone}`, import.meta.url)), false, `${gone} was removed`);
  }
  assert.doesNotMatch(player, /ModuleFolderBurst/);
  for (const source of [library, notes, maps, overlay, player]) {
    assert.doesNotMatch(source, /StudyResourceCard|ModuleFolderBurst|ClassicModuleList|uiverse-folder/);
  }
});

test("the Modules page has no filter chips, but keeps its title search", () => {
  assert.doesNotMatch(library, /FILTERS|LibraryFilterChips|data-library-filter/);
  assert.match(library, /LibrarySearchBar|searchQuery/);
});

test("the Modules library shows the real module tree and the My Modules root entry", () => {
  assert.match(library, /data-course-library-module/);
  assert.match(library, /personal-modules-entry/);
  assert.match(library, /personalEntry/);
  assert.match(player, /resourceLibraryPanel = \(\s*\n\s*<CourseResourceLibrary/);
  assert.match(player, /personalEntry=\{libraryPersonalEntry\}/);
  assert.match(player, /const libraryPersonalEntry = isMine \|\| !personalModulesEntry/);
});

test("the Paid list keeps the SnapList; the module-row builder is removed from the overlay", () => {
  assert.match(overlay, /const listRows = paidRows;/);
  assert.doesNotMatch(overlay, /moduleRows|const flatModules/);
  assert.match(overlay, /\bSnapList\b/);
});

test("section heads only fold: a click toggles open state and never selects a child", () => {
  // Section heads call onToggle; selection is only fired from leaf rows.
  assert.match(menu, /onClick=\{\(\) => \{ if \(kids\.length > 0\) onToggle\(item\.value, !open\); \}\}/);
  const leafBranch = menu.slice(menu.indexOf("data-branched-leaf"));
  assert.match(leafBranch, /onSelect\?\.\(item\.value, item\)/);
  assert.doesNotMatch(menu.slice(menu.indexOf("data-branched-section") - 400, menu.indexOf("data-branched-section")), /onSelect\?\.\(/);
});

test("locked and disabled leaves are visible but not selectable", () => {
  assert.match(menu, /disabled/);
  assert.match(library, /locked/);
});

test("MASTER and SELF are subtle tags, shown for notes and maps", () => {
  assert.match(menu, /data-branched-tag=/);
  assert.match(notes, /tag: \{ label: "MASTER"/);
  assert.match(notes, /tag: \{ label: "SELF"/);
  assert.match(maps, /tag: \{ label: "MASTER"/);
  assert.match(maps, /tag: \{ label: "SELF"/);
});

test("the master and self resources open from the right page", () => {
  // Notes: master opens the read-only viewer, self opens the editor.
  assert.match(notes, /setViewingMasterNoteId\(note\.id\)/);
  assert.match(notes, /startEdit\(note\)/);
  // Mind maps: master goes through the player (its module), self opens its map.
  assert.match(maps, /onOpenMasterMap\?\.\(key\)/);
  assert.match(maps, /openMap\(key\)/);
  assert.match(player, /onOpenMasterMap=\{handleOpenMasterMap\}/);
  assert.match(player, /const handleOpenMasterMap = useCallback\(\(mapKey: string\)/);
  assert.match(player, /selectFile\(entry\.file\)/);
});

test("the Modules library opens a mind map on its own module without a file selected", () => {
  assert.match(player, /const \[mindMapModuleOverride, setMindMapModuleOverride\]/);
  assert.match(player, /const activeMindMapModuleId = mindMapModuleOverride/);
  assert.match(player, /const selectFile = \(file: CourseFile\) => \{\s*\n\s*setMindMapModuleOverride\(null\);/);
  assert.match(player, /handleOpenMindMapResourceFromLibrary = useCallback\(\(file: CourseFile/);
});

test("master mind maps are filtered to unlocked modules and carry their module chain", () => {
  assert.match(player, /const masterMindMaps = useMemo<MasterMindMapEntry\[\]>/);
  assert.match(player, /accessibleModuleIds\.has\(String\(m\.id\)\) \|\| resolution\.previewModuleIds\.has/);
  assert.match(player, /const segments = courseModuleSegments\(modules, m\.id\)/);
});

test("the Modules library shows only lessons with real content (shared visibility rule)", () => {
  assert.match(visibility, /export const isVisibleFile = /);
  assert.match(visibility, /export const hasUrlContent = /);
  assert.match(visibility, /export const isExperimentFile = /);
  assert.match(library, /import \{ isVisibleFile \} from "\.\/fileVisibility"/);
  assert.match(library, /if \(!isVisibleFile\(file\)\) continue;/);
});

test("empty, loading and error states come from one shared states module", () => {
  assert.match(states, /export function StudyLibraryEmptyState\b/);
  assert.match(states, /export function StudyLibraryNotice\b/);
  assert.match(menu, /export function BranchedMenuSkeleton\b/);
  for (const [name, source] of [["Notes", notes], ["Mind Maps", maps]]) {
    assert.match(source, /StudyLibraryEmptyState/, `${name} shows the shared empty state`);
    assert.match(source, /StudyLibraryNotice/, `${name} shows the shared notice`);
    assert.match(source, /BranchedMenuSkeleton/, `${name} shows the shared loading skeleton`);
  }
  assert.match(statesCss, /\.study-library-empty \{/);
  assert.match(statesCss, /\.study-library-notice \{/);
  assert.match(statesCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test("long names wrap and the menu is usable on an 11-inch tablet", () => {
  assert.match(menuCss, /overflow-wrap: anywhere/);
  assert.match(libraryCss, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(menuCss, /text-overflow: ellipsis/, "long names are never truncated");
});

test("the menu uses the shared branch tokens, with reduced-motion handling", () => {
  for (const token of ["--bm-indent", "--bm-line", "--bm-accent", "--bm-ink", "--bm-muted", "--bm-row"]) {
    assert.match(menuCss, new RegExp(token.replace(/-/g, "\\-")), `token ${token} is used`);
  }
  assert.match(menuCss, /@media \(prefers-reduced-motion: reduce\)/);
});
