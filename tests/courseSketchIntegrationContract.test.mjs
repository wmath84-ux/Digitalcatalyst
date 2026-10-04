// tests/courseSketchIntegrationContract.test.mjs
//
// The SHAPE of the Course Player's Excalidraw integration. The two runtime
// files prove the behaviour (scene model + persistence); this one pins the
// things a future refactor could quietly undo in the source:
//
//   · the editor is the OFFICIAL @excalidraw/excalidraw React component with
//     its own UI — not a hand-rolled toolbar, and never `ui: false`;
//   · Sketch is ONE MORE TAB in the existing dock, not a second dock, not a
//     page, not a modal;
//   · the Split Deck is still the only owner of the split — the panel does
//     not read, write, or guess a ratio, and never measures the window;
//   · nothing can remount the editor except a real change of board;
//   · the chunk is lazy, the fonts are self-hosted, the rules are owner-only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
/** Source with its comments removed — for the "must not contain" checks that
 *  would otherwise trip over the file's own prose explaining the rule. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const panel = read("src/course/SketchPanel.tsx");
const hook = read("src/course/useCourseSketch.ts");
const assets = read("src/course/excalidrawAssets.ts");
const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const deck = read("src/course/studyPanels.tsx");
const motion = read("src/course/splitMotion.ts");
const rules = read("firestore.rules");
const viteConfig = read("vite.config.ts");
const pkg = JSON.parse(read("package.json"));

// ---------------------------------------------------------------------------
// The official editor, with its own UI
// ---------------------------------------------------------------------------

test("the panel renders the official Excalidraw component and its stylesheet", () => {
  assert.equal(
    Boolean(pkg.dependencies?.["@excalidraw/excalidraw"]),
    true,
    "the editor is a real dependency, not a vendored copy",
  );
  assert.match(panel, /import \{ Excalidraw \} from "@excalidraw\/excalidraw";/);
  assert.match(panel, /import "@excalidraw\/excalidraw\/index\.css";/);
  assert.match(panel, /<Excalidraw\b/);
  // Its own toolbar, menus and tools stay on: no headless mode, no UI kill
  // switch, no re-implementation of a drawing toolbar in this repo.
  assert.doesNotMatch(code(panel), /ui=\{?false|UIOptions=\{\{\s*canvasActions:\s*false/);
  assert.doesNotMatch(code(panel), /viewModeEnabled=\{true\}|zenModeEnabled=\{true\}/);
  assert.doesNotMatch(code(panel), /<canvas/i, "the panel never draws its own canvas");
});

test("the player's own keyboard shortcuts keep priority over the editor's", () => {
  assert.match(panel, /handleKeyboardGlobally=\{false\}/);
  // One keyboard detector for the whole player — the Sketch tab reuses it
  // through the deck, exactly like notes / mind map / AI.
  assert.doesNotMatch(code(panel), /visualViewport|useCourseKeyboard|keyboardVisible/);
  assert.match(player, /keyboardExpandEnabled=\{dockTab === "notes" \|\| dockTab === "mindmap" \|\| dockTab === "ai" \|\| dockTab === "sketch"\}/);
});

// ---------------------------------------------------------------------------
// One more tab in the dock that already exists
// ---------------------------------------------------------------------------

test("Sketch is one more entry in the existing tab infrastructure", () => {
  assert.match(overlay, /export type DockTab =[^;]*\| "sketch" \| "read";/);
  assert.match(overlay, /\{ key: "sketch", label: "Sketch",[\s\S]*?color: "#F97316", icon: PenLine \}/);
  // The dock items and the tab order are still derived from the ONE list.
  assert.match(overlay, /export const STUDY_TAB_ORDER: DockTab\[\] = TABS\.map\(\(\{ key \}\) => key\);/);
  assert.match(overlay, /export const buildDockItems = \(tab: DockTab, hiddenTabs: DockTab\[\] = \[\]\): GlassDockItem\[\] =>\s*\n\s*TABS\.filter/);
  // Exactly one dock is rendered by the overlay, and the peek dock keeps
  // being the same component with the same builder — no Sketch-only dock.
  assert.equal(overlay.match(/<GlassDock\b/g)?.length, 1);
  assert.doesNotMatch(code(panel), /GlassDock|data-course-dock\b/);
});

test("the landscape dock floor grew with the dock, and nothing else about the deck changed", () => {
  // 8 plates x 38 + 7 gaps x 6 + 24 inline padding = 370 → 380.
  assert.match(motion, /export const SPLIT_DOCK_MIN_PX = 380;/);
  // The deck knows nothing about sketching: no tab-specific branch was added.
  assert.doesNotMatch(code(deck), /sketch/i);
});

// ---------------------------------------------------------------------------
// The Split Deck stays the source of truth for the split
// ---------------------------------------------------------------------------

test("the panel owns no geometry: no ratio, no window measuring, no second resize system", () => {
  const body = code(panel);
  assert.doesNotMatch(body, /ratio/i, "the split ratio belongs to the deck alone");
  assert.doesNotMatch(body, /window\.innerWidth|window\.innerHeight|visualViewport/);
  assert.doesNotMatch(body, /100vh|100vw|dvh/);
  // Excalidraw observes its own container, so the app adds no observer of
  // its own — the pane's flex box is the only sizing input.
  assert.doesNotMatch(body, /ResizeObserver/);
  // A positioned, flex-sized host with an absolutely filled editor: that is
  // what gives Excalidraw a resolved, non-zero width and height in BOTH
  // orientations without anybody computing a pixel.
  assert.match(panel, /className="relative min-h-0 w-full flex-1"/);
  assert.match(panel, /className="absolute inset-0" data-course-sketch-host/);
});

test("nothing remounts the editor except a genuine change of board", () => {
  // The ONE key, and what it is made of.
  assert.match(panel, /<Excalidraw\s+key=\{sceneKey\}/);
  assert.match(hook, /sceneKey: session\.scoped \? `\$\{session\.docId\}#\$\{generation\}` : "sketch-unscoped"/);
  // The forbidden keys, in every spelling.
  assert.doesNotMatch(code(panel), /key=\{[^}]*(?:ratio|width|height|size|orientation|activeTab|tab)\b[^}]*\}/i);
  // `initialData` is memoised on the scene identity, so a re-render cannot
  // hand the editor a new object either.
  assert.match(panel, /const initialData = useMemo\(\(\) => \{/);
  assert.match(panel, /\}, \[sceneKey\]\);/);
});

test("the Sketch body is mounted by the same StudyContent switch as every other tab", () => {
  assert.match(overlay, /\) : tab === "sketch" \? \(/);
  assert.match(overlay, /sketchPanel \?\? SKETCH_FALLBACK/);
  // The player owns the hook and hands the panel down ready-rendered — the
  // same ownership the mind map uses, which is what lets the scene outlive
  // the editor's unmount on a tab switch.
  assert.match(player, /const sketch = useCourseSketch\(\{/);
  assert.match(player, /moduleId: activeMindMapModuleId,/);
  assert.match(player, /sketchPanel=\{\(/);
});

test("the editor's chunk is lazy — a learner who never draws never downloads it", () => {
  assert.match(player, /const SketchPanel = lazy\(\(\) => import\("\.\/course\/SketchPanel"\)\);/);
  // …and the player's own module must not pull the editor in statically.
  assert.doesNotMatch(code(player), /from "@excalidraw\/excalidraw"/);
  assert.doesNotMatch(code(overlay), /@excalidraw\/excalidraw/);
  assert.match(viteConfig, /return "course-sketch";/);
});

// ---------------------------------------------------------------------------
// Pen, touch and the divider
// ---------------------------------------------------------------------------

test("touch handling is left to Excalidraw and the deck — nothing global is disabled", () => {
  assert.doesNotMatch(code(panel), /touch-action/, "no app-level touch-action override");
  assert.doesNotMatch(code(panel), /preventDefault|stopPropagation/, "the canvas's own gestures are not intercepted");
  // The divider keeps its own pointer capture; the panel never touches it.
  assert.doesNotMatch(code(panel), /pointerdown|onPointerDown|setPointerCapture/i);
  assert.match(deck, /setPointerCapture/);
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

test("the save state is a slim line, not a banner — and it never blocks drawing", () => {
  assert.match(panel, /data-course-sketch-status=\{status\}/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /Saving…/);
  assert.match(panel, /Saved/);
  assert.match(panel, /Offline draft/);
  // No overlay, no modal, no disabled surface while saving.
  assert.doesNotMatch(code(panel), /disabled=\{(?:status|saving)/i);
  assert.doesNotMatch(code(panel), /pointer-events-none[^"]*"\s*>\s*\{?\s*<Excalidraw/);
});

test("the hook writes the scene as a string and never a screenshot", () => {
  assert.match(hook, /import \{[\s\S]*?toFirestoreSketch,?[\s\S]*?\} from "\.\.\/\.\.\/utils\/sketchScene"/);
  assert.doesNotMatch(code(hook), /toBlob|toDataURL|exportToCanvas|exportToBlob|screenshot/i);
  assert.doesNotMatch(code(panel), /exportToCanvas|exportToBlob|toDataURL/);
  // Writes are debounced and flushed on the way out, never per event.
  assert.match(hook, /const DEFAULT_DEBOUNCE_MS = \d+;/);
  assert.match(hook, /const MAX_WAIT_MS = \d+;/);
  assert.match(hook, /window\.addEventListener\("pagehide", flushSession\);/);
  assert.match(hook, /document\.addEventListener\("visibilitychange", onVisibility\);/);
  assert.match(hook, /window\.addEventListener\("online", onOnline\);/);
});

test("Firestore rules give the new path owner-only access and validate the envelope", () => {
  const block = rules.slice(rules.indexOf("match /sketches/{sketchId}"));
  assert.match(block, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(block, /allow create, update: if isOwner\(uid\)/);
  // The id is RE-DERIVED from the path's uid, so a client-supplied uid can
  // never address someone else's board.
  assert.match(block, /sketchId == uid \+ '__' \+ request\.resource\.data\.productId \+ '__' \+ request\.resource\.data\.moduleId/);
  assert.match(block, /request\.resource\.data\.uid == uid/);
  // The scene is a bounded STRING, not a map (nested arrays are illegal).
  assert.match(block, /request\.resource\.data\.scene is string/);
  assert.match(block, /request\.resource\.data\.scene\.size\(\) <= 900000/);
  assert.match(block, /request\.resource\.data\.elementCount <= 1500/);
  // Privilege fields can never ride along on a sketch write.
  assert.match(block, /!request\.resource\.data\.keys\(\)\.hasAny\(\['role', 'status'/);
  // Nothing else was loosened: the existing owner-only blocks are intact.
  assert.match(rules, /match \/mindMaps\/\{mapId\} \{/);
  assert.match(rules, /match \/notes\/\{noteId\} \{/);
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

test("Excalidraw's fonts are self-hosted, so the offline build still renders text", () => {
  assert.match(assets, /window\.EXCALIDRAW_ASSET_PATH = EXCALIDRAW_ASSET_PATH;/);
  assert.match(assets, /export const EXCALIDRAW_ASSET_PATH = "\/excalidraw-assets\/";/);
  // The import order matters: the variable must exist before the editor's
  // font loader runs, so the asset module is imported FIRST.
  const assetImport = panel.indexOf('import "./excalidrawAssets"');
  const editorImport = panel.indexOf('from "@excalidraw/excalidraw"');
  assert.equal(assetImport > -1 && assetImport < editorImport, true);
  // Dev serves them from the package; the build copies them into dist.
  assert.match(viteConfig, /name: "excalidraw-assets"/);
  assert.match(viteConfig, /fileName: `excalidraw-assets\/fonts\/\$\{family\}\/\$\{name\}`/);
  assert.match(viteConfig, /EXCALIDRAW_SKIPPED_FONTS = new Set\(\["Xiaolai"\]\)/);
});
