// The Course Player AI page (src/lumen) opens in its ONE documented theme
// default for a learner who has never saved a choice for it. A saved choice
// always wins, survives navigation and refresh, and never leaks into other
// Course Player pages.
//
// ── Which default? ──────────────────────────────────────────────────────
// This file used to pin "dark" — including a fixture that RE-TYPED the app's
// own call site. That mirror is exactly what broke: the page moved to Light
// ("AI follows the shared light-only appearance policy" in src/lumen/App.tsx)
// and the mirrored fixture kept testing a Dark page that no longer existed, so
// the runtime tests passed while asserting the wrong thing.
//
// So the default is now READ from the app, never mirrored here. Whatever the
// product decides, these tests check the contract that actually matters:
//   · a learner with no saved choice gets the documented default,
//   · nothing is written to storage on startup (the default is a fallback,
//     not a stored choice — a later explicit pick must still be possible),
//   · an explicit pick — either one — is persisted and survives remount,
//   · picks never leak between learners on the same device.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── The app's own call site is the single source of the default ────────────
const lumenSource = read("src/lumen/App.tsx");
const call = lumenSource.match(/useCourseTheme\(\s*"ai",\s*learnerUid\s*(?:,\s*"(dark|light)")?\s*\)/);
assert.ok(call, 'src/lumen/App.tsx must ask the shared theme layer: useCourseTheme("ai", learnerUid, …)');
// No third argument = the layer's own fallback, which is "light"
// (see loadCourseTheme in src/course/playerPreferences.tsx).
const AI_DEFAULT = call[1] ?? "light";
// The palette the page can never wear under the light-only policy.
const OTHER = AI_DEFAULT === "dark" ? "light" : "dark";

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useCourseTheme } from ${JSON.stringify(path.join(ROOT, "src/course/playerPreferences.tsx"))};

// Read from src/lumen/App.tsx at build time — never re-typed here.
function AiPage({ uid }) {
  const ctl = useCourseTheme("ai", uid, ${JSON.stringify(AI_DEFAULT)});
  return (
    <div className={ctl.theme === "dark" ? "lumen-root lumen-dark" : "lumen-root"} data-lumen-theme={ctl.theme}>
      <button type="button" data-lumen-toggle onClick={ctl.toggleTheme}>toggle</button>
    </div>
  );
}
export function mount(host, props) {
  const root = createRoot(host);
  act(() => root.render(<AiPage {...props} />));
  return { unmount: () => act(() => root.unmount()) }
}
export { act }
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "lumen-ai-dark-default-runtime");
function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [entry, "--bundle", "--format=cjs", "--platform=node", "--jsx=automatic", "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`, `--outfile=${out}`, "--log-level=error"],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}
const bundle = buildFixture();

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { mount, act } = require(bundle);
const KEY = (featureOrUid) =>
  featureOrUid && THEMED_FEATURES.includes(featureOrUid)
    ? `dc.courseTheme.${featureOrUid}.learner-x`
    : featureOrUid
      ? `dc.courseTheme.ai.${featureOrUid}`
      : "dc.courseTheme.ai";
const THEMED_FEATURES = ["player", "notes", "mindMap", "read", "ai", "sketch"];

// The real preference module, transpiled once — so the normalization check
// below runs the shipped code, not a copy of it.
let prefsModule = null;
function loadPrefsModule() {
  if (prefsModule) return prefsModule;
  const ts = require("typescript");
  const entry = path.join(CACHE, "playerPreferences.cjs");
  const code = ts.transpileModule(read("src/course/playerPreferences.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.writeFileSync(entry, code);
  prefsModule = entry;
  return prefsModule;
}
const hosts = [];
function fresh(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  hosts.push(host);
  const handle = mount(host, props);
  return { host, ...handle };
}
const themeOf = (host) => host.querySelector("[data-lumen-theme]").getAttribute("data-lumen-theme");
const isDarkClass = (host) => host.querySelector(".lumen-root").classList.contains("lumen-dark");
const toggle = (host) => act(() => host.querySelector("[data-lumen-toggle]").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));

after(() => {
  for (const host of hosts) host.remove();
  dom.window.close();
});

test(`no saved AI preference → the AI page opens in its default (${AI_DEFAULT}), and nothing is written on startup`, () => {
  window.localStorage.clear();
  const p = fresh({ uid: "learner-a" });
  assert.equal(themeOf(p.host), AI_DEFAULT);
  // The dark PALETTE only rides on the dark class — a default of light must
  // not silently leave the root wearing .lumen-dark.
  assert.equal(isDarkClass(p.host), AI_DEFAULT === "dark");
  assert.equal(window.localStorage.getItem(KEY("learner-a")), null, "the default is a read fallback, not a stored choice");
  p.unmount();
});

test("no uid yet (signed-out or still resolving) also opens in the same default", () => {
  window.localStorage.clear();
  const p = fresh({ uid: null });
  assert.equal(themeOf(p.host), AI_DEFAULT);
  p.unmount();
});

test(`a ${OTHER} pick cannot reach the AI page: the toggle is normalized, not honoured`, () => {
  // Light-only policy: the shared layer normalizes a dark pick instead of
  // applying it, so the AI page can never render the dark palette — and the
  // toggle must not leave the root half-wearing .lumen-dark either.
  window.localStorage.clear();
  window.localStorage.setItem(KEY("learner-b"), OTHER);
  const p = fresh({ uid: "learner-b" });
  assert.equal(themeOf(p.host), AI_DEFAULT, "the stored dark pick is ignored");
  assert.equal(isDarkClass(p.host), AI_DEFAULT === "dark", "no dark class, no dark palette");
  toggle(p.host);
  assert.equal(themeOf(p.host), AI_DEFAULT, "toggling stays on the light-only palette");
  p.unmount();
});

test(`an explicit ${AI_DEFAULT} choice is kept on every return`, () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("learner-c"), AI_DEFAULT);
  const p = fresh({ uid: "learner-c" });
  assert.equal(themeOf(p.host), AI_DEFAULT);
  p.unmount();
});

test("choices are per learner: one learner's pick never changes another's default", () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("learner-d"), OTHER);
  const other = fresh({ uid: "learner-e" });
  assert.equal(themeOf(other.host), AI_DEFAULT);
  other.unmount();
});

test("the AI page reads its fallback from the page default, and the light-only policy is documented", () => {
  assert.match(
    lumenSource,
    new RegExp(`useCourseTheme\\(\\s*"ai",\\s*learnerUid\\s*,\\s*"${AI_DEFAULT}"\\s*\\)`),
    "the page states its own default explicitly instead of relying on the layer's fallback",
  );
  // Whatever the default is, it must be written down where a reader will find
  // it — the page's appearance has already been flipped once by a stray value.
  assert.match(lumenSource, /shared (light-only|light|dark)[\s\S]{0,80}appearance policy/i);
});

test("the theme layer normalizes legacy picks for every feature, and leaves non-theme prefs alone", () => {
  // src/lib/theme.ts: "Light-only application theme. Legacy dark preferences
  // and callers are normalized." This is the whole contract: no feature can
  // read or store dark, while MASTER/SELF (a different kind of preference)
  // keeps working normally.
  const prefs = read("src/course/playerPreferences.tsx");
  assert.match(
    prefs,
    /export const loadCourseTheme = \([\s\S]*?\): CoursePlayerTheme => \{\s*return "light";\s*\};/,
    "loadCourseTheme normalizes any stored pick to light",
  );
  assert.match(prefs, /safeSet\(prefKey\("courseTheme", feature, uid\), "light"\)/, "persistCourseTheme never writes dark");
  // Runtime proof, per feature, through the REAL module.
  const loaded = require(loadPrefsModule());
  window.localStorage.clear();
  for (const feature of ["player", "notes", "mindMap", "read", "ai", "sketch"]) {
    window.localStorage.setItem(KEY(feature), "dark");
    assert.equal(loaded.loadCourseTheme(feature, "learner-x", "dark"), "light", `${feature}: a stored dark pick is ignored`);
    loaded.persistCourseTheme(feature, "dark", "learner-x");
    assert.equal(window.localStorage.getItem(KEY(feature)), "light", `${feature}: dark is never written`);
  }
  loaded.persistMasterSelfMode("notes", "self", "learner-x");
  assert.equal(loaded.loadMasterSelfMode("notes", "learner-x"), "self", "master/self is not swept up by the theme policy");
});

test("other Course Player pages keep their own intended defaults", () => {
  assert.match(read("src/course/MindMapPanel.tsx"), /useCourseTheme\("mindMap", uid \?\? null, "light"\)/);
  assert.match(read("src/course/NotesPanel.tsx"), /useCourseTheme\("notes", uid, "light"\)/);
  assert.match(read("src/course/ReadLibraryPanel.tsx"), /useCourseTheme\("read", user\?\.id \?\? null\)/);
  assert.match(read("src/CoursePlayerApp.tsx"), /useCourseTheme\("player", user\?\.id \?\? null\)/);
});

test("no light-only hard-coded colour is left in the AI page (white-on-white / dark-on-dark guard)", () => {
  const files = [
    "src/lumen/App.tsx",
    "src/lumen/components/Sidebar.tsx",
    "src/lumen/components/Header.tsx",
    "src/lumen/components/Composer.tsx",
    "src/lumen/components/CoursePlayer.tsx",
    "src/lumen/components/QuizCard.tsx",
    "src/lumen/index.css",
  ];
  const all = files.map(read).join("\n");
  assert.doesNotMatch(all, /bg-\[#f2f1eb\]/, "the sidebar uses the --side token (dark in dark mode)");
  assert.doesNotMatch(all, /text-\[#b4392f\]|text-\[#2f7d54\]/, "status text uses --err-text / --ok-text");
  assert.doesNotMatch(all, /bg-\[--ink\] text-white|bg-\[--ink\][^"]*text-white/, "a --ink fill takes --on-ink text");
  assert.doesNotMatch(all, /color:\s*#fff;\s*\n\s*cursor: pointer;\s*\n\s*opacity: 0;/, "attach remove uses --on-ink");
  assert.doesNotMatch(all, /backgroundColor: "#f7f6f2",/, "screenshot background follows the theme");
  // Every token the guard above protects must exist in BOTH palettes — a token
  // defined only in light is the same bug as the hard-coded value it replaced.
  const css = read("src/lumen/index.css");
  for (const token of ["--side", "--err-text", "--ok-text", "--on-ink"]) {
    assert.ok(css.includes(`${token}:`), `the ${token} token is gone`);
    const darkBlock = css.slice(css.indexOf(".lumen-root.lumen-dark {"));
    assert.ok(darkBlock.includes(`${token}:`), `${token} has no dark-mode value — dark would render white-on-white`);
  }
  assert.match(css, /\.lumen-root\.lumen-dark \{[\s\S]*--side: #18181d;/);
});
