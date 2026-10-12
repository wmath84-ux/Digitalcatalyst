import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const dir = path.resolve("node_modules/.tmp-footer-uiverse");
fs.mkdirSync(dir, { recursive: true });
await build({
  entryPoints: ["src/components/UiverseFooterNav.tsx"],
  outfile: path.join(dir, "uiverse.mjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  packages: "external",
  alias: { "@": path.resolve("src") },
  logLevel: "silent",
});

const dom = new JSDOM('<div id="root"></div>', {
  url: "https://example.test",
  pretendToBeVisual: true,
});
for (const key of [
  "window", "document", "HTMLElement", "Element", "Node", "Event",
  "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame",
  "cancelAnimationFrame",
]) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: UiverseFooterNav } = await import(path.join(dir, "uiverse.mjs"));
const root = createRoot(document.getElementById("root"));
after(() => {
  React.act(() => root.unmount());
  dom.window.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const renderFooter = () => React.act(() => root.render(React.createElement(UiverseFooterNav)));
const profileButton = () => document.querySelector('[data-uiverse-tab="profile"]');
const menu = () => document.querySelector('[role="menu"]');

test("one Profile tap opens four shortcuts; selecting one navigates and closes the menu", () => {
  renderFooter();
  React.act(() => profileButton().click());
  assert.equal(profileButton().getAttribute("aria-expanded"), "true");
  assert.equal(menu().getAttribute("data-open"), "true");
  assert.deepEqual(
    [...menu().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim()),
    ["My Day", "My Study Library", "Revision", "FlowPath"],
  );
  React.act(() => menu().querySelector('[aria-label="My Day"]').click());
  assert.equal(window.location.hash, "#/my-day");
  assert.equal(menu().getAttribute("data-open"), "false");
  assert.equal(profileButton().getAttribute("aria-expanded"), "false");
});

test("a double Profile click and keyboard shortcuts open the Profile page accessibly", () => {
  renderFooter();
  React.act(() => profileButton().click());
  React.act(() => profileButton().click());
  assert.equal(window.location.hash, "#/profile");
  assert.equal(menu().getAttribute("data-open"), "false");

  const profile = profileButton();
  profile.focus();
  React.act(() => profile.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  React.act(() => profile.click());
  assert.equal(document.activeElement, menu().querySelector('[role="menuitem"]'));

  React.act(() => profile.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true })));
  assert.equal(window.location.hash, "#/profile");
});
