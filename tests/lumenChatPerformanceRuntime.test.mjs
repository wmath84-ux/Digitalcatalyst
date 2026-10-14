import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import http from "node:http";
import { chromium } from "playwright";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();

const rootDir = process.cwd();
const dir = path.join(rootDir, "node_modules/.tmp-lumen-performance");
fs.mkdirSync(dir, { recursive: true });
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const stubs = {
  cloud: `
    export const cloudChatsUid = uid => uid;
    export const describeChatsError = error => String(error);
    export function subscribeCloudChats(_uid, _product, next) { queueMicrotask(() => next([])); return () => {}; }
    export async function uploadCloudChats() {}
    export async function deleteCloudChats() {}
  `,
  client: `export class PersonalAiApiError extends Error {} export async function askModuleAi() { throw new Error("Not used in render tests"); }`,
  models: `const models = [{ id: "default", name: "School AI", short: "School", desc: "Fixture" }]; export const useRevisionAi = () => ({ models, source: "default", select: () => {} });`,
  theme: `export const useCourseTheme = () => ({ theme: "light", toggleTheme: () => {} });`,
  auth: `export const db = {}; export const auth = { currentUser: { uid: "learner-1" } }; export const useAuth = () => ({ user: { id: "learner-1", name: "Learner" } });`,
  probe: `import hook from ${JSON.stringify(path.join(rootDir, "src/lumen/useLumenChats.ts"))}; export const probe = { ctl: null }; export default function useLumenChats(input) { probe.ctl = hook(input); return probe.ctl; }`,
};
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) define(key, value);
for (const key of ["HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent"]) define(key, dom.window[key]);
define("requestAnimationFrame", (fn) => setTimeout(() => fn(performance.now()), 1));
define("cancelAnimationFrame", (id) => clearTimeout(id));
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 800, left: 0, top: 0, right: 600, bottom: 800 });
window.HTMLElement.prototype.scrollTo = function ({ top }) { this.scrollTop = top; };
const observers = new Set();
class ResizeObserverStub {
  constructor(callback) { this.callback = callback; observers.add(this); }
  observe(node) { this.node = node; }
  disconnect() { observers.delete(this); }
}
define("ResizeObserver", ResizeObserverStub);
const intersections = new Set();
class IntersectionObserverStub {
  constructor(callback, options) { this.callback = callback; this.options = options; intersections.add(this); }
  observe() {}
  disconnect() { intersections.delete(this); }
}
define("IntersectionObserver", IntersectionObserverStub);
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const buildOptions = {
  stdin: { resolveDir: rootDir, loader: "tsx", contents: `
    import React, { Profiler } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import App from "./src/lumen/App";
    import { probe } from "./src/lumen/useLumenChats";
    import { persistLocalChats, persistActiveChatId } from "./src/lumen/chatStore";
    import { perf } from "./src/lumen/lib/perf";
    export { probe, perf };
    export const metrics = { commits: 0 };
    export async function mount(host) {
      const chats = ["chat-a", "chat-b"].map((id, chatIndex) => ({
        id, title: chatIndex ? "Older physics" : "Physics", modelId: "default", course: "Physics", courseShort: "Physics", updatedAt: 2000 - chatIndex,
        messages: Array.from({ length: 100 }, (_, i) => ({ id: id + "-m" + i, role: "assistant", content: "## Answer " + i + "\\n\\n**Physics** and a [link](https://example.com).\\n\\n| A | B |\\n| - | - |\\n| x | y |", status: "complete", createdAt: i + 1 })),
      }));
      persistLocalChats("learner-1", "course-1", chats);
      persistActiveChatId("learner-1", "course-1", "chat-a");
      const root = createRoot(host);
      flushSync(() => root.render(<Profiler id="chat" onRender={() => metrics.commits++}><App uid="learner-1" productId="course-1" courseTitle="Physics" /></Profiler>));
      return { unmount: () => flushSync(() => root.unmount()) };
    }
    export function sync(run) { flushSync(run); }
  ` },
  outfile: path.join(dir, "fixture.mjs"), bundle: true, platform: "node", format: "esm", jsx: "automatic", logLevel: "silent", loader: { ".css": "empty" },
  plugins: [{ name: "lumen-io", setup(builder) {
    for (const [filter, name] of [
      [/\/cloudChats$/, "cloud"], [/ai\/personalAiClient$/, "client"], [/\/useRevisionAi$/, "models"], [/course\/playerPreferences$/, "theme"],
      [/(?:^|\/)firebase$|context\/AuthContext$/, "auth"], [/\/useLumenChats$/, "probe"],
    ]) builder.onResolve({ filter }, () => ({ path: name, namespace: "stub" }));
    builder.onLoad({ filter: /.*/, namespace: "stub" }, ({ path: name }) => ({ contents: stubs[name], resolveDir: rootDir, loader: "js" }));
  } }],
};
await build(buildOptions);
if (fs.existsSync(executablePath)) await build({ ...buildOptions, platform: "browser", outfile: path.join(dir, "browser.js"), define: { "process.env.NODE_ENV": '"development"' } });
const fixture = await import(pathToFileURL(path.join(dir, "fixture.mjs")).href);
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 3)); };
const ctl = () => fixture.probe.ctl;
const loadEarlier = () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Load earlier messages"));
let mounted;
beforeEach(async () => {
  mounted?.unmount();
  window.localStorage.clear();
  mounted = await fixture.mount(document.getElementById("root"));
  await settle();
  fixture.perf.reset();
  fixture.metrics.commits = 0;
});
after(() => {
  mounted?.unmount();
  dom.window.close();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const handle of process._getActiveHandles?.() ?? []) if (handle?.constructor?.name === "MessagePort") handle.unref?.();
});

test("one-pixel split resizing within a layout bucket causes no chat commits or Markdown parses", async () => {
  for (let width = 600; width < 690; width++) {
    fixture.sync(() => { for (const observer of observers) observer.callback([{ contentRect: { width } }]); });
  }
  await settle();
  assert.equal(fixture.metrics.commits, 0);
  assert.equal(fixture.perf.snapshot().markdownParses, 0);
  assert.equal(fixture.perf.snapshot().messageRenders, 0);
  fixture.sync(() => { for (const observer of observers) observer.callback([{ contentRect: { width: 830 } }]); });
  await settle();
  assert.equal(document.querySelector("[data-tier]").dataset.tier, "lg");
  assert.ok(fixture.metrics.commits > 0);
  assert.equal(fixture.perf.snapshot().markdownParses, 0, "tier changes reuse parsed Markdown");
  fixture.sync(() => { for (const observer of observers) observer.callback([{ contentRect: { width: 0 } }]); });
  assert.equal(document.querySelector("[data-tier]").dataset.tier, "lg", "hidden AI tab retains its layout");
});

test("opening another old chat resets its first page instead of rendering expanded previous history", async () => {
  for (let i = 0; i < 4; i++) { loadEarlier().click(); await settle(); }
  assert.equal(document.querySelectorAll(".msg-virtual").length, 45);
  fixture.perf.reset();
  fixture.sync(() => ctl().setActiveId("chat-b"));
  await settle();
  assert.equal(document.querySelectorAll(".msg-virtual").length, 5);
  assert.equal(fixture.perf.snapshot().markdownParses, 5, "only the latest page is parsed on first render");
});

test("resize/visible sentinel at the bottom cannot eagerly expand all chat history", async () => {
  assert.equal(document.querySelectorAll(".msg-virtual").length, 5);
  const log = document.querySelector('[role="log"]');
  Object.defineProperty(log, "scrollHeight", { value: 2000 });
  Object.defineProperty(log, "clientHeight", { value: 500 });
  log.scrollTop = 0;
  log.dispatchEvent(new window.Event("scroll", { bubbles: true })); // layout-generated, not learner input
  for (const observer of intersections) {
    assert.equal(observer.options.root, document.querySelector('[role="log"]'));
    observer.callback([{ isIntersecting: true }]);
  }
  await settle();
  assert.equal(document.querySelectorAll(".msg-virtual").length, 5);
  log.dispatchEvent(new window.WheelEvent("wheel", { deltaY: -100, bubbles: true }));
  log.dispatchEvent(new window.Event("scroll", { bubbles: true }));
  await settle();
  assert.equal(document.querySelectorAll(".msg-virtual").length, 15, "intentional upward scrolling still loads history");
});

test("new chat stays empty; outgoing composer draft remains owned by the old chat", async () => {
  const textarea = document.querySelector("textarea");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
  setter.call(textarea, "Old chat unsent draft");
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  document.querySelector('[aria-label="Open chat list"]').click();
  await settle();
  [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "New chat").click();
  await settle();
  assert.equal(document.querySelector("textarea").value, "");
  assert.equal(document.querySelectorAll(".msg-virtual").length, 0);
  fixture.sync(() => ctl().setActiveId("chat-a"));
  await settle();
  assert.equal(document.querySelector("textarea").value, "Old chat unsent draft");
});

test("chat edits preserve untouched conversation identity and no-op updates do not publish", async () => {
  const untouched = ctl().chats.find((chat) => chat.id === "chat-b");
  fixture.sync(() => ctl().setChats((chats) => chats.map((chat) => chat.id === "chat-a" ? { ...chat, title: "Renamed Physics" } : chat)));
  assert.equal(ctl().chats.find((chat) => chat.id === "chat-b"), untouched);
  fixture.metrics.commits = 0;
  fixture.sync(() => ctl().setChats((chats) => chats.map((chat) => chat)));
  assert.equal(fixture.metrics.commits, 0);
});


test("real browser: continuous split resize, old/new chats, history and draft ownership", { skip: !fs.existsSync(executablePath) }, async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/browser.js") { res.setHeader("Content-Type", "text/javascript"); res.end(fs.readFileSync(path.join(dir, "browser.js"))); return; }
    if (req.url === "/chat.css") { res.setHeader("Content-Type", "text/css"); res.end(fs.readFileSync("src/lumen/index.css")); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<link rel="stylesheet" href="/chat.css"><style>
      *{box-sizing:border-box} body{margin:0} #root{width:600px;height:780px}
      .flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.flex-none{flex:none}
      .relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.inset-y-0{top:0;bottom:0}.left-0{left:0}
      .h-full{height:100%}.w-full{width:100%}.min-h-0{min-height:0}.min-w-0{min-width:0}.overflow-y-auto{overflow-y:auto}
    </style><div id="root"></div><script type="module">
      import * as api from '/browser.js'; window.api=api; await api.mount(document.getElementById('root')); window.ready=true;
    </script>`);
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "0.0.0.0", resolve));
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("browser error:", error.message); });
    page.on("console", msg => { if (msg.type() === "error") console.error("browser console:", msg.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready, null, { timeout: 10000 });

    await page.waitForFunction(() => document.querySelectorAll('.msg-virtual').length === 5, null, { timeout: 10000 });
    await page.waitForTimeout(900); // let the initial cloud/mirror acknowledgement settle
    const resize = await page.evaluate(async () => {
      window.api.perf.reset(); window.api.metrics.commits = 0;
      for (let width = 601; width < 690; width += 2) {
        document.getElementById('root').style.width = width + 'px';
        await new Promise(requestAnimationFrame);
      }
      await new Promise(requestAnimationFrame);
      return { commits: window.api.metrics.commits, ...window.api.perf.snapshot() };
    });
    assert.equal(resize.commits, 0);
    assert.equal(resize.markdownParses, 0);
    for (let index = 0; index < 4; index++) {
      await page.getByRole('button', { name: 'Load earlier messages' }).click();
      await page.waitForFunction(expected => document.querySelectorAll('.msg-virtual').length >= expected, 15 + index * 10, { timeout: 5000 });
    }
    await page.evaluate(() => { window.api.perf.reset(); window.api.sync(() => window.api.probe.ctl.setActiveId('chat-b')); });
    assert.equal(await page.locator('.msg-virtual').count(), 5);
    assert.equal(await page.evaluate(() => window.api.perf.snapshot().markdownParses), 5);
    await page.getByRole('textbox', { name: 'Message Roman AI Pro' }).fill('Draft belongs to older physics');
    await page.getByRole('button', { name: 'Open chat list' }).click();
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Message Roman AI Pro' }).inputValue(), '');
    assert.equal(await page.locator('.msg-virtual').count(), 0);
    await page.evaluate(() => window.api.sync(() => window.api.probe.ctl.setActiveId('chat-b')));
    assert.equal(await page.getByRole('textbox', { name: 'Message Roman AI Pro' }).inputValue(), 'Draft belongs to older physics');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
