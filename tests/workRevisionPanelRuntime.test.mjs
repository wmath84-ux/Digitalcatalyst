// tests/workRevisionPanelRuntime.test.mjs
//
// RUNTIME proof for the Work Revision headless page + test panel, driven
// through the REAL WorkPageSurface -> WorkRevisionApp -> CourseBrainPanel
// stack in jsdom, over a REAL seeded device-only Work Revision store:
//
//   · the Revision page is headless from its first screen — no outer Work
//     header over the dashboard, and the slot reports immersive (the signal
//     WorkApp uses to hide the shared Work footer) on every view;
//   · the deck (FSRS) card viewer carries the panel button top-left; the
//     panel opens over the card, and closing it leaves the half-answered
//     card exactly as it was;
//   · the Brain answer viewer carries the same button at the top-left of
//     its practice header, and its topline stays out of the way;
//   · from the panel, another test opens straight away (mid-test switch),
//     and the panel's home/library/Leave Work entries navigate;
//   · existing data survives it all: decks, cards and the FSRS review log
//     written before the switches are still in the store afterwards.
//
// The shared Course header slot and the panel's source wiring are pinned by
// tests/workRevisionPanelContract.test.mjs.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-work-revision-panel-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/revision",
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
  "HTMLInputElement",
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  if (window[key] !== undefined) define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
};
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
define("ResizeObserver", NoopObserver);
define("IntersectionObserver", NoopObserver);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real Revision page surface, seeded store ────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import WorkPageSurface from "./src/work/pages/WorkPageSurface";
import { createWorkRevisionDeck, loadWorkRevisionSnapshot } from "./src/work/storage/workRevisionDb";

export { act, loadWorkRevisionSnapshot };
export const exitLog = [];
export const immersiveLog = [];

export async function seed() {
  const a = await createWorkRevisionDeck({
    name: "Physics basics",
    description: "",
    source: "user",
    cards: [
      { front: "What is velocity?", back: "Displacement per unit time.", hint: "", tags: [], cardType: "basic", source: "user" },
      { front: "What is acceleration?", back: "Rate of change of velocity.", hint: "", tags: [], cardType: "basic", source: "user" },
    ],
  });
  const b = await createWorkRevisionDeck({
    name: "Cell biology",
    description: "",
    source: "user",
    cards: [
      { front: "Which organelle makes ATP?", back: "Mitochondrion", options: ["Ribosome", "Mitochondrion", "Golgi apparatus"], correctIndex: 1, explanation: "Oxidative phosphorylation.", tags: [], cardType: "mcq", source: "user" },
      { front: "What is the powerhouse called?", back: "Mitochondrion", options: ["Nucleus", "Mitochondrion", "Vacuole"], correctIndex: 1, explanation: "It produces ATP.", tags: [], cardType: "mcq", source: "user" },
    ],
  });
  return { aId: a.id, bId: b.id };
}

export async function mountRevision() {
  const root = createRoot(document.getElementById("host"));
  await act(async () => {
    root.render(
      <WorkPageSurface
        page="revision"
        slotKey="secondary:revision"
        theme="light"
        orientation="column"
        notes={{ notes: [] }}
        onExit={() => exitLog.push("exit")}
        onToggleTheme={() => undefined}
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
      // Other Work pages bundled with the surface import Firebase at module
      // level even though the Revision page never calls it. Stub the
      // boundary so the bundle stays pure ESM for jsdom (the real cloud
      // paths are covered by their own suites).
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
export const orderBy = (field) => ({ field });
export const limit = (count) => ({ count });
export const serverTimestamp = () => null;
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ docs: [] });
export const setDoc = async () => undefined;
export const addDoc = async () => ({ id: "stub" });
export const updateDoc = async () => undefined;
export const deleteDoc = async () => undefined;
export const onSnapshot = () => () => undefined;
export const writeBatch = () => ({ set() {}, delete() {}, commit: async () => undefined });
export const runTransaction = async (_db, fn) => fn({ get: getDoc, set() {}, update() {}, delete() {} });
`,
                loader: "js",
              }
            : {
                contents: "export const auth = { currentUser: null }; export const db = {};",
                loader: "js",
              },
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
const settle = async (ms = 60) => {
  await act(async () => {
    await sleep(ms);
  });
};
const click = async (element, label) => {
  assert.ok(element, `expected ${label || "element"} to exist`);
  await act(async () => {
    element.click();
    await sleep(40);
  });
};
const buttonByText = (text, within = window.document) =>
  [...within.querySelectorAll("button")].find((button) => button.textContent.trim() === text || button.textContent.includes(text));
const panelButton = () => $("[data-work-revision-panel-button]");
const panel = () => $("[data-work-revision-panel]");

/* ── the flow ─────────────────────────────────────────────────────────────── */

test("Revision page: headless everywhere, top-left test panel, mid-test switching, data preserved", async () => {
  const { aId, bId } = await fixture.seed();
  const mounted = await fixture.mountRevision();
  await settle(250);

  /* Headless from the first screen: dashboard, no Work header, immersive. */
  assert.ok($("[data-work-revision-dashboard]"), "the Revision dashboard is up");
  assert.equal($("[data-work-header-area]"), null, "no outer Work header over the Revision page");
  assert.equal($("section[data-work-page-surface='revision']").getAttribute("data-work-headless"), "true", "the surface marks the page headless");
  assert.equal(fixture.immersiveLog.at(-1), true, "the slot reports immersive — WorkApp hides the shared footer");

  /* The page still opens from its library, as before. */
  await click(buttonByText("Open library"), "Open library");
  await settle(80);
  assert.equal(window.document.querySelectorAll("[data-work-revision-deck]").length, 2, "both tests are in the library");

  /* Into test A, deck (FSRS) style. */
  const stripA = [...window.document.querySelectorAll("[data-work-revision-deck]")].find((el) => el.textContent.includes("Physics basics"));
  await click(buttonByText("Study", stripA), "Study on Physics basics");
  await settle(80);
  assert.ok($("[data-work-revision-style-choice]"), "the study-style page opens from the library");
  await click($('[data-work-revision-style="convertible"]'), "Deck style");
  await settle(150);
  assert.ok($("[data-work-revision-fsrs-card]"), "the FSRS card viewer is up");
  assert.match(window.document.body.textContent, /Card 1 of 2/);

  /* Top-left panel button on the card viewer, before the back button. */
  const fsrsPanelButton = panelButton();
  assert.ok(fsrsPanelButton, "the panel button on the deck card viewer");
  const backButton = $("[data-work-revision-viewer-back]");
  assert.ok(backButton, "the viewer's in-card back stays");
  assert.equal(fsrsPanelButton.compareDocumentPosition(backButton) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING, "the panel button is the first top-left control");

  /* Answer a card, then prove the panel is a pure overlay. */
  await click(buttonByText("Show answer"), "Show answer");
  await settle(60);
  assert.ok(window.document.body.textContent.includes("Displacement per unit time."), "the answer is revealed");
  await click(buttonByText("Good"), "Good rating");
  await settle(150);
  assert.match(window.document.body.textContent, /Card 2 of 2/, "the rating advanced the deck");

  await click(panelButton(), "open the panel over the card");
  await settle(60);
  assert.ok(panel(), "the test panel opens over the card viewer");
  assert.ok($(`[data-work-revision-panel-test="${aId}"]`), "test A is listed");
  assert.equal($(`[data-work-revision-panel-test="${aId}"]`).getAttribute("data-work-revision-panel-test-active"), "true", "the current test is marked");
  assert.ok($(`[data-work-revision-panel-test="${bId}"]`), "test B is listed");
  await click($("[data-work-revision-panel-backdrop]"), "panel backdrop");
  await settle(60);
  assert.equal(panel(), null, "the backdrop closes the panel");
  assert.ok($("[data-work-revision-fsrs-card]"), "the card viewer is still there");
  assert.match(window.document.body.textContent, /Card 2 of 2/, "closing the panel preserved the card exactly");

  /* Mid-test switch: panel -> test B -> its Brain style. */
  await click(panelButton(), "open the panel again");
  await settle(60);
  await click($(`[data-work-revision-panel-test="${bId}"]`), "test B in the panel");
  await settle(100);
  assert.ok($("[data-work-revision-style-choice]"), "test B opens straight away");
  assert.ok($("[data-work-revision-subheader]").textContent.includes("Cell biology"), "the opened test is B");
  await click($('[data-work-revision-style="brain"]'), "Brain style");
  await settle(250);

  /* Brain answer viewer: topline gone, panel button leads its header. */
  assert.equal($("[data-work-revision-subheader]"), null, "no Revision topline over the answer deck");
  const brainRoot = $("[data-work-revision-brain-root]")?.closest("[data-work-revision]");
  assert.equal(brainRoot?.getAttribute("data-work-revision-headless"), "true", "the Brain answer viewer is headless");
  const practiceHeader = $(".brain-practice-header");
  assert.ok(practiceHeader, "the Brain viewer's own practice header is up");
  const brainPanelButton = practiceHeader.querySelector("[data-work-revision-panel-button]");
  assert.ok(brainPanelButton, "the panel button is in the answer header");
  const brainBack = practiceHeader.querySelector("[data-brain-back]");
  assert.equal(brainPanelButton.compareDocumentPosition(brainBack) & Node.DOCUMENT_POSITION_FOLLOWING, Node.DOCUMENT_POSITION_FOLLOWING, "the panel button is the first top-left control of the answer page");

  /* Switch back to test A mid-test, straight from the Brain viewer. */
  await click(brainPanelButton, "open the panel from the Brain viewer");
  await settle(60);
  assert.ok(panel(), "the panel opens over the Brain answer deck");
  await click($(`[data-work-revision-panel-test="${aId}"]`), "test A in the panel");
  await settle(100);
  assert.ok($("[data-work-revision-style-choice]"), "test A opens straight away");
  assert.ok($("[data-work-revision-subheader]").textContent.includes("Physics basics"), "the opened test is A");
  assert.equal($("[data-work-header-area]"), null, "still no outer Work header");

  /* Panel navigation: home, library, Leave Work. */
  await click(panelButton(), "open the panel for navigation");
  await settle(60);
  await click($('[data-work-revision-panel-nav="dashboard"]'), "Revision home");
  await settle(80);
  assert.ok($("[data-work-revision-dashboard]"), "Revision home opens");
  await click(panelButton(), "open the panel on the dashboard");
  await settle(60);
  await click($('[data-work-revision-panel-nav="library"]'), "Library");
  await settle(80);
  assert.equal(window.document.querySelectorAll("[data-work-revision-deck]").length, 2, "the library still lists both tests");
  await click(panelButton(), "open the panel in the library");
  await settle(60);
  await click($("[data-work-revision-panel-exit]"), "Leave Work");
  await settle(40);
  assert.deepEqual(fixture.exitLog, ["exit"], "Leave Work leaves Work");

  /* Data preserved through every switch. */
  const snapshot = await fixture.loadWorkRevisionSnapshot();
  assert.equal(snapshot.decks.length, 2, "both tests are still stored");
  assert.equal(snapshot.cards.filter((card) => !card.deletedAt).length, 4, "every card is still stored");
  assert.equal(snapshot.reviewLogs.length, 1, "the FSRS rating written mid-flow is still recorded");
  assert.equal(snapshot.reviewLogs[0].rating, "good");

  await mounted.unmount();
});
