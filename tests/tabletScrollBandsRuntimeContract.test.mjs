// tests/tabletScrollBandsRuntimeContract.test.mjs
//
// DOM-fixture contract for the three tablet scroll fixes that #501 could not
// prove statically. It builds the REAL markup shape for each case (mirroring
// src/App.tsx, src/home/App.tsx, src/MyDayApp.tsx, src/components/DesktopShell.tsx)
// and checks that the actual CSS selectors in src/index.css match the right
// boxes — i.e. that each rule's selector really lands on the element that must
// scroll (or stay pinned), and fails loudly if it matches the wrong one.
//
// No DOM implementation is available in this sandbox (no jsdom in
// node_modules and no network to install one), so this uses a purpose-written
// selector matcher. It only understands the selector grammar the new rules
// actually use (type, `.class`, `[attr]` / `[attr="v"]`, `:has(...)`,
// `:not(...)`, descendant and `>` child combinators) and THROWS on anything
// else, so no rule is ever silently skipped.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/* ── tiny element tree ──────────────────────────────────────────────────── */
function el(tag, attrs = {}, children = []) {
  const node = { tag, attrs, classes: [], children };
  for (const c of children) c.parent = node;
  if (attrs.class) node.classes = attrs.class.trim().split(/\s+/);
  return node;
}
const parent = (n) => n.parent;
function descendants(node, acc = []) {
  for (const c of node.children) {
    acc.push(c);
    descendants(c, acc);
  }
  return acc;
}
function ancestors(node) {
  const out = [];
  for (let n = node.parent; n; n = n.parent) out.push(n);
  return out;
}

/* ── selector tokenizer + matcher ───────────────────────────────────────── */
function tokenize(sel) {
  const tokens = [];
  let cur = "";
  let combo = " ";
  let i = 0;
  const n = sel.length;
  while (i < n) {
    const ch = sel[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (cur.length) { tokens.push({ combo, compound: cur }); cur = ""; combo = " "; }
      i++;
    } else if (ch === ">") {
      if (cur.length) { tokens.push({ combo, compound: cur }); cur = ""; }
      combo = ">";
      i++;
    } else if (ch === "[") {
      let d = 1, j = i + 1;
      while (j < n && d > 0) { if (sel[j] === "[") d++; else if (sel[j] === "]") d--; j++; }
      cur += sel.slice(i, j); i = j;
    } else if (ch === "(") {
      let d = 1, j = i + 1;
      while (j < n && d > 0) { if (sel[j] === "(") d++; else if (sel[j] === ")") d--; j++; }
      cur += sel.slice(i, j); i = j;
    } else { cur += ch; i++; }
  }
  if (cur.length) tokens.push({ combo, compound: cur });
  if (tokens.length) tokens[0].combo = null;
  return tokens;
}

function parseCompound(c) {
  const out = []; let i = 0; const n = c.length;
  while (i < n) {
    const ch = c[i];
    if (ch === "[") {
      let d = 1, j = i + 1;
      while (j < n && d > 0) { if (c[j] === "[") d++; else if (c[j] === "]") d--; j++; }
      const inner = c.slice(i + 1, j - 1).trim();
      const m = /^([\w-]+)(?:=("[^"]*"|'[^']*'|[\w-]+))?$/.exec(inner);
      if (!m) throw new Error(`unsupported attribute selector: ${inner}`);
      let value;
      if (m[2] !== undefined) value = m[2][0] === '"' || m[2][0] === "'" ? m[2].slice(1, -1) : m[2];
      out.push({ type: "attr", name: m[1], value });
      i = j;
    } else if (ch === ".") {
      let j = i + 1; while (j < n && /[\w-]/.test(c[j])) j++;
      out.push({ type: "class", name: c.slice(i + 1, j) }); i = j;
    } else if (ch === ":") {
      if (c[i + 1] === ":") {
        let j = i + 2; while (j < n && /[\w-]/.test(c[j])) j++;
        out.push({ type: "pseudoEl", name: c.slice(i + 2, j) }); i = j;
      } else {
        let j = i + 1; while (j < n && /[\w-]/.test(c[j])) j++;
        const name = c.slice(i + 1, j);
        if (c[j] === "(") {
          let d = 1, k = j + 1;
          while (k < n && d > 0) { if (c[k] === "(") d++; else if (c[k] === ")") d--; k++; }
          out.push({ type: "pseudo", name, arg: c.slice(j + 1, k - 1).trim() }); i = k;
        } else { out.push({ type: "pseudo", name, arg: null }); i = j; }
      }
    } else if (ch === "*") { out.push({ type: "any" }); i++; }
    else if (/[\w-]/.test(ch)) {
      let j = i + 1; while (j < n && /[\w-]/.test(c[j])) j++;
      out.push({ type: "tag", name: c.slice(i, j) }); i = j;
    } else throw new Error(`unsupported selector character: ${ch}`);
  }
  return out;
}

function matchHas(node, arg) {
  arg = arg.trim();
  if (arg.startsWith(">")) return (node.children || []).some((c) => matchComplex(c, arg.replace(/^\s*>\s*/, "")));
  return descendants(node).some((c) => matchComplex(c, arg));
}

function matchNot(node, arg) {
  arg = arg.trim();
  if (arg.startsWith(":has(")) return !matchHas(node, arg.slice(":has(".length, -1).trim());
  return !matchComplex(node, arg);
}

function matchSimple(node, s) {
  switch (s.type) {
    case "tag": return node.tag === s.name;
    case "any": return true;
    case "class": return node.classes.includes(s.name);
    case "attr": return s.value === undefined ? s.name in node.attrs : node.attrs[s.name] === s.value;
    case "pseudo":
      if (s.name === "has") return matchHas(node, s.arg);
      if (s.name === "not") return matchNot(node, s.arg);
      throw new Error(`unsupported pseudo-class: ${s.name}`);
    case "pseudoEl": return false; // scrollbar pseudo-elements never match a node
    default: throw new Error(`unsupported simple selector: ${s.type}`);
  }
}

function matchCompound(node, compound) {
  return parseCompound(compound).every((s) => matchSimple(node, s));
}

function matchComplex(node, sel) {
  const tokens = tokenize(sel);
  const right = tokens[tokens.length - 1];
  if (!matchCompound(node, right.compound)) return false;
  let cur = node;
  for (let k = tokens.length - 2; k >= 0; k--) {
    const tok = tokens[k];
    // The combinator stored on a token links that token to the token on its
    // LEFT (e.g. `A > B` stores `>` on B). When we walk right-to-left, the
    // relationship between tok (the left side) and the already-matched `cur`
    // (the right side) is therefore the combo on the NEXT token, tokens[k+1]:
    //   `>`  ⇒ the right side is a CHILD of this token ⇒ parent of cur
    //   ' '  ⇒ the right side is a DESCENDANT of this token ⇒ ancestor of cur
    const nextCombo = tokens[k + 1].combo;
    if (nextCombo === ">") {
      cur = parent(cur);
      if (!cur || !matchCompound(cur, tok.compound)) return false;
    } else {
      cur = ancestors(cur).find((a) => matchCompound(a, tok.compound));
      if (!cur) return false;
    }
  }
  return true;
}

const matches = (node, sel) => matchComplex(node, sel);

/* Assert the selector string is really in src/index.css AND matches `node`,
   so the fixture test is tied to the actual shipped rules. */
function assertRuleMatches(node, selector, when) {
  assert.ok(css.includes(selector), `src/index.css must contain the selector: ${selector}`);
  assert.ok(matches(node, selector), `selector "${selector}" must ${when}`);
}
function assertRuleDoesNotMatch(node, selector, why) {
  assert.ok(css.includes(selector), `src/index.css must contain the selector: ${selector}`);
  assert.ok(!matches(node, selector), `selector "${selector}" must ${why}`);
}

/* ── Fixtures (real markup shapes, read from the components) ────────────── */

// Home / Store / PDP / Search / Profile (src/App.tsx, src/home/App.tsx):
// `[data-app-frame]` is a `flex flex-col` with the header and the bottom pill
// as DIRECT children and a single `<main>` directly inside it.
const HADIRECT = `html:not([data-tablet-landscape-desktop="true"]) body:not(:has(.dc-desktop-shell)) [data-app-frame]:not([data-revision-frame]):has(> main)`;
const HADIRECT_MAIN = `${HADIRECT} > main`;
const NO_DIRECT_MAIN = `html:not([data-tablet-landscape-desktop="true"]) body:not(:has(.dc-desktop-shell)) [data-app-frame]:not([data-revision-frame]):not(:has(> main))`;

function tabletPortraitHome() {
  return el("html", {}, [
    el("body", {}, [
      el("div", { class: "dc-app-shell min-h-screen sm:py-6" }, [
        el("div", { "data-app-frame": "", class: "mx-auto flex flex-col" }, [
          el("header", { "data-site-header": "" }, []),
          el("main", { class: "flex-1 overflow-y-auto" }, [el("section", {}, [])]),
          el("footer", { "data-site-footer": "" }, []),
        ]),
      ]),
    ]),
  ]);
}

// My Day (src/MyDayApp.tsx): `[data-app-frame]` has the header as a direct
// child but its `<main>` is NESTED inside `[data-myday-content]`.
function tabletPortraitMyDay() {
  return el("html", {}, [
    el("body", {}, [
      el("div", { class: "dc-app-shell min-h-screen" }, [
        el("div", { "data-app-frame": "", class: "mx-auto flex flex-col" }, [
          el("header", { "data-site-header": "" }, []),
          el("div", { "data-myday-content": "", class: "flex flex-1" }, [
            el("aside", {}, []),
            el("main", { class: "min-w-0 flex-1" }, []),
          ]),
          el("footer", { "data-site-footer": "" }, []),
        ]),
      ]),
    ]),
  ]);
}

// Desktop shell (src/components/DesktopShell.tsx): `.dc-desktop-shell` >
// `[data-desktop-rail]` + column > `[data-desktop-topbar]` +
// `[data-desktop-content]` > main > `.dc-app-shell` > `[data-app-frame]` >
// header / main / pill. The shell release lets the page content flow.
const SHELL_CONTENT = ".dc-desktop-shell [data-desktop-content]";
const SHELL_RELEASE_FRAME =
  ".dc-desktop-shell [data-desktop-content] > main:not(:has([data-revision-app])) [data-app-frame]";

function desktopShellPage(extraInMain = []) {
  return el("html", {}, [
    el("body", {}, [
      el("div", { class: "dc-desktop-shell flex min-h-[100dvh]" }, [
        el("aside", { "data-desktop-rail": "" }, []),
        el("div", { class: "flex min-h-0 flex-1 flex-col" }, [
          el("header", { "data-desktop-topbar": "" }, []),
          el("div", { "data-desktop-content": "", class: "flex min-h-0 flex-1" }, [
            el("main", { class: "min-w-0 flex-1" }, extraInMain),
          ]),
        ]),
      ]),
    ]),
  ]);
}
function appFrameInsideShellMain() {
  return el("div", { class: "dc-app-shell" }, [
    el("div", { "data-app-frame": "", class: "flex flex-col" }, [
      el("header", { "data-site-header": "" }, []),
      el("main", { class: "flex-1 overflow-y-auto" }, []),
      el("footer", { "data-site-footer": "" }, []),
    ]),
  ]);
}

// Narrow landscape split-screen body with / without `data-phone-device`.
const FREEZE = `html[data-phone-device="true"]:not([data-course-player-active="true"]) body`;
const UNFREEZE = `html:not([data-phone-device="true"]) body`;
const OVERLAY =
  `html[data-phone-device="true"][data-orientation-locked="portrait"]:not([data-course-player-active="true"]) [data-app-portrait-overlay]`;

/* ── tests ──────────────────────────────────────────────────────────────── */

test("T1: narrow landscape tablet body keeps normal panning (data-phone-device gate)", () => {
  // A real phone in landscape, player closed → frozen (overlay owns the screen).
  const phone = el("html", { "data-phone-device": "true", "data-orientation-locked": "portrait" }, [
    el("body", {}, []),
  ]);
  assertRuleMatches(phone.children[0], FREEZE, "freeze a phone body in landscape");

  // A tablet window in the same narrow band (no data-phone-device) → normal panning.
  const tablet = el("html", {}, [el("body", {}, [])]);
  assertRuleDoesNotMatch(tablet.children[0], FREEZE, "never freeze a tablet window");
  assertRuleMatches(tablet.children[0], UNFREEZE, "give a tablet window touch-action: auto");

  // Belt-and-braces: the forced overlay can only show on a phone.
  const phoneOverlay = el("html", { "data-phone-device": "true", "data-orientation-locked": "portrait" }, [
    el("body", {}, [el("div", { "data-app-portrait-overlay": "" }, [])]),
  ]);
  const ov = phoneOverlay.children[0].children[0];
  assertRuleMatches(ov, OVERLAY, "show the overlay on a phone");
  // Same overlay div on a tablet window (no data-phone-device) → never shown.
  const tabletOverlay = el("html", {}, [el("body", {}, [el("div", { "data-app-portrait-overlay": "" }, [])])]);
  assertRuleDoesNotMatch(
    tabletOverlay.children[0].children[0],
    OVERLAY,
    "never show the overlay on a tablet window",
  );
});

test("T2: Home/Store/PDP/Search/Profile — the frame's own <main> scrolls, header+pill stay pinned", () => {
  const html = tabletPortraitHome();
  const body = html.children[0];
  const shell = body.children[0];
  const frame = shell.children[0];
  const main = frame.children.find((c) => c.tag === "main");

  // The frame has a direct <main>, so the `:has(> main)` pin matches it and
  // the shell + header + pill are its children → the frame is clipped, not
  // scrolled, keeping the phone model.
  assertRuleMatches(frame, HADIRECT, "match the Home frame that has a direct <main>");
  assertRuleMatches(main, HADIRECT_MAIN, "make the Home <main> the scroller");
  assertRuleDoesNotMatch(frame, NO_DIRECT_MAIN, "not treat a <main>-bearing frame as the scroller");
});

test("T2: My Day — no direct <main>, so the frame itself is the scroller", () => {
  const html = tabletPortraitMyDay();
  const body = html.children[0];
  const frame = body.children[0].children[0];
  const mydayMain = descendants(frame).find((c) => c.tag === "main");

  // My Day's <main> is nested inside `[data-myday-content]`, so `:has(> main)`
  // does NOT match the frame and the `:not(:has(> main))` fallback makes the
  // frame the scroller instead.
  assertRuleDoesNotMatch(frame, HADIRECT, "not match a frame whose <main> is nested");
  assertRuleDoesNotMatch(mydayMain, HADIRECT_MAIN, "not treat the nested My Day <main> as a direct scroller");
  assertRuleMatches(frame, NO_DIRECT_MAIN, "make the My Day frame the scroller");
});

test("T3: the desktop shell scroller and the per-page release match the shell markup", () => {
  const html = desktopShellPage([appFrameInsideShellMain()]);
  const body = html.children[0];
  const shell = body.children[0];
  const content = descendants(shell).find((c) => c.attrs["data-desktop-content"] !== undefined);
  const shellMain = content.children.find((c) => c.tag === "main");
  const frame = descendants(shellMain).find((c) => c.attrs["data-app-frame"] !== undefined);

  assertRuleMatches(shell, ".dc-desktop-shell", "match the shell");
  assertRuleMatches(content, SHELL_CONTENT, "make [data-desktop-content] the shell scroller");
  assertRuleMatches(shellMain, ".dc-desktop-shell [data-desktop-content] > main", "match the shell main column");
  // The per-page release lets the frame content flow into the shell scroller.
  assertRuleMatches(frame, SHELL_RELEASE_FRAME, "release the non-revision page frame inside the shell");
});

test("T3: the shell release skips Revision, which keeps its own scroller", () => {
  // Revision renders `[data-revision-app]` inside the shell main; the release
  // `:not(:has([data-revision-app]))` must NOT apply there.
  const html = desktopShellPage([
    el("div", { "data-revision-app": "" }, [
      el("div", { "data-revision-frame": "" }, [
        el("main", { "data-revision-page-main": "" }, []),
      ]),
    ]),
  ]);
  const shell = html.children[0].children[0];
  const shellMain = descendants(shell).find((c) => c.tag === "main");
  assertRuleDoesNotMatch(
    shellMain,
    SHELL_RELEASE_FRAME,
    "skip the release when the shell main contains [data-revision-app]",
  );
  // …and there is no [data-app-frame] to release inside Revision at all.
  const revisionFrame = descendants(shell).find((c) => c.attrs["data-revision-frame"] !== undefined);
  assert.ok(revisionFrame, "the revision frame exists in the fixture");
  assertRuleDoesNotMatch(revisionFrame, SHELL_RELEASE_FRAME, "never release the revision frame");
});

test("every new selector is present in src/index.css (ties the fixtures to the shipped rules)", () => {
  for (const s of [HADIRECT, HADIRECT_MAIN, NO_DIRECT_MAIN, SHELL_CONTENT, SHELL_RELEASE_FRAME, FREEZE, UNFREEZE, OVERLAY]) {
    assert.ok(css.includes(s), `missing selector in src/index.css: ${s}`);
  }
});
