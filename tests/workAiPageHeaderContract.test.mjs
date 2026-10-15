// tests/workAiPageHeaderContract.test.mjs
//
// Source contract for the Work AI page header removal.
//
// Owner brief: on the Work Mode AI page, the Work header that used to sit
// over the chat — the band carrying the dark/light theme button — must not
// be shown. The AI page's content and existing functions are preserved, and
// global theme functionality is unaffected: the theme still flows into the
// AI surface, the footer still stays up on the AI page (it is a page, not
// an editor), and every other Work page keeps its header and theme toggle.
//
// Runtime behaviour: tests/workAiPageHeaderRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const surface = read("src/work/pages/WorkPageSurface.tsx");
const aiSurface = read("src/work/pages/WorkAiSurface.tsx");
const app = read("src/work/WorkApp.tsx");

test("the AI page renders without the Work header; the header stays for the other pages", () => {
  assert.match(surface, /const showHeader = !immersive && page !== "ai";/, "the header is suppressed for the AI page only");
  assert.match(surface, /\{showHeader \? \(\s+<header[\s\S]*?data-work-header-area=\{page\}[\s\S]*?data-work-theme-toggle=""/, "the one shared header (exit + theme toggle) still renders for the other pages");
  const immersiveBlock = surface.slice(surface.indexOf("const immersive ="), surface.indexOf("const showHeader"));
  assert.doesNotMatch(immersiveBlock, /"ai"/, "the AI page is not immersive — WorkApp keeps the shared footer up on it");
  assert.match(surface, /\) : null\}/, "a suppressed header renders nothing in its place");
});

test("the AI page's content and functions are untouched", () => {
  assert.match(surface, /<WorkAiSurface theme=\{theme\} notes=\{notes\.notes\} \/>/, "the AI surface still mounts with its theme and notes");
  assert.match(aiSurface, /<LumenChat/, "the chat itself is still the page content");
  assert.match(aiSurface, /storageOnly/, "the device-only scope is preserved");
  assert.match(aiSurface, /themeOverride=\{theme\}/, "the Work theme still flows into the chat");
  assert.match(aiSurface, /data-work-ai=""/, "the AI page identity marker stays");
});

test("global theme functionality is unaffected", () => {
  assert.match(app, /const toggleTheme = useCallback\(\(\) => setWorkTheme\(theme === "dark" \? "light" : "dark"\), \[theme\]\);/, "the Work theme toggle action is unchanged");
  assert.match(app, /onToggleTheme=\{toggleTheme\}/, "pages still receive the theme toggle");
  assert.match(surface, /data-work-surface-theme=\{theme\}/, "the surface still records the active theme");
  assert.match(surface, /aria-label=\{`Switch to \$\{dark \? "light" : "dark"\} Work theme`\}/, "the other pages keep their theme toggle button");
  assert.doesNotMatch(app, /data-work-shell-controls/, "no shell-level theme overlay was reintroduced");
});
