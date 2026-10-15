// tests/workAiPageHeaderRuntime.test.mjs
//
// RUNTIME proof for the Work AI page header removal, driven through the
// real WorkPageSurface in jsdom:
//
//   · the AI page shows NO Work header (no header band, no theme toggle on
//     the page), while its content still mounts and receives the Work
//     theme and device-only scope;
//   · the AI page is not immersive: the surface keeps reporting
//     non-immersive, so WorkApp's shared footer stays up on it;
//   · global theme functionality is unaffected — another Work page keeps
//     its header + theme toggle, and flipping the global theme re-themes
//     the AI content even though the AI page has no toggle of its own.
//
// The chat app itself (Lumen) is a props probe here: Work only wires four
// props into it, and its internal controls have their own suites
// (lumenCaptureContract, lumenChatCloudSyncContract,
// lumenChatPerformanceRuntime). Everything Work-owned — the surface, the
// header, the AI wrapper — is the real code.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-work-ai-header-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/ai",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  if (window[key] !== undefined) define(key, window[key]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real surface; Lumen and sibling pages probed/stubbed ────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import WorkPageSurface from "./src/work/pages/WorkPageSurface";

export { act };
export const toggleLog = [];
export const immersiveLog = [];

export async function mountSurface(page, theme) {
  const host = document.getElementById("host");
  host.innerHTML = "";
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WorkPageSurface
        page={page}
        slotKey={"secondary:" + page}
        theme={theme}
        orientation="column"
        notes={{ notes: [] }}
        onExit={() => undefined}
        onToggleTheme={() => toggleLog.push(theme)}
        onImmersiveChange={(slotKey, immersive) => immersiveLog.push(immersive)}
      />,
    );
  });
  return { unmount: () => act(async () => root.render(null)) };
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
  plugins: [
    {
      name: "css",
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-stub" }));
        b.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
      },
    },
    {
      // The chat app is probed: it records the exact props Work wires in and
      // renders one control, so the test proves the content mounts themed,
      // device-only and interactive. Lumen's internals have their own suites.
      name: "lumen-probe",
      setup(b) {
        b.onResolve({ filter: /lumen\/App$/ }, (args) => ({ path: args.path, namespace: "lumen-probe" }));
        b.onLoad({ filter: /.*/, namespace: "lumen-probe" }, () => ({
          contents: `
import * as React from ${JSON.stringify(require.resolve("react"))};
export default function LumenChatProbe(props) {
  const [clicks, setClicks] = React.useState(0);
  return (
    <div data-lumen-probe="" data-lumen-theme={props.themeOverride} data-lumen-storage-only={String(Boolean(props.storageOnly))} data-lumen-clicks={clicks}>
      <button type="button" onClick={() => setClicks((count) => count + 1)}>Ask</button>
    </div>
  );
}
`,
          loader: "tsx",
          resolveDir: ROOT,
        }));
      },
    },
    {
      // Sibling Work pages are not under test; their suites cover them.
      name: "work-sibling-pages",
      setup(b) {
        b.onResolve({ filter: /(NotesPanel|WorkMindMapSurface|WorkSketchSurface|WorkMyDayPage|WorkRevisionApp)$/ }, (args) => ({
          path: args.path,
          namespace: "work-page-stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "work-page-stub" }, () => ({
          contents: "export default function WorkPageStub() { return null; }",
          loader: "js",
        }));
      },
    },
    {
      name: "firebase-stub",
      setup(b) {
        b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "firestore", namespace: "firebase-stub" }));
        b.onResolve({ filter: /(^|\/)firebase$/ }, () => ({ path: "app", namespace: "firebase-stub" }));
        b.onLoad({ filter: /.*/, namespace: "firebase-stub" }, (args) =>
          args.path === "firestore"
            ? {
                contents: `
export const doc = (_db, ...parts) => ({ path: parts.join("/") });
export const collection = doc;
export const where = (field, op, value) => ({ field, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ docs: [] });
export const setDoc = async () => undefined;
export const deleteDoc = async () => undefined;
`,
                loader: "js",
              }
            : { contents: "export const auth = { currentUser: null }; export const db = {};", loader: "js" },
        );
      },
    },
  ],
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act } = fixture;

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const $ = (selector) => window.document.querySelector(selector);
const settle = async (ms = 50) => {
  await act(async () => {
    await sleep(ms);
  });
};
const click = async (element, label) => {
  assert.ok(element, `expected ${label || "element"} to exist`);
  await act(async () => {
    element.click();
    await sleep(30);
  });
};

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("AI page: no Work header, content themed and functional, global theme unaffected", async () => {
  /* Light theme: no header anywhere over the AI page. */
  const aiLight = await fixture.mountSurface("ai", "light");
  await settle(120);
  const aiSection = $("section[data-work-page-surface='ai']");
  assert.ok(aiSection, "the AI page surface is mounted");
  assert.equal(aiSection.querySelector("[data-work-header-area]"), null, "no Work header band over the AI page");
  assert.equal(aiSection.querySelector("[data-work-theme-toggle]"), null, "no theme toggle on the AI page");
  assert.equal(aiSection.querySelector("header"), null, "no header element at all from the Work shell");

  /* The content is preserved: mounted, device-only, themed, interactive. */
  const probe = $("[data-lumen-probe]");
  assert.ok(probe, "the AI chat content mounted");
  assert.ok($("[data-work-ai]"), "inside the Work AI page body");
  assert.equal(probe.getAttribute("data-lumen-storage-only"), "true", "the device-only scope is preserved");
  assert.equal(probe.getAttribute("data-lumen-theme"), "light", "the Work theme flows into the content");
  assert.equal(fixture.immersiveLog.at(-1), false, "the AI page is not immersive — the shared Work footer stays up");

  await click([...window.document.querySelectorAll("button")].find((b) => b.textContent === "Ask"), "the chat control");
  assert.equal($("[data-lumen-probe]").getAttribute("data-lumen-clicks"), "1", "the chat control is interactive");
  await aiLight.unmount();

  /* Global theme still reaches the AI content without a toggle on the page. */
  const aiDark = await fixture.mountSurface("ai", "dark");
  await settle(120);
  assert.equal($("[data-lumen-probe]").getAttribute("data-lumen-theme"), "dark", "the AI content follows the global dark theme");
  assert.equal($("section[data-work-page-surface='ai']").getAttribute("data-work-surface-theme"), "dark", "the surface records the global theme");
  assert.equal($("[data-work-header-area]"), null, "still no Work header in dark theme");
  await aiDark.unmount();

  /* Another Work page keeps its header and working theme toggle. */
  const other = await fixture.mountSurface("mindmap", "light");
  await settle(120);
  assert.ok($("[data-work-header-area='mindmap']"), "the other page keeps the Work header");
  const themeToggle = $("[data-work-theme-toggle]");
  assert.ok(themeToggle, "the other page keeps the dark/light theme button");
  await click(themeToggle, "the theme toggle");
  assert.equal(fixture.toggleLog.length, 1, "the global theme toggle still fires");
  await other.unmount();
});
