// tests/workModeFoundationContract.test.mjs
//
// Work mode's phase-0/1 contract: immersive route + launch choice, the exact
// picked footer design, and the Course Player's real SplitDeck extended only by
// optional Work-only props.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const MAIN = read("src/main.tsx");
const WORK_APP = read("src/work/WorkApp.tsx");
const WORK_DECK = read("src/work/WorkDeck.tsx");
const WORK_PAGES = read("src/work/workPages.ts");
const WORK_PREFS = read("src/work/storage/workPrefs.ts");
const LAUNCH = read("src/work/WorkLaunchChooser.tsx");
const FOOTER = read("src/work/WorkFooterNav.tsx");
const FOOTER_CSS = read("src/work/work-footer-nav.css");
const SPLIT = read("src/course/studyPanels.tsx");
const SPLIT_MOTION = read("src/course/splitMotion.ts");
const DESKTOP = read("src/components/DesktopShell.tsx");
const YOUTUBE = read("src/components/YoutubeFooterNav.tsx");
const UIVERSE = read("src/components/UiverseFooterNav.tsx");
const SETTINGS = read("src/settings/SettingsPage.tsx");

test("Work is an immersive lazy route and the first-choice overlay only owns default launches", () => {
  assert.match(MAIN, /const WORK_HASH = "#\/work"/);
  assert.match(MAIN, /const WorkApp = lazyRoute\(\(\) => import\("\.\/work\/WorkApp"\)\)/);
  assert.match(MAIN, /if \(hash\.startsWith\(WORK_HASH\)\) return WorkApp/);
  assert.match(MAIN, /if \(hash\.startsWith\(WORK_HASH\)\) return <WorkApp \/>/);
  assert.match(MAIN, /\|\| hash\.startsWith\(WORK_HASH\)/, "Work must bypass the desktop Home shell");
  assert.match(MAIN, /<WorkLaunchChooser \/>/);
  assert.match(LAUNCH, /hash === "#\/home"/);
  assert.match(LAUNCH, /const asking = askPending && choice === "ask"/, "only the `ask` choice paints the card");
  assert.match(LAUNCH, /if \(!asking\) return null/, "the card leaves the tree when the question is answered");
  assert.match(LAUNCH, /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(LAUNCH, /setWorkLaunchChoice\(destination\)/);

  // The website card offers THREE options; the installed PWA / APK keeps two,
  // because `RootPage` rewrites a landing boot to #/home there — the option is
  // offered exactly where it is a real destination, never as a dead end.
  assert.match(LAUNCH, /const landingIsReachable = \(\): boolean =>/);
  assert.match(LAUNCH, /!isInstalledMobilePwa\(\) && !isNativeApp\(\)/);
  assert.match(LAUNCH, /dc-work-launch-choice dc-work-launch-choice--landing/);
  assert.match(LAUNCH, /data-work-launch-choices=\{showLandingChoice \? "3" : "2"\}/);
  assert.match(LAUNCH, /if \(choice === "landing"\) return LANDING_HASH;/);
});

test("answering the startup card closes it through real state (never a cosmetic hide)", () => {
  // Owner report 2026-10-15: on the APK / installed PWA the app boots on an
  // empty hash that RootPage normalises to #/home with replaceState — no
  // `hashchange` is raised — so a ref-only "resolved" flag left the card and
  // its full-screen backdrop mounted over Home, swallowing every tap on it.
  assert.match(LAUNCH, /const \[answeredForThisBoot, setAnsweredForThisBoot\] = useState\(false\)/);
  assert.doesNotMatch(LAUNCH, /resolvedForThisBoot/, "the once-per-boot answer must be state, not a ref");
  // The answer is recorded BEFORE the destination is routed to, so the answer
  // itself unblocks Home even when the hash already IS #/home.
  assert.match(LAUNCH, /const setDestination = \(destination: "home" \| "work" \| "landing"\) => \{[\s\S]*?setAnsweredForThisBoot\(true\);[\s\S]*?launchTarget\(destination\)/);
  assert.match(LAUNCH, /if \(window\.location\.hash !== target\) window\.location\.hash = target;/);
  // The launch opening is the other half of the startup pair: it must be
  // released through its single owner, and only while it is actually visible —
  // a tap-only / skipped boot stays untouched.
  assert.match(LAUNCH, /function dismissOpeningOverlay\(\): void \{[\s\S]*?attachOpeningSplash\(\)[\s\S]*?isOpeningVisible\(opening\.state\)[\s\S]*?opening\.dismiss\(\)/);
  assert.match(LAUNCH, /dismissOpeningOverlay\(\);[\s\S]*?if \(remember\) setWorkLaunchChoice\(destination\)/);
  // …and the Settings answers ("Always open Home" / "Always open Work") hand
  // over the same way on the boot that uses them.
  assert.match(LAUNCH, /useEffect\(\(\) => \{\s*if \(choice === "ask" \|\| !askPending\) return;[\s\S]*?dismissOpeningOverlay\(\);/);
});

test("launch, theme, last-page and history preferences are defensive device storage only", () => {
  for (const key of ["dc.work.launch.v1", "dc.work.theme.v1", "dc.work.lastPage.v1", "dc.work.history.v1"]) {
    assert.ok(WORK_PREFS.includes(key), `missing device preference ${key}`);
  }
  assert.match(WORK_PREFS, /export type WorkLaunchChoice = "ask" \| "home" \| "work" \| "landing"/);
  assert.match(WORK_PREFS, /export type WorkTheme = "light" \| "dark"/);
  assert.match(WORK_PREFS, /localStorage\.getItem/);
  assert.match(WORK_PREFS, /localStorage\.setItem/);
  assert.match(WORK_PREFS, /useSyncExternalStore/);
  assert.match(SETTINGS, /Ask every time/);
  assert.match(SETTINGS, /Always open Home/);
  assert.match(SETTINGS, /Always open Work/);
  assert.match(SETTINGS, /Always open Landing page/);
  assert.match(SETTINGS, /On this device/);

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(ROOT, "src/work"));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /firebase\/firestore|from ["'][^"']*firebase["']|\bsetDoc\s*\(|\bonSnapshot\s*\(|\bapiFetch\s*\(/, `${path.relative(ROOT, file)} must not write to the cloud`);
  }
});

test("the Work footer preserves great-badger-21's geometry, motion and measured-footer hooks", () => {
  assert.match(FOOTER, /data-work-footer-nav/);
  assert.match(FOOTER, /data-site-footer-nav/);
  assert.match(FOOTER, /data-site-footer=""/);
  assert.match(FOOTER, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(FOOTER_CSS, /height:\s*var\(--work-nav-h, 60px\)/);
  assert.match(FOOTER_CSS, /border-radius:\s*40px/);
  assert.match(FOOTER_CSS, /0 10px 15px rgba\(0, 0, 0, 0\.041\)/);
  assert.match(FOOTER_CSS, /opacity:\s*0\.8/);
  assert.match(FOOTER_CSS, /translateY\(-4px\)/);
  assert.match(FOOTER_CSS, /transition-duration:\s*0\.1s/);
  assert.match(FOOTER_CSS, /padding:\s*13px 12px/);
  assert.match(FOOTER_CSS, /prefers-reduced-motion/);
  for (const destination of ["myday", "notes", "mindmap", "sketch", "ai", "revision"]) {
    assert.ok(WORK_PAGES.includes(`id: "${destination}"`), `missing Work destination ${destination}`);
  }
  assert.match(WORK_APP, /position="flow"/);
  assert.match(WORK_APP, /data-work-shell/);
});

test("Work respects reduced-motion preferences and all device safe-area edges", () => {
  const shellCss = read("src/work/work-shell.css");
  assert.match(WORK_APP, /<MotionConfig reducedMotion="user">/);
  assert.match(shellCss, /padding-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(shellCss, /padding-inline: env\(safe-area-inset-left, 0px\) env\(safe-area-inset-right, 0px\)/);
  assert.match(FOOTER_CSS, /env\(safe-area-inset-bottom, 0px\)/);
});

test("Work uses the real SplitDeck with a 100% bottom-page rest state; course defaults stay optional and unchanged", () => {
  assert.match(WORK_DECK, /restRatio=\{100\}/);
  assert.match(WORK_DECK, /fullRange/);
  assert.match(WORK_DECK, /railAtEdge=\{false\}/);
  assert.match(WORK_DECK, /grabInset=\{26\}/);
  assert.match(WORK_DECK, /courseId="work"/);
  assert.match(WORK_DECK, /onSplitStart=\{showPreviousPage\}/);
  assert.match(WORK_DECK, /renderExtraPane=\{renderExtraPane\}/);
  assert.match(SPLIT, /restRatio\?: number/);
  assert.match(SPLIT, /fullRange\?: boolean/);
  assert.match(SPLIT, /railAtEdge\?: boolean/);
  assert.match(SPLIT, /grabInset\?: number/);
  assert.match(SPLIT, /onSplitStart\?: \(\) => void/);
  assert.match(SPLIT_MOTION, /export const PARK_THRESHOLD = 6/);
  assert.match(SPLIT_MOTION, /maximum: number = SPLIT_MAX/);
  assert.match(DESKTOP, /data-work-mode-entry/);
  assert.match(DESKTOP, /handleNavigate\("#\/work"\)/);
  assert.match(YOUTUBE, /label: "Work Mode", route: "#\/work"/);
  assert.match(UIVERSE, /label: "Work Mode", route: "#\/work"/);
});

/* The Work constants and route ids are deliberately simple and parseable. */
test("all Work deep links restore one of the registered page ids", () => {
  assert.match(WORK_PAGES, /export type WorkPageId = "myday" \| "notes" \| "mindmap" \| "sketch" \| "ai" \| "revision"/);
  assert.match(WORK_PAGES, /workPageFromHash/);
  assert.match(WORK_PAGES, /workHashFor/);
  assert.match(WORK_APP, /getWorkLastPage\(\)/);
  assert.match(WORK_APP, /pushWorkHistory\(next\)/);
});

/* A small runtime test for the safe local store; imports only React + the
   registry's pure id helpers, no browser framework or Firebase. */
test("Work launch and theme preferences normalize malformed values and persist locally", () => {
  const output = ts.transpileModule(WORK_PREFS, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const values = new Map();
  const listeners = [];
  const fakeWindow = {
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent: (event) => { listeners.push(event.type); return true; },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const previousWindow = globalThis.window;
  globalThis.window = fakeWindow;
  const module = { exports: {} };
  const validPages = ["myday", "notes", "mindmap", "sketch", "ai", "revision"];
  new Function("require", "module", "exports", output)((id) => {
    if (id === "react") return { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() };
    if (id === "../workPages") return {
      WORK_PAGE_ORDER: validPages,
      isWorkPageId: (value) => validPages.includes(value),
    };
    throw new Error(`unexpected import: ${id}`);
  }, module, module.exports);
  const prefs = module.exports;

  try {
    assert.equal(prefs.getWorkLaunchChoice(), "ask");
    assert.equal(prefs.getWorkTheme(), "light");
    assert.equal(prefs.getWorkLastPage(), "myday");
    prefs.setWorkLaunchChoice("work");
    prefs.setWorkTheme("dark");
    prefs.setWorkLastPage("mindmap");
    assert.equal(prefs.getWorkLaunchChoice(), "work");
    assert.equal(prefs.getWorkTheme(), "dark");
    assert.equal(prefs.getWorkLastPage(), "mindmap");
    prefs.setWorkLaunchChoice("bad-value");
    prefs.setWorkTheme("sepia");
    assert.equal(prefs.getWorkLaunchChoice(), "ask");
    assert.equal(prefs.getWorkTheme(), "light");
    assert.ok(listeners.length >= 3, "preference updates notify mounted UI");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
