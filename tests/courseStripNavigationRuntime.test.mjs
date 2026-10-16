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
