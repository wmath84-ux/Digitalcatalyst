// The Course Player AI page (src/lumen) opens in Dark Mode for a learner who
// has never saved a choice for it. A saved choice always wins, survives
// navigation and refresh, and never leaks into other Course Player pages.
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

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useCourseTheme } from ${JSON.stringify(path.join(ROOT, "src/course/playerPreferences.tsx"))};

// Mirrors src/lumen/App.tsx: the AI page's theme comes from useCourseTheme("ai", uid, "dark").
function AiPage({ uid }) {
  const ctl = useCourseTheme("ai", uid, "dark");
  return (
    <div className={ctl.theme === "dark" ? "lumen-root lumen-dark" : "lumen-root"} data-lumen-theme={ctl.theme}>
      <button type="button" data-lumen-toggle onClick={ctl.toggleTheme}>toggle</button>
    </div>
  );
}
export function mount(host, props) {
  const root = createRoot(host);
  act(() => root.render(<AiPage {...props} />));
  return { unmount: () => act(() => root.unmount()) };
}
export { act };
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
const KEY = (uid) => (uid ? `dc.courseTheme.ai.${uid}` : "dc.courseTheme.ai");
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

test("no saved AI preference → the AI page opens in Dark, and nothing is written on startup", () => {
  window.localStorage.clear();
  const p = fresh({ uid: "learner-a" });
  assert.equal(themeOf(p.host), "dark");
  assert.equal(isDarkClass(p.host), true);
  assert.equal(window.localStorage.getItem(KEY("learner-a")), null, "the default is a read fallback, not a stored choice");
  p.unmount();
});

test("no uid yet (signed-out or still resolving) also opens Dark", () => {
  window.localStorage.clear();
  const p = fresh({ uid: null });
  assert.equal(themeOf(p.host), "dark");
  p.unmount();
});

test("an explicit Light choice is persisted, and survives navigate-away / return / refresh", () => {
  window.localStorage.clear();
  const first = fresh({ uid: "learner-b" });
  assert.equal(themeOf(first.host), "dark");
  toggle(first.host);
  assert.equal(themeOf(first.host), "light");
  assert.equal(window.localStorage.getItem(KEY("learner-b")), "light");
  first.unmount();
  // Navigate away and back = a fresh mount reading the same storage.
  const back = fresh({ uid: "learner-b" });
  assert.equal(themeOf(back.host), "light", "the intended preference is preserved, not forced back to Dark");
  back.unmount();
});

test("an explicit Dark choice is kept as Dark on every return", () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("learner-c"), "dark");
  const p = fresh({ uid: "learner-c" });
  assert.equal(themeOf(p.host), "dark");
  p.unmount();
});

test("choices are per learner: one learner's Light never changes another's default", () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("learner-d"), "light");
  const other = fresh({ uid: "learner-e" });
  assert.equal(themeOf(other.host), "dark");
  other.unmount();
});

test("the AI page reads its fallback from the page default, not the old light fallback", () => {
  const lumen = read("src/lumen/App.tsx");
  assert.match(lumen, /useCourseTheme\("ai", learnerUid, "dark"\)/);
  assert.doesNotMatch(lumen, /useCourseTheme\("ai", learnerUid, "light"\)/);
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
  // Light values are preserved exactly for the light theme.
  const css = read("src/lumen/index.css");
  assert.match(css, /--side: #f2f1eb;/);
  assert.match(css, /\.lumen-root\.lumen-dark \{[\s\S]*--side: #18181d;/);
});
