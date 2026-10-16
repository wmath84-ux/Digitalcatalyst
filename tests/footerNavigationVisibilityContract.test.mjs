// tests/footerNavigationVisibilityContract.test.mjs
//
// THE OWNER'S FOOTER RULE, IN ONE FILE (2026-10-16):
//
//   "Ab tum footer navigation ka function update karo aur clear batao ki kab
//    kab yah nahin dikhega — yah tab nahin dikhega jab editor mode on hoga,
//    bas; baaki hamesha dikhe."
//
// Plus the half of the brief that lives in Settings:
//
//   "Do option add karo — 'Visible footer navigation always' aur 'Visible
//    footer navigation accordingly' — aur neeche ek chhota sa instruction line
//    English mein ki footer navigation kab kab nahin dikhega."
//
// The rule itself is `isFooterHiddenPage` in src/course/coursePanelSession.ts;
// the Settings choice is src/utils/footerNavigationVisibility.ts; the two
// footer homes are the parent-rendered Workspace pill (CoursePeekDock) and the
// Split Deck's in-flow dock (CourseOverlay). The runtime half of the same
// contract is proven in tests/courseStripNavigationRuntime.test.mjs (the dock
// really stays), tests/courseResourceLibrarySearchRuntime.test.mjs and
// tests/coursePlayerMusicPaneRuntime.test.mjs (the search page really takes
// the footer, the results page really gives it back — and really steps it away
// on a scroll down).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const SESSION = read("src/course/coursePanelSession.ts");
const PREFERENCE = read("src/utils/footerNavigationVisibility.ts");
const SETTINGS = read("src/settings/SettingsPage.tsx");
const SETTINGS_CSS = read("src/settings/settings.css");
const PEEK_DOCK = read("src/course/CoursePeekDock.tsx");
const OVERLAY = read("src/course/CourseOverlay.tsx");
const NOTES = read("src/course/NotesPanel.tsx");
const MIND_MAP = read("src/course/MindMapPanel.tsx");
const SKETCH = read("src/course/SketchPanel.tsx");
const LIBRARY = read("src/course/CourseResourceLibrary.tsx");
const MUSIC = read("src/course/MusicPanel.tsx");
const SEARCH = read("src/course/searchExperience.tsx");

/* ── 1 · the rule the owner dictated ─────────────────────────────────────── */

test("1 — the three editor tabs hide the footer in EDIT mode only", () => {
  // "Jab editor mode on hoga, bas" — the notes page writing, the mind map
  // drawing, the sketch drawing. Their read modes keep the footer.
  assert.match(SESSION, /case "notes":[\s\S]{0,160}?return state\.notesEditMode;/);
  assert.match(SESSION, /case "mindmap":[\s\S]{0,200}?return state\.mindMapEditMode;/);
  assert.match(SESSION, /case "sketch":[\s\S]{0,200}?return state\.sketchEditMode;/);
  // No editor hides the footer by merely being OPEN any more: the old
  // "note editor open" and "sketch tab is always immersive" rules are gone.
  assert.doesNotMatch(SESSION, /return state\.notesEditorOpen;/);
  assert.doesNotMatch(SESSION, /case "sketch":[\s\S]{0,200}?return true;/);
});

test("2 — every OTHER hidden page is one the owner named", () => {
  assert.match(SESSION, /case "brain":\s*\n?\s*return state\.brainView === "answer";/);
  assert.match(SESSION, /case "experiment":\s*\n?\s*return state\.experimentView === "viewer";/);
  assert.match(SESSION, /case "read":\s*\n?\s*return state\.readView === "reader";/);
  // Music: the LIBRARY page keeps the footer; the real player (audio or the
  // YouTube player) and the SEARCH page take it away.
  assert.match(
    SESSION,
    /case "music":[\s\S]{0,400}?state\.musicView === "player"[\s\S]{0,200}?state\.musicSearch === "page"[\s\S]{0,240}?state\.musicSearchScrolledAway/,
  );
  // The Resource Library (the Modules tab) wears the same search rule: its
  // nested search page hides the footer, a results page only while scrolled.
  assert.match(
    SESSION,
    /case "modules":[\s\S]{0,400}?state\.librarySearch === "page"[\s\S]{0,240}?state\.librarySearchScrolledAway/,
  );
  // Everything else — modules / paid / player / ai — is a library: the footer
  // is always there.
  assert.match(SESSION, /default:\s*\n?\s*\/\/[^\n]*\n\s*return false;/);
});

test("3 — the scroll half of the brief is a real, direction-aware rule", () => {
  // "Scroll down kare to hide ho jaye, wapas top par aate hi dikh jaye."
  assert.match(SEARCH, /export function nextScrollAwayHidden\(/);
  assert.match(SEARCH, /if \(top <= threshold\) return false;/);
  assert.match(SEARCH, /if \(top > previous\) return true;/);
  assert.match(SEARCH, /if \(top < previous\) return false;/);
  assert.match(SEARCH, /export function useScrollAwayHidden\(enabled: boolean\)/);
  // One read per frame, and the listener leaves with the results.
  assert.match(SEARCH, /scroller\.addEventListener\("scroll", onScroll, \{ passive: true \}\);/);
  assert.match(SEARCH, /scroller\.removeEventListener\("scroll", onScroll\);/);
  // Both search surfaces hand the hook their own scroll host and publish the
  // answer into the one session the footer reads.
  assert.match(LIBRARY, /useScrollAwayHidden\(searchSurfaceView === "results"\)/);
  assert.match(LIBRARY, /setSearchScrolledAway\("library", searchScrolledAway\)/);
  assert.match(MUSIC, /useScrollAwayHidden\(musicSearchView === "results"\)/);
  assert.match(MUSIC, /setSearchScrolledAway\("music", resultsScrolledAway\)/);
});

/* ── 4 · every page publishes the fact the rule reads ────────────────────── */

test("4 — the editors publish EDIT mode, not merely being open", () => {
  // Notes: writing only — a MASTER note open in its READ view keeps the footer.
  assert.match(NOTES, /const notesEditMode = editorOpen && !viewingMasterNote && !\(Boolean\(editingId\) && selfReadOnly\);/);
  // The MASTER viewer is read-only by construction (its own "Read only ·
  // Master" chip and a readOnly editor inside it): reading the teacher's note
  // is not edit mode, so it keeps the footer navigation.
  assert.match(NOTES, /data-course-master-note-viewer[\s\S]{0,2000}?data-master-note-readonly/);
  assert.match(NOTES, /setNotesEditMode\(notesEditMode\);/);
  // Mind map: the canvas must be in edit mode (a read-only MASTER map never is).
  assert.match(MIND_MAP, /setMindMapEditMode\(!libraryOpen && !readOnlyCanvas\);/);
  // Sketch: the panel's own one edit flag, both surfaces included.
  assert.match(SKETCH, /setSketchEditMode\(editing\);/);
  // The search surfaces publish their page and its results.
  assert.match(LIBRARY, /setSearchSurface\("library", searchSurfaceView\)/);
  assert.match(MUSIC, /setSearchSurface\("music", musicSearchView\)/);
  assert.match(MUSIC, /const musicSearchView = searchLoading \|\| showHistory \? "page" : searched \? "results" : "closed";/);
  // …and a search surface left behind can never strand a hidden footer.
  assert.match(LIBRARY, /useEffect\(\(\) => \(\) => setSearchSurface\("library", "closed"\), \[\]\);/);
  assert.match(MUSIC, /useEffect\(\(\) => \(\) => setSearchSurface\("music", "closed"\), \[\]\);/);
});

/* ── 5 · the Settings choice, and the instruction line under it ──────────── */

test("5 — Settings offers exactly the owner's two options", () => {
  assert.ok(SETTINGS.includes(">Visible footer navigation always<"));
  assert.ok(SETTINGS.includes(">Visible footer navigation accordingly<"));
  assert.match(SETTINGS, /data-footer-visibility="always"/);
  assert.match(SETTINGS, /data-footer-visibility="accordingly"/);
  assert.match(SETTINGS, /onClick=\{\(\) => setFooterNavigationVisibility\("always"\)\}/);
  assert.match(SETTINGS, /onClick=\{\(\) => setFooterNavigationVisibility\("accordingly"\)\}/);
  assert.match(SETTINGS, /const footerNavigationVisibility = useFooterNavigationVisibility\(\);/);
  // The pair is a radio group of its own, inside the Footer navigation section.
  assert.match(SETTINGS, /data-footer-visibility-preference/);
  assert.match(SETTINGS, /role="radiogroup"\s*\n\s*aria-labelledby="settings-navigation-visibility"/);
  // …and it is styled by the same sheet as the styles above (no new palette).
  assert.match(SETTINGS_CSS, /\.settings-navigation-options--visibility \{/);
  assert.match(SETTINGS_CSS, /\.settings-navigation-visibility__note \{/);
});

test("6 — the English instruction line names every time the footer is not shown", () => {
  assert.match(SETTINGS, /<p className="settings-navigation-visibility__note" data-footer-visibility-note>/);
  assert.match(SETTINGS, /\{FOOTER_NAVIGATION_VISIBILITY_NOTE\}/);
  assert.match(PREFERENCE, /export const FOOTER_NAVIGATION_VISIBILITY_NOTE =/);
  // The three editors' edit mode, the answer deck, the live experiment, the
  // PDF/annotations reader, the music player, both search pages, the scroll
  // behaviour — and the keyboard, so the promise has no silent exception.
  for (const phrase of [
    "note, mind map or sketch is open in edit mode",
    "Brain answer deck",
    "live experiment",
    "PDF or annotations",
    "Music player",
    "Resource Library or Music search page",
    "scroll down",
    "on-screen keyboard",
  ]) {
    assert.ok(PREFERENCE.includes(phrase), `the instruction line names: ${phrase}`);
  }
});

/* ── 7 · "always" really overrules the page rule ─────────────────────────── */

test("7 — both footer homes take the Settings override", () => {
  for (const home of [PEEK_DOCK, OVERLAY]) {
    assert.match(home, /const pageRuleHidesFooter = useFooterHiddenPage\(tab\)/);
    assert.match(home, /const immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways\(\)/);
    assert.match(home, /useFooterNavigationAlways/);
  }
  // The keyboard rule is untouched: it is a physical overlap, not a page rule
  // — and the instruction line says so.
  assert.match(PEEK_DOCK, /if \(keyboardVisible \|\| immersivePage\) return null/);
  assert.match(OVERLAY, /\$\{keyboardVisible \|\| immersivePage \? "hidden" : ""\}/);
});

/* ── 8 · the store itself ────────────────────────────────────────────────── */

test("8 — the default is today's behaviour, and the choice is per device", () => {
  assert.match(PREFERENCE, /export type FooterNavigationVisibility = "always" \| "accordingly";/);
  assert.match(PREFERENCE, /const STORAGE_KEY = "dc-footer-navigation-visibility";/);
  assert.match(PREFERENCE, /const CHANGE_EVENT = "dc:footer-navigation-visibility-change";/);
  assert.match(PREFERENCE, /const DEFAULT_VISIBILITY: FooterNavigationVisibility = "accordingly";/);
  // Mounted footers hear the choice without a reload.
  assert.match(PREFERENCE, /window\.dispatchEvent\(new window\.Event\(CHANGE_EVENT\)\);/);
  // Nothing is re-seated at boot: the style store owns that one migration.
  assert.doesNotMatch(PREFERENCE, /ensureDefault|MIGRATION_KEY/);
});

const loadPreferenceModule = () => {
  const code = ts.transpileModule(PREFERENCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => {
    if (id === "react") return { useSyncExternalStore: () => "accordingly" };
    throw new Error(`unexpected import: ${id}`);
  }, module, module.exports);
  return { preference: module.exports, store, events };
};

test("9 — a fresh browser reads \"accordingly\"; the pick sticks and is announced", () => {
  const { preference, store, events } = loadPreferenceModule();

  assert.equal(preference.getFooterNavigationVisibility(), "accordingly", "today's behaviour is the default");

  preference.setFooterNavigationVisibility("always");
  assert.equal(preference.getFooterNavigationVisibility(), "always");
  assert.equal(store.get("dc-footer-navigation-visibility"), "always");
  assert.deepEqual(events, ["dc:footer-navigation-visibility-change"], "mounted footers are told at once");

  // Anything unexpected — a hand-edited value, a foreign origin — reads the
  // default rather than hiding the footer behind the learner's back.
  store.set("dc-footer-navigation-visibility", "sometimes");
  assert.equal(preference.getFooterNavigationVisibility(), "accordingly");
});

test("10 — storage that refuses writes never breaks the footer", () => {
  const { preference } = loadPreferenceModule();
  globalThis.window.localStorage = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };

  assert.equal(preference.getFooterNavigationVisibility(), "accordingly");
  assert.doesNotThrow(() => preference.setFooterNavigationVisibility("always"));
});
