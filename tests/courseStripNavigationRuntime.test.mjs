import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tabsSource = fs.readFileSync('src/course/CourseOverlay.tsx', 'utf8');
const tabs = [...tabsSource.matchAll(/\{ key: "(\w+)", label: "([^"]+)", heading: "([^"]+)", hint: "[^"]*", color: "([^"]+)", icon: (\w+) \}/g)].map(([, key, label, heading, color]) => ({ key, label, heading, color, icon: (props) => React.createElement('svg', { 'data-icon-size': props.size }) }));
let keyboardVisible = false;
// The two things the dock reads: the Course Player's page rule, and the
// Settings choice that overrules it ("Visible footer navigation always").
let pageRuleHidesFooter = false;
let footerAlwaysVisible = false;
function load(file, resolver = require) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolver, mod, mod.exports);
  return mod.exports;
}
const Nav = load('src/course/CoursePeekDock.tsx', id => {
  if (id === './CourseOverlay') return { TABS: tabs };
  if (id === './useCourseKeyboard') return { useCourseKeyboard: () => ({ keyboardVisible }) };
  if (id === './coursePanelSession') return { useFooterHiddenPage: () => pageRuleHidesFooter };
  if (id === '../utils/footerNavigationVisibility') return { useFooterNavigationAlways: () => footerAlwaysVisible };
  if (id.endsWith('.css')) return {};
  return require(id);
}).default;
test('real strip render, click, keyboard focus, hidden tabs and soft keyboard', async () => {
  assert.equal(tabs.length, 10);
  const root = createRoot(document.getElementById('root'));
  const selected = [];
  const render = () => root.render(React.createElement(Nav, { tab: 'notes', hiddenTabs: ['paid'], onTabChange: key => selected.push(key) }));
  await act(render);
  const buttons = [...document.querySelectorAll('button')];
  assert.equal(buttons.length, 9);
  assert.equal(document.querySelector('[data-course-strip="paid"]'), null);
  // The Workspace pill's cells: every tool is a work-nav cell with its icon…
  assert.ok(buttons.every(button => button.hasAttribute('data-work-nav-cell') && button.querySelector('svg')));
  // …and the selected cell is the "current page", tinted with its own accent
  // (the notes blue), exactly as the Workspace footer marks selection.
  const active = document.querySelector('[data-course-strip="notes"]');
  assert.equal(active.getAttribute('aria-current'), 'page');
  assert.equal(active.style.getPropertyValue('--work-nav-active'), tabs.find((t) => t.key === 'notes').color);
  await act(() => document.querySelector('[data-course-strip="read"]').click());
  assert.deepEqual(selected, ['read']);
  for (const button of buttons) button.scrollIntoView = () => {};
  buttons[0].focus();
  await act(() => buttons[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.equal(document.activeElement, buttons[1]);
  keyboardVisible = true;
  await act(render);
  assert.equal(document.querySelector('nav'), null);
  await act(() => root.unmount());
});
test('course feature preferences ignore old dark values without changing master/self preferences', () => {
  globalThis.localStorage = dom.window.localStorage;
  const prefs = load('src/course/playerPreferences.tsx');
  for (const feature of ['player', 'notes', 'mindMap', 'read', 'ai', 'sketch']) {
    localStorage.setItem(`dc.courseTheme.${feature}.learner`, 'dark');
    assert.equal(prefs.loadCourseTheme(feature, 'learner', 'dark'), 'light');
    prefs.persistCourseTheme(feature, 'dark', 'learner');
    assert.equal(localStorage.getItem(`dc.courseTheme.${feature}.learner`), 'light');
  }
  prefs.persistMasterSelfMode('notes', 'self', 'learner');
  assert.equal(prefs.loadMasterSelfMode('notes', 'learner'), 'self');
});

test('the page rule hides the real strip — and Settings "always" brings it back', async () => {
  // The first test left the soft keyboard open — the dock's own rule, not a
  // page rule: this test is about the PAGES.
  keyboardVisible = false;
  // Its OWN container: the first test's root was already unmounted on this one.
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = () => root.render(React.createElement(Nav, { tab: 'notes', onTabChange: () => {} }));

  // The rule alone: the dock is really gone (not merely styled away).
  pageRuleHidesFooter = true;
  footerAlwaysVisible = false;
  await act(render);
  assert.equal(document.querySelector('nav'), null, 'the page rule hides the strip');

  // "Visible footer navigation always" (Settings → Footer navigation): the
  // very same page, and the strip is back with all of its tools.
  footerAlwaysVisible = true;
  await act(render);
  const nav = document.querySelector('nav');
  assert.ok(nav, 'the Settings choice keeps it on the page');
  assert.equal(nav.querySelectorAll('[data-course-strip]').length, 10, 'every tool is still there');

  // Unticking it hands the page rule its say back.
  footerAlwaysVisible = false;
  await act(render);
  assert.equal(document.querySelector('nav'), null);

  pageRuleHidesFooter = false;
  footerAlwaysVisible = false;
  await act(render);
  assert.ok(document.querySelector('nav'), 'a library page keeps the strip as before');
  await act(() => root.unmount());
  host.remove();
});

// ---------------------------------------------------------------------------
// The PLACEABLE navigation (the owner's 2026-10-16 brief) — the same component
// the course player puts in its header and Work mode places around its deck.
// Same loader, same stubs; the placement STORE is the real one, so the button,
// the dropdown and the persisted choice are all exercised for real.
// ---------------------------------------------------------------------------

let wideViewport = false;
const mediaListeners = new Set();
dom.window.matchMedia = (query) => ({
  // LIVE, like a real MediaQueryList: the listener's own read must see the new
  // width, not the width at creation time.
  get matches() {
    return wideViewport;
  },
  media: query,
  addEventListener: (type, listener) => {
    if (type === 'change') mediaListeners.add(listener);
  },
  removeEventListener: (type, listener) => {
    if (type === 'change') mediaListeners.delete(listener);
  },
  addListener: (listener) => mediaListeners.add(listener),
  removeListener: (listener) => mediaListeners.delete(listener),
  dispatchEvent: () => false,
});
const setWideViewport = (next) => {
  wideViewport = next;
  for (const listener of [...mediaListeners]) listener({ matches: next, media: '(min-width: 768px)' });
};

const Placement = load('src/utils/footerNavigationPlacement.ts', (id) => require(id));
const HeaderNav = load('src/course/CourseHeaderNav.tsx', (id) => {
  if (id === './CourseOverlay') return { TABS: tabs };
  if (id === './useCourseKeyboard') return { useCourseKeyboard: () => ({ keyboardVisible }) };
  if (id === './coursePanelSession') return { useFooterHiddenPage: () => pageRuleHidesFooter };
  if (id === '../utils/footerNavigationVisibility') return { useFooterNavigationAlways: () => footerAlwaysVisible };
  if (id === '../utils/footerNavigationPlacement') return Placement;
  if (id.endsWith('.css')) return {};
  return require(id);
}).default;

test('the placeable navigation renders every tool with its label, and respects hidden tabs', async () => {
  keyboardVisible = false;
  pageRuleHidesFooter = false;
  footerAlwaysVisible = false;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const selected = [];
  const render = () =>
    root.render(
      React.createElement(HeaderNav, {
        tab: 'notes',
        onTabChange: (key) => selected.push(key),
        hiddenTabs: ['paid'],
        placement: 'header',
      }),
    );
  await act(render);

  const items = [...host.querySelectorAll('[data-dc-header-nav-tab]')];
  assert.equal(items.length, 9, 'every tool except the hidden one');
  assert.equal(host.querySelector('[data-dc-header-nav-tab="paid"]'), null, 'a learner-authored course hides Paid');
  assert.ok(
    items.every((item) => item.querySelector('svg') && item.querySelector('[data-dc-header-nav-label]')?.textContent.trim().length > 0),
    'icons AND labels, as the brief asks',
  );
  const active = host.querySelector('[data-dc-header-nav-tab="notes"]');
  assert.equal(active.getAttribute('data-active'), 'true');
  assert.equal(active.getAttribute('aria-current'), 'page');
  await act(() => host.querySelector('[data-dc-header-nav-tab="mindmap"]').click());
  assert.deepEqual(selected, ['mindmap'], 'every button works');

  // The footer's own page rule, and the Settings override, both hold here.
  keyboardVisible = true;
  await act(render);
  assert.equal(host.querySelector('[data-dc-header-nav]'), null, 'the soft keyboard hides it');
  keyboardVisible = false;
  pageRuleHidesFooter = true;
  await act(render);
  assert.equal(host.querySelector('[data-dc-header-nav]'), null, 'an editor page hides it');
  footerAlwaysVisible = true;
  await act(render);
  assert.ok(host.querySelector('[data-dc-header-nav]'), '"Visible footer navigation always" keeps it');
  footerAlwaysVisible = false;
  pageRuleHidesFooter = false;
  await act(() => root.unmount());
  host.remove();
});

test('the placement button is tablet/desktop only and its dropdown opens into free space', async () => {
  keyboardVisible = false;
  pageRuleHidesFooter = false;
  footerAlwaysVisible = false;
  dom.window.localStorage.clear();
  wideViewport = false;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (placement) => root.render(React.createElement(HeaderNav, { tab: 'notes', onTabChange: () => {}, placement }));

  await act(() => render('header'));
  assert.equal(host.querySelector('[data-dc-header-nav-placement]'), null, 'no placement button on a phone');

  await act(() => setWideViewport(true));
  await act(() => render('header'));
  const button = host.querySelector('[data-dc-header-nav-placement]');
  assert.ok(button, 'tablet/desktop gets the button');
  assert.equal(button.getAttribute('data-side'), 'down', 'navigation at the top → the menu opens down');

  await act(() => button.click());
  // The placement dropdown is portalled to <body> so a clipped ancestor can
  // never truncate it — the test queries the document, not the local host.
  // The layout effect uses requestAnimationFrame for its final measure, so
  // give it a tick to run before reading the inline coordinates.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const menu = document.querySelector('[data-dc-header-nav-menu]');
  assert.ok(menu, 'pressing it opens the dropdown');
  assert.equal(menu.parentElement === document.body, true, 'the menu is portalled straight into <body>');
  assert.equal(menu.getAttribute('data-side'), 'down');
  // The menu's own style carries the fixed coordinates (top/left in px) that
  // the React side just measured for the button + the menu itself.
  assert.equal(menu.style.position, 'fixed', 'the menu is fixed-positioned, anchored to the button');
  assert.ok(/^\d+(\.\d+)?px$/.test(menu.style.top), 'the menu sits at a measured `top` in px');
  assert.ok(/^\d+(\.\d+)?px$/.test(menu.style.left), 'the menu sits at a measured `left` in px');
  const options = [...menu.querySelectorAll('[data-dc-header-nav-option]')];
  assert.deepEqual(
    options.map((option) => option.getAttribute('data-dc-header-nav-option')),
    ['header', 'left', 'right', 'bottom'],
    'all four places',
  );
  assert.equal(menu.querySelector('[data-dc-header-nav-option="header"]').getAttribute('data-active'), 'true');

  await act(() => menu.querySelector('[data-dc-header-nav-option="right"]').click());
  assert.equal(Placement.getFooterNavigationPlacement(), 'right', 'the choice is stored');
  assert.equal(document.querySelector('[data-dc-header-nav-menu]'), null, 'and the dropdown closes itself');

  // The navigation re-renders at its new home: a right rail, whose dropdown
  // opens toward the LEFT (the free side).
  await act(() => render('right'));
  assert.equal(host.querySelector('[data-dc-header-nav]').getAttribute('data-placement'), 'right');
  await act(() => host.querySelector('[data-dc-header-nav-placement]').click());
  assert.equal(document.querySelector('[data-dc-header-nav-menu]').getAttribute('data-side'), 'left');

  // The dropdown closes itself on an outside pointerdown — even when the click
  // arrives OUTSIDE the navigation's own wrapper, because the menu lives in
  // <body>, not the navigation.
  await act(() => host.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true })));
  assert.equal(document.querySelector('[data-dc-header-nav-menu]'), null, 'an outside click puts it away');

  // Bottom and left, for the other two directions.
  await act(() => render('bottom'));
  assert.equal(host.querySelector('[data-dc-header-nav-placement]').getAttribute('data-side'), 'up');
  await act(() => render('left'));
  assert.equal(host.querySelector('[data-dc-header-nav-placement]').getAttribute('data-side'), 'right');

  await act(() => root.unmount());
  host.remove();
  dom.window.localStorage.clear();
  wideViewport = false;
});
