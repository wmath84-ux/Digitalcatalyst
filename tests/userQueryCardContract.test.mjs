// tests/userQueryCardContract.test.mjs
//
// Contract for the User Query Page's feed card (src/components/QueryCard.tsx),
// which carries the owner's pinned reference design.
//
// Two things are load-bearing here, and both are asserted against the SHIPPED
// component rather than a description of it:
//
//   1. MAPPING. The reference card speaks authorName / authorHandle /
//      authorImage / content / timestamp / reply. This app has no such model —
//      a query is { name, email, message, createdAt, status, reply, repliedAt,
//      replyEmailStatus }. The card must fold that real data into the
//      reference's slots, and must invent nothing: no demo handle, no external
//      profile image (the API stores no photo, so the avatar is initials).
//
//   2. NO GLASS. The card is an opaque panel — a gradient hairline, a solid
//      face, real shadow depth. It must not drift back into the app's default
//      "everything is frosted" treatment, because the copy has to stay sharp
//      over the winter scene.
//
// The component is bundled with esbuild and mounted in jsdom, with `apiBase`
// and `firebase` swapped for a stub. That means `replyToUserQuery` itself is
// the real one from src/utils/userQueries.ts — the assertions cover the actual
// request the card puts on the wire, not a copy of it.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// ── boundary stub: stands in for apiBase + firebase ────────────────────────
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-user-query-card-contract");
fs.mkdirSync(OUT_DIR, { recursive: true });
const STUB = path.join(OUT_DIR, "boundary.mjs");
fs.writeFileSync(
  STUB,
  `
export const calls = [];
export let handler = () =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
export function respond(fn) { handler = fn; }
export function reset() { calls.length = 0; }
export function apiFetch(url, init) {
  calls.push({ url, method: init.method, body: JSON.parse(init.body) });
  return handler(url, init);
}
export const auth = { currentUser: { getIdToken: async () => "test-token" } };
`,
);

const OUT = path.join(OUT_DIR, "QueryCard.mjs");
await build({
  entryPoints: ["src/components/QueryCard.tsx"],
  outfile: OUT,
  bundle: true,
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  platform: "browser",
  logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
        b.onResolve({ filter: /(?:^|\/)firebase$|apiBase$/ }, () => ({
          path: STUB,
          external: true,
        }));
      },
    },
  ],
});

// Bundling the page too proves its imports still resolve after the redesign —
// it is not mounted (Header/BottomNav need the app's context providers), the
// card itself is what is exercised below.
await build({
  entryPoints: ["src/components/UserQueriesPage.tsx"],
  outfile: path.join(OUT_DIR, "UserQueriesPage.mjs"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  platform: "browser",
  logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
        b.onResolve({ filter: /(?:^|\/)firebase$|apiBase$/ }, () => ({
          path: STUB,
          external: true,
        }));
      },
    },
  ],
});

// ── jsdom ──────────────────────────────────────────────────────────────────
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
window.Element.prototype.scrollIntoView = function scrollIntoView() {};
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "matchMedia",
]) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: QueryCard } = await import(pathToFileURL(OUT).href);
const boundary = await import(pathToFileURL(STUB).href);

const source = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** strip comments so prose about a removed class cannot satisfy an assertion */
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

const cardSource = code(source("src/components/QueryCard.tsx"));
const pageSource = code(source("src/components/UserQueriesPage.tsx"));

// ── fixtures ───────────────────────────────────────────────────────────────
const CREATED = Date.UTC(2026, 8, 12, 9, 30);
const REPLIED = Date.UTC(2026, 8, 12, 11, 5);

const openQuery = {
  id: "q-open",
  uid: "u1",
  name: "Aisha Khan",
  email: "aisha.khan@example.com",
  message: "Can the Flow Path export to PDF?\n\nIt would help a lot before exams.",
  createdAt: CREATED,
  status: "open",
  reply: null,
  repliedAt: null,
  replyEmailStatus: null,
};

const repliedQuery = {
  id: "q-replied",
  uid: "u2",
  name: "Rahul Verma",
  email: "rahul@example.com",
  message: "How do I reset my streak?",
  createdAt: CREATED,
  status: "replied",
  reply: "Streaks reset automatically at midnight IST — nothing to do on your side.",
  repliedAt: REPLIED,
  replyEmailStatus: "Emailed just now.",
};

const veryLong = {
  ...openQuery,
  id: "q-long",
  name: "Bartholomew Fitzwilliam-Churchillington the Third",
  email: "bartholomew.fitzwilliam.churchillington.third@an-extremely-long-domain-name.example.com",
  message: "Please help ".repeat(60).trim(),
};

const tick = () => new Promise((r) => setTimeout(r, 10));

/** Mount one card and hand back the container + root for teardown. */
async function mount(query, { canReply = true, onReplied = () => {} } = {}) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => {
    root.render(
      React.createElement(QueryCard, { query, canReply, onReplied }),
    );
  });
  return { host, root, teardown: async () => {
    await React.act(async () => root.unmount());
    host.remove();
  } };
}

/** React tracks `value` on the node, so a plain assignment is ignored. */
function type(node, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(node, value);
  node.dispatchEvent(new window.Event("input", { bubbles: true }));
}

const click = (node) =>
  node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

after(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

// ── 1. mapping ─────────────────────────────────────────────────────────────
test("the card folds the query's real fields into the reference's slots", async () => {
  const { host, teardown } = await mount(openQuery);
  const card = host.querySelector("[data-user-query]");
  assert.ok(card, "the card renders");
  assert.equal(card.dataset.status, "open");

  const article = host.querySelector("article");
  assert.ok(article, "the content container is a semantic article");

  // The header's two lines, slot by slot — not "the email appears somewhere in
  // the card" (it also appears in the composer hint, which proves nothing).
  const header = article.querySelector("header");
  const nameLine = header.querySelector("p");
  assert.equal(nameLine.textContent.trim(), "Aisha Khan", "the author slot carries query.name");
  const contactLine = header.querySelector("[data-user-query-contact]");
  assert.equal(
    contactLine.textContent.trim(),
    openQuery.email,
    "the secondary identifier slot carries query.email, not an invented handle",
  );

  const message = host.querySelector("[data-user-query-message]");
  assert.equal(
    message.textContent,
    openQuery.message,
    "the question is rendered verbatim, paragraph breaks included",
  );
  assert.match(message.className, /whitespace-pre-wrap/, "author's paragraph breaks survive");
  assert.doesNotMatch(message.className, /line-clamp/, "the question is never clamped");

  const time = host.querySelector("p > time");
  assert.ok(time, "the timestamp is a <time> element");
  assert.equal(time.dateTime, new Date(CREATED).toISOString());

  await teardown();
});

test("the avatar is derived from the name — no external profile image is ever fetched", async () => {
  const { host, teardown } = await mount(openQuery);
  assert.equal(host.querySelectorAll("img").length, 0, "no <img> in the card at all");
  assert.doesNotMatch(cardSource, /authorImage|unsplash|x\.com|twitter\.com/i, "no demo identity");
  const avatar = host.querySelector("header > span");
  assert.equal(avatar.textContent, "AK", "initials come from the query's name");
  assert.equal(avatar.getAttribute("aria-hidden"), "true", "decorative — the name is right beside it");
  await teardown();
});

test("a malformed timestamp cannot take the card down", async () => {
  const { host, teardown } = await mount({ ...openQuery, createdAt: Number.NaN });
  assert.match(
    host.querySelector("[data-user-query-message]").textContent,
    /Flow Path/,
    "the card still renders",
  );
  assert.equal(
    host.querySelector("p > time").getAttribute("datetime"),
    null,
    "and simply drops the machine-readable stamp",
  );
  await teardown();
});

// ── 2. the secondary / reply section ───────────────────────────────────────
test("a reply becomes a separated secondary block; an unanswered query gets none", async () => {
  const done = await mount(repliedQuery);
  const block = done.host.querySelector("[data-user-query-reply]");
  assert.ok(block, "replied card shows the reply block");
  assert.match(block.textContent, /Streaks reset automatically/, "the answer text is in it");
  assert.match(block.textContent, /Emailed just now\./, "the delivery note is in it");
  const replyTime = block.querySelector("time");
  assert.equal(replyTime.dateTime, new Date(REPLIED).toISOString(), "the answer has its own timestamp");
  assert.match(block.className, /border-t/, "it is divided from the question, not merged into it");
  assert.equal(
    done.host.querySelector("textarea"),
    null,
    "an answered thread no longer offers a composer",
  );
  await done.teardown();

  const open = await mount(openQuery);
  assert.equal(open.host.querySelector("[data-user-query-reply]"), null, "no reply block before an answer");
  assert.ok(open.host.querySelector("textarea"), "the composer stands in for it instead");
  await open.teardown();
});

// ── 3. the header action is the real reply flow ────────────────────────────
test("the composer belongs to the owner only", async () => {
  const learner = await mount(openQuery, { canReply: false });
  assert.equal(learner.host.querySelector("textarea"), null, "a learner sees no composer");
  assert.equal(
    learner.host.querySelector('button[aria-label^="Reply to"]'),
    null,
    "a learner sees no reply action",
  );
  await learner.teardown();

  const owner = await mount(openQuery, { canReply: true });
  assert.ok(owner.host.querySelector("textarea"), "the owner sees the composer");
  await owner.teardown();
});

test("the header action hands focus to the existing composer instead of opening a second flow", async () => {
  const { host, teardown } = await mount(openQuery, { canReply: true });
  const textarea = host.querySelector("textarea");
  const action = host.querySelector('button[aria-label^="Reply to"]');
  assert.ok(action, "the header carries a reply action");
  assert.equal(action.tagName, "BUTTON");
  assert.equal(action.type, "button");

  await React.act(async () => {
    click(action);
  });
  assert.equal(window.document.activeElement, textarea, "focus lands in the composer");
  await teardown();
});

// ── 4. the wire ────────────────────────────────────────────────────────────
test("Send puts the page's real queries.reply request on the wire and reports the email", async () => {
  boundary.reset();
  boundary.respond(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          emailed: true,
          emailStatus: "Sent",
          query: { ...openQuery, status: "replied", reply: "On it!", repliedAt: REPLIED },
        }),
        { status: 200 },
      ),
    ),
  );

  let received = null;
  const { host, teardown } = await mount(openQuery, {
    canReply: true,
    onReplied: (next) => {
      received = next;
    },
  });

  const textarea = host.querySelector("textarea");
  const send = [...host.querySelectorAll("button")].find((b) => /Send reply/.test(b.textContent));
  assert.ok(send, "there is a send button");
  assert.equal(send.disabled, true, "it is disabled with an empty draft");

  await React.act(async () => {
    type(textarea, "On it!");
  });
  assert.equal(send.disabled, false, "it enables once there is text");

  await React.act(async () => {
    click(send);
  });
  await React.act(async () => {
    await tick();
  });

  const call = boundary.calls.at(-1);
  assert.ok(call, "a request went out");
  assert.equal(call.url, "/api/referral-leaderboard");
  assert.equal(call.body.action, "queries.reply", "the existing action, not a new endpoint");
  assert.equal(call.body.id, "q-open");
  assert.equal(call.body.reply, "On it!");
  assert.equal(call.method, "POST");

  assert.equal(received?.status, "replied", "onReplied got the server's query back");
  assert.equal(textarea.value, "", "the draft clears");
  assert.match(host.textContent, /Emailed to aisha\.khan@example\.com/, "the email outcome is shown");
  await teardown();
});

test("a failed reply surfaces as an alert and keeps the draft", async () => {
  boundary.reset();
  boundary.respond(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: false, error: "Only the owner can reply to queries." }), {
        status: 403,
      }),
    ),
  );
  const { host, teardown } = await mount(openQuery, { canReply: true });
  const textarea = host.querySelector("textarea");
  const send = [...host.querySelectorAll("button")].find((b) => /Send reply/.test(b.textContent));

  await React.act(async () => {
    type(textarea, "Sorry for the delay");
  });
  await React.act(async () => {
    click(send);
  });
  await React.act(async () => {
    await tick();
  });

  const alert = host.querySelector('[role="alert"]');
  assert.ok(alert, "the failure is announced");
  assert.match(alert.textContent, /Only the owner can reply to queries\./);
  assert.equal(textarea.value, "Sorry for the delay", "the draft is not lost");
  await teardown();
});

// ── 5. no glass ────────────────────────────────────────────────────────────
test("the card is opaque — no glassmorphism anywhere in it", () => {
  for (const banned of [
    /backdrop-blur/,
    /backdrop-filter/,
    /GlassCard/,
    /GlassSurface/,
    /bg-white\/\d/,
    /bg-white\/\[/,
    /text-white\/\d/,
  ]) {
    assert.doesNotMatch(cardSource, banned, `the card must not use ${banned}`);
  }
  // Every colour the card paints is a fully opaque value, so nothing behind it
  // can bleed through and soften the copy.
  const paints = cardSource.match(/#[0-9A-Fa-f]{6}\b|rgba?\([^)]*\)/g) || [];
  assert.ok(paints.length > 8, "the card declares its own opaque palette");
  const translucent = paints.filter((value) => /rgba?\(/.test(value));
  assert.deepEqual(
    translucent.filter((value) => !/^rgba\(2, ?6, ?23/.test(value)),
    [],
    "the only rgba() in the file is the shadow's own ink",
  );
});

test("the mounted card paints no frosted surface", async () => {
  const { host, teardown } = await mount(repliedQuery);
  const frosted = [...host.querySelectorAll("*")].filter(
    (node) => /backdrop|blur|\/\d+/.test(String(node.className)),
  );
  assert.deepEqual(frosted.map((n) => String(n.className)), [], "no frosted layer in the DOM");
  const article = host.querySelector("article");
  assert.ok(article.style.backgroundColor, "the face is a solid background colour");
  await teardown();
});

// ── 6. responsive ──────────────────────────────────────────────────────────
test("the card never carries the reference's fixed desktop width", async () => {
  assert.doesNotMatch(cardSource, /min-w-\[400px\]/, "no blind min-w-[400px]");
  assert.doesNotMatch(cardSource, /md:min-w-\[500px\]/, "no blind md:min-w-[500px]");
  assert.doesNotMatch(cardSource, /\bw-\[4\d\dpx\]/, "no fixed pixel width");

  const { host, teardown } = await mount(veryLong);
  const shell = host.querySelector("[data-user-query] > div");
  assert.match(shell.className, /\bw-full\b/, "the card takes the available width");
  assert.match(shell.className, /min-w-0/, "…and is allowed to shrink below its content");

  const name = host.querySelector("article header p");
  assert.match(name.className, /truncate/, "a long name truncates instead of overflowing");
  const contact = host.querySelector("[data-user-query-contact]");
  assert.match(contact.className, /truncate/, "a long address truncates too");
  assert.match(
    host.querySelector("[data-user-query-message]").className,
    /break-words/,
    "a long message wraps",
  );
  await teardown();
});

test("the page keeps a readable measure instead of a full-bleed desktop card", () => {
  assert.match(pageSource, /max-w-2xl/, "the list is capped at a readable width");
  assert.match(pageSource, /mx-auto/, "and centred in the frame");
});

// ── 7. accessibility ───────────────────────────────────────────────────────
test("every control is a real, labelled control", async () => {
  const { host, teardown } = await mount(openQuery, { canReply: true });

  const action = host.querySelector('button[aria-label^="Reply to"]');
  assert.match(action.getAttribute("aria-label"), /Reply to Aisha Khan/, "the icon button is named");

  const textarea = host.querySelector("textarea");
  const label = host.querySelector(`label[for="${textarea.id}"]`);
  assert.ok(label, "the composer has an explicit <label for>");
  const describedBy = textarea.getAttribute("aria-describedby");
  assert.ok(describedBy, "the composer points at its delivery hint");
  const hint = [...host.querySelectorAll("[id]")].find((node) => node.id === describedBy);
  assert.ok(hint, "that hint actually exists");
  assert.match(hint.textContent, /Sends to aisha\.khan@example\.com/, "and it names the recipient");

  for (const button of host.querySelectorAll("button")) {
    assert.equal(button.type, "button", "no control can submit a form by accident");
    assert.match(
      button.className,
      /focus-visible:ring-2/,
      `every button keeps a visible focus ring: ${button.textContent || button.getAttribute("aria-label")}`,
    );
  }
  assert.match(textarea.className, /focus-visible:ring-2/, "the composer keeps a visible focus ring");

  const article = host.querySelector("article");
  const namedBy = article.getAttribute("aria-labelledby");
  const name = [...host.querySelectorAll("[id]")].find((node) => node.id === namedBy);
  assert.equal(name?.textContent, "Aisha Khan", "the card is named by its author");
  await teardown();
});

// ── 8. the page around the card is untouched ───────────────────────────────
test("the queries page keeps its data flow, states and hooks", () => {
  for (const hook of [
    "data-app-frame",
    "data-user-queries-content",
    "data-footer-nav-space",
    "data-user-queries-filterbar",
  ]) {
    assert.ok(pageSource.includes(hook), `${hook} is still in place`);
  }
  assert.match(pageSource, /listUserQueries\(\)/, "it still loads through the existing client");
  assert.match(pageSource, /<Header/, "the header stays");
  assert.match(pageSource, /<BottomNav/, "the footer navigation stays");
  assert.match(pageSource, /<GlassToggleGroup/, "the status filter stays");
  assert.match(pageSource, /<AnimatePresence/, "the list animations stay");
  assert.match(pageSource, /aria-busy="true"/, "the loading state stays");
  assert.match(pageSource, /role="alert"/, "the error state stays");
  assert.match(pageSource, /No queries yet/, "the empty state stays");
  assert.match(pageSource, /<QueryCard/, "and it renders the new card");
  assert.doesNotMatch(pageSource, /GlassCard/, "the list is no longer wrapped in glass cards");
});
