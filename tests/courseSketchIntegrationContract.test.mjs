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
//   · the chunk is lazy, the fonts are self-hosted, the rules are owner-only;
//   · the editor build in package.json is the one that HAS the sticky note
//     tool (the colourful "card" the toolbar was missing), and no UIOptions
//     switch in this repo can hide it;
//   · the canvas colour is a control on the panel's own chrome, never a second
//     canvas or a second rendering path, and its choice is persisted.

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
  assert.match(overlay, /export type DockTab =[^;]*\| "sketch";/);
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

// ---------------------------------------------------------------------------
// The editor build itself — the toolbar tool that was missing
// ---------------------------------------------------------------------------

test("the editor build in package.json is the one that carries the sticky note tool", () => {
  // Sticky notes (the colourful card tool, `N`, a native `stickynote` element)
  // are live on excalidraw.com but are NOT in the latest tagged release —
  // 0.18.1 has no stickynote code at all, which is exactly why the toolbar had
  // no such button here. The dependency is pinned to the exact `next` build
  // that carries it; move to the next tagged release when one ships.
  const version = pkg.dependencies?.["@excalidraw/excalidraw"];
  assert.equal(typeof version, "string");
  assert.notEqual(version, "0.18.1", "the tagged release has no sticky notes");
  assert.match(version, /^0\.18\.0-[0-9a-f]{7}$/, "a nightly, pinned EXACTLY (nightlies are not semver-ordered)");

  // …and the installed tree proves it: the element type, its own colour
  // domain, and its toolbar label are all in the shipped bundle. Skipped (not
  // failed) when the tree is not installed, e.g. a rules-only checkout.
  const bundle = path.join(ROOT, "node_modules/@excalidraw/excalidraw/dist/prod/index.js");
  const locale = path.join(ROOT, "node_modules/@excalidraw/excalidraw/dist/prod/chunk-FLFP27SU.js");
  if (fs.existsSync(bundle)) {
    const editor = fs.readFileSync(bundle, "utf8");
    assert.match(editor, /stickynote/, "the sticky note element type is in the bundle");
    assert.match(editor, /currentItemStickynoteBackgroundColor/, "…with its own colour domain");
    if (fs.existsSync(locale)) {
      assert.match(fs.readFileSync(locale, "utf8"), /stickynote:"Sticky note"/, "…and its toolbar label");
    }
  }

  // Nothing here hides a tool: no `UIOptions.tools`, no headless canvas, no
  // read-only mode — in either file that renders the editor.
  for (const source of [panel, read("src/course/SketchCanvasControls.tsx")]) {
    assert.doesNotMatch(code(source), /UIOptions/);
    assert.doesNotMatch(code(source), /viewModeEnabled=\{true\}|zenModeEnabled=\{true\}/);
    assert.doesNotMatch(code(source), /ui=\{?false/);
  }
});

// ---------------------------------------------------------------------------
// The canvas colour: white, dark, and a full-RGB pencil
// ---------------------------------------------------------------------------

const controls = read("src/course/SketchCanvasControls.tsx");

test("the canvas control is one row of the panel's own chrome — not a second editor", () => {
  // The panel hosts it in the save line…
  assert.match(panel, /<SketchCanvasControls\b/);
  assert.match(panel, /import SketchCanvasControls from "\.\/SketchCanvasControls"/);
  // …and the control is a control: no canvas of its own, no rendering path,
  // no gesture interception (the editor's pointer handling stays untouched).
  const body = code(controls);
  assert.doesNotMatch(body, /<canvas/i, "the control never draws a canvas");
  assert.doesNotMatch(body, /touch-action|preventDefault|stopPropagation|pointerdown|setPointerCapture/i);
  assert.doesNotMatch(body, /ResizeObserver|requestAnimationFrame/);
  assert.doesNotMatch(body, /ratio/i, "the split still belongs to the deck alone");
});

test("White and Dark are one click, and the pencil opens a full-RGB picker", () => {
  const canvasModel = read("utils/sketchCanvas.js");
  // The presets, including the white canvas that was asked for, live in the
  // model — with the dark default unchanged.
  assert.match(canvasModel, /\{ id: "white", label: "White", color: "#ffffff" \}/);
  assert.match(canvasModel, /\{ id: "dark", label: "Dark", color: "#121212" \}/);
  assert.match(canvasModel, /SKETCH_CANVAS_DEFAULT = \{ color: "#121212", theme: SKETCH_THEME_DARK \}/);
  // The row paints the presets from that one list…
  assert.match(controls, /SKETCH_CANVAS_PRESETS\.filter/);
  assert.match(controls, /data-canvas-quick=\{preset\.id\}/);
  assert.match(controls, /data-canvas-preset=\{preset\.id\}/);
  // …and the pencil icon is the way into the custom colour.
  assert.match(controls, /import \{ Pencil \} from "lucide-react"/);
  assert.match(controls, /data-course-sketch-canvas-pencil/);
  assert.match(controls, /aria-label="Custom canvas colour, full RGB"/);
  assert.match(controls, /data-course-sketch-canvas-picker/);
  // Full RGB: a slider AND a spinner per channel, plus a hex field.
  assert.equal((controls.match(/type="range"/g) || []).length, 1, "one channel row component, reused");
  assert.match(controls, /channel: "r"/);
  assert.match(controls, /data-course-sketch-canvas-rgb/);
  assert.match(controls, /data-canvas-hex/);
  assert.match(controls, /data-canvas-preview/);
});

test("a colour is applied through Excalidraw's own appState — never by us painting", () => {
  // The pair Excalidraw needs, written through its API…
  assert.match(panel, /onExcalidrawAPI=\{handleApi\}/);
  assert.match(
    panel,
    /editor\.updateScene\(\{ appState: \{ theme: value\.theme, viewBackgroundColor: value\.sceneColor \} \}\)/,
  );
  // …where the pair comes from the model, so the canvas RENDERS the pick.
  assert.match(panel, /sketchCanvasAppState\(color\)/);
  assert.match(panel, /sketchCanvasFromAppState\(appState\)/);
  // No exporter, no snapshot, no image: the colour is appState, not pixels.
  assert.doesNotMatch(code(panel), /exportToCanvas|exportToBlob|toDataURL/);
  assert.doesNotMatch(code(controls), /exportToCanvas|exportToBlob|toDataURL/);
});

test("the learner's canvas colour is remembered — per board, and per learner", () => {
  // PER BOARD: the scene's own appState already carries both keys (the
  // whitelist lives in the scene model)…
  const sceneModel = read("utils/sketchScene.js");
  assert.match(sceneModel, /"viewBackgroundColor"/);
  assert.match(sceneModel, /"theme"/);
  // …even when the board holds no elements at all: the hook's change queue
  // watches elements, so a colour announces itself explicitly.
  assert.match(hook, /markSceneChanged: \(\) => void;/);
  assert.match(hook, /scope\.revision \+= 1;\s*\n\s*scope\.dirty = true;\s*\n\s*scheduleSave\(scope\);/);
  assert.match(panel, /markSceneChanged\?\.\(\)/);
  assert.match(player, /markSceneChanged=\{sketch\.markSceneChanged\}/);

  // PER LEARNER: a small localStorage preference, applied by the panel to any
  // board that has never chosen a colour of its own.
  const canvasModel = read("utils/sketchCanvas.js");
  assert.match(canvasModel, /SKETCH_CANVAS_PREF_KEY = "dc\.sketchCanvas\.v1"/);
  assert.match(canvasModel, /export const sketchCanvasPrefKey/);
  assert.match(panel, /readSketchCanvasPreference\(uid\)/);
  assert.match(panel, /writeSketchCanvasPreference\(uidText, color\)/);
  assert.match(player, /uid=\{user\?\.id\}/);
  // The board's own colour wins over the preference; only a board that never
  // chose one inherits it.
  assert.match(panel, /sketchCanvasFromAppState\(saved\) \? null : openingCanvas\(saved, uidText\)/);
});

test("the canvas choice rides the SAME Firestore document, and the rules still hold", () => {
  // No new collection, no new field, no rules change: the colour is inside the
  // scene string the sketch tab already writes.
  const rules = read("firestore.rules");
  assert.doesNotMatch(rules, /viewBackgroundColor|canvasColor|canvasTheme/);
  assert.match(rules, /match \/sketches\/\{sketchId\} \{/);
  const sketchBlock = rules.slice(rules.indexOf("match /sketches/{sketchId}"));
  assert.match(sketchBlock, /request\.resource\.data\.scene is string/);
  // …and the model that produces that string keeps both keys.
  const sceneModel = read("utils/sketchScene.js");
  assert.match(sceneModel, /const APP_STATE_KEYS = \[/);
});
