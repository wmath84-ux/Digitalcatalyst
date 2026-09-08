// tests/glassSidebarExpandedByDefaultContract.test.mjs
//
// Behavioural contract for the compact side rail
// (src/components/glass-dock/GlassSidebar.tsx, the aicanvas.me Glass Sidebar
// used on the ≤1023px band — see src/components/DesktopShell.tsx):
//
//   · it boots EXPANDED (the reference component's collapsed default is what
//     read as "the sidebar never opens" on a tablet);
//   · the learner can still collapse it, and that choice is remembered;
//   · the SLOT the rail sits in rides the same spring as the panel, so the
//     column physically reflows — collapsing hands the width back to the page
//     instead of leaving a dead band of empty plate beside the icon rail.
//
// The real component is bundled with esbuild and mounted in jsdom, so these
// assertions run the shipped spring + toggle, not a copy of them.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Inside the repo (and inside node_modules, so it is never committed) so the
// bundle's bare `react` import resolves to the same instance react-dom uses.
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-glass-sidebar-contract");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "GlassSidebar.mjs");

execFileSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [
    "src/components/glass-dock/GlassSidebar.tsx",
    "--bundle",
    "--format=esm",
    "--jsx=automatic",
    "--target=es2022",
    "--external:react",
    "--external:react/jsx-runtime",
    `--outfile=${OUT}`,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "matchMedia"]) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const sidebarModule = await import(OUT);
const GlassSidebar = sidebarModule.default;
const { COLLAPSED_WIDTH, EXPANDED_WIDTH, OPEN_STORAGE_KEY } = sidebarModule;

assert.equal(COLLAPSED_WIDTH, 64);
assert.equal(EXPANDED_WIDTH, 220);

const ITEMS = [
  { id: "#/home", label: "Home", color: "#3A86FF", Icon: () => null, active: true },
  { id: "#/store", label: "Store", color: "#FFBE0B", Icon: () => null },
];

const tick = () => new Promise((r) => window.setTimeout(r, 25));
const waitUntil = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await tick();
  }
  return false;
};

// Every "mount" is a FRESH root on a FRESH container. Re-rendering into the
// same root would keep the component's own state alive and the stored-preference
// assertions would pass for the wrong reason.
let container = null;
let root = null;
const mount = (props = {}) => {
  if (root) root.unmount();
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(GlassSidebar, { items: ITEMS, onSelect: () => {}, ...props }));
};

const slot = () => container.querySelector("[data-glass-sidebar-slot]");
const panel = () => container.querySelector("[data-glass-sidebar]");
const toggle = () => container.querySelector("[data-glass-sidebar-toggle]");
const widthOf = (el) => Math.round(parseFloat(el.style.width));

after(() => {
  if (root) root.unmount();
  window.close();
});

test("the rail boots EXPANDED — labels and header space are on screen from frame one", async () => {
  window.localStorage.removeItem(OPEN_STORAGE_KEY);
  mount();
  assert.ok(await waitUntil(() => Boolean(slot()) && Boolean(panel())), "the rail mounts");
  assert.equal(slot().dataset.open, "true", "the slot reports open on boot");
  // Both the slot AND the panel are at the expanded width — that is what makes
  // the column reflow instead of painting over the page.
  assert.ok(await waitUntil(() => widthOf(slot()) === EXPANDED_WIDTH), "the slot springs to 220px");
  assert.ok(await waitUntil(() => widthOf(panel()) === EXPANDED_WIDTH), "the panel springs to 220px");
  // An expanded rail shows its labels; a collapsed one shows only the tiles.
  assert.ok(await waitUntil(() => container.textContent.includes("Store")), "labels render while open");
});

test("collapsing hands the width back — the column reflows, no dead band is left", async () => {
  toggle().dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(await waitUntil(() => slot().dataset.open === "false"), "the slot reports collapsed");
  assert.ok(await waitUntil(() => widthOf(slot()) === COLLAPSED_WIDTH), "the slot springs down to 64px");
  assert.ok(await waitUntil(() => widthOf(panel()) === COLLAPSED_WIDTH), "the panel springs down to 64px");
  assert.equal(window.localStorage.getItem(OPEN_STORAGE_KEY), "0", "the learner's choice is remembered");
});

test("a stored collapse survives the next mount, and the default stays expanded", async () => {
  // Same device, stored choice → boots collapsed.
  mount();
  assert.ok(await waitUntil(() => slot()?.dataset.open === "false"), "it comes back collapsed");
  assert.ok(await waitUntil(() => widthOf(slot()) === COLLAPSED_WIDTH));

  // Cleared preference (a first run) → back to the expanded default.
  window.localStorage.removeItem(OPEN_STORAGE_KEY);
  mount();
  assert.ok(await waitUntil(() => slot()?.dataset.open === "true"), "a fresh learner gets the expanded rail");
  assert.ok(await waitUntil(() => widthOf(slot()) === EXPANDED_WIDTH));
});

test("the shell no longer pins the glass column to the wide rail's width", () => {
  // `width: var(--desktop-rail-width) !important` on `[data-desktop-rail]` is
  // what reserved ~220px for a 64px rail and left the blank strip beside it.
  const css = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8");
  for (const rule of css.matchAll(/\.dc-desktop-shell \[data-desktop-rail\][^{]*\{[^}]*width:[^}]*!important;?[^}]*\}/g)) {
    assert.match(rule[0], /:not\(\[data-desktop-rail-variant="glass-sidebar"\]\)/, `still forces a width on the glass column: ${rule[0]}`);
  }
  assert.match(css, /\[data-desktop-rail-variant="glass-sidebar"\] \{[^}]*width: auto !important;/s);
  // …and the shell keeps `--desktop-rail-width` in step so the docks follow.
  const shell = fs.readFileSync(path.join(ROOT, "src/components/DesktopShell.tsx"), "utf8");
  assert.match(shell, /const \[compactRailOpen, setCompactRailOpen\] = useState<boolean>\(\(\) => readStoredRailOpen\(\)\)/);
  assert.match(shell, /setProperty\(\s*"--desktop-rail-width"/);
});
