// tests/coursePlayerFooterScrollAway.test.mjs
//
// "COURSE PLAYER KE ANDAR JAHAN BHI SCROLL HO — FOOTER NAVIGATION AUTOMATICALLY
//  HIDE SHOW, SCROLLING BEHAVIOUR KE ACCORD" (owner, 2026-10-17).
//
// Wherever the learner scrolls inside the Course Player, the footer
// navigation steps out of the way on the way DOWN and comes straight back on
// the way UP — the same rule the search results pages already used, now
// applied to every surface of the player.
//
// This file proves:
//   1. the rule itself (pure, no DOM);
//   2. the real hook + the real session, in jsdom: a scroll in ANY scroller
//      is seen, and the footer's away/answer state follows the direction;
//   3. the real footer strip: it carries the state, the stylesheet slides it
//      away, and Settings' "always" overrules it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://learn.example.test',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = require('react');
const { createRoot } = require('react-dom/client');

const cache = new Map();

/** Transpile + run a repo source file, resolving its relative imports. */
function load(file) {
  const resolved = path.resolve(file);
  if (cache.has(resolved)) return cache.get(resolved);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const resolve = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(resolved), id);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
      }
      throw new Error(`cannot resolve ${id} from ${resolved}`);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
  cache.set(resolved, mod.exports);
  return mod.exports;
}

const rule = load('src/course/footerScrollAway.ts');
const session = load('src/course/coursePanelSession.ts');

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === 'MessagePort') handle.unref?.();
  }
});

/* ── 1 · the rule ───────────────────────────────────────────────────────── */

test('the rule: down hides the footer, up brings it back, the top always shows it', () => {
  assert.equal(rule.nextFooterScrollAway(false, 0, 0), false, 'at the top it is there');
  assert.equal(rule.nextFooterScrollAway(true, 0, 400), false, 'back at the top it is there again');
  assert.equal(rule.nextFooterScrollAway(false, 400, 100), true, 'travelling down it steps away');
  assert.equal(rule.nextFooterScrollAway(true, 100, 400), false, 'travelling up it comes back');
  assert.equal(rule.nextFooterScrollAway(true, 400, 400), true, 'no movement keeps the answer');
  assert.equal(rule.nextFooterScrollAway(false, 10, 0), false, 'a small nudge at the top keeps it');
  // A scroller seen for the first time has no direction: the rule stands by
  // its position instead of guessing.
  assert.equal(rule.nextFooterScrollAway(false, 400, null), true, 'a list that is already scrolled keeps the footer away');
  assert.equal(rule.nextFooterScrollAway(false, 0, null), false, 'a list at the top keeps the footer there');
  assert.equal(rule.nextFooterScrollAway(true, 0, null), false, '…and the top always wins');
});

/* ── 2 · the real hook in jsdom ─────────────────────────────────────────── */

test("the real hook sees a scroll in ANY scroller and publishes the footer state", async () => {
  const host = dom.window.document.getElementById('root');
  const root = createRoot(host);
  const seen = [];
  function Probe() {
    rule.useCourseFooterScrollAway(true);
    // The reactive read: the session publishes the state, so the footer (and
    // anything that watches it) re-renders when the scroll flips it.
    const state = session.useCoursePanelSession();
    seen.push(state.footerScrolledAway);
    return null;
  }
  await act(async () => {
    root.render(React.createElement(Probe));
  });

  // A scroller anywhere inside the player — the rule does not care which.
  const scroller = dom.window.document.createElement('div');
  host.appendChild(scroller);

  const scrollTo = async (top) => {
    await act(async () => {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new dom.window.Event('scroll', { bubbles: true }));
      const deadline = Date.now() + 500;
      while (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };

  assert.equal(session.getCoursePanelSession().footerScrolledAway, false, 'it starts where it belongs');
  await scrollTo(300);
  assert.equal(session.getCoursePanelSession().footerScrolledAway, true, 'scrolled down → the footer steps away');
  await scrollTo(120);
  assert.equal(session.getCoursePanelSession().footerScrolledAway, false, 'scrolled up → the footer comes back');
  await scrollTo(600);
  assert.equal(session.getCoursePanelSession().footerScrolledAway, true, 'down again → away again');
  await scrollTo(0);
  assert.equal(session.getCoursePanelSession().footerScrolledAway, false, 'back at the top → there again');

  // The session publishes it reactively — the footer re-renders on it.
  assert.ok(seen.length > 1, 'the probe re-rendered when the state changed');

  await act(async () => {
    root.unmount();
  });
  assert.equal(session.getCoursePanelSession().footerScrolledAway, false, 'the state never outlives the player');
});

/* ── 3 · the real footer strip ──────────────────────────────────────────── */

test('the real strip carries the state, the stylesheet slides it away, and "always" overrules it', () => {
  const dock = fs.readFileSync('src/course/CoursePeekDock.tsx', 'utf8');
  const css = fs.readFileSync('src/course/course-strip-nav.css', 'utf8');
  const player = fs.readFileSync('src/CoursePlayerApp.tsx', 'utf8');

  // The strip publishes the state.
  assert.match(dock, /data-course-strip-scrolled=\{scrolledAway \? 'away' : 'home'\}/);
  assert.match(dock, /const scrolledAway = useFooterScrolledAway\(\) && !footerNavigationAlways/);

  // …and the stylesheet slides it out of the way (and back).
  assert.match(css, /\[data-course-strip-nav\]\[data-course-strip-scrolled="away"\]/);
  assert.match(css, /transform: translateY\(130%\);/);
  assert.match(css, /transition: transform 220ms/);

  // The player watches every scroll in one place — no surface has to know.
  assert.match(player, /useCourseFooterScrollAway\(true\)/);
  // A new page starts with the footer where it belongs.
  assert.match(player, /setFooterScrolledAway\(false\);/);
});
