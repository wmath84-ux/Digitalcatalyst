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
const tabs = [...tabsSource.matchAll(/\{ key: "(\w+)", label: "([^"]+)", heading: "([^"]+)", hint: "[^"]*", color: "([^"]+)"/g)].map(([, key, label, heading, color]) => ({ key, label, heading, color }));
let keyboardVisible = false;
function load(file, resolver = require) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(resolver, mod, mod.exports);
  return mod.exports;
}
const Nav = load('src/course/CoursePeekDock.tsx', id => {
  if (id === './CourseOverlay') return { TABS: tabs };
  if (id === './useCourseKeyboard') return { useCourseKeyboard: () => ({ keyboardVisible }) };
  if (id.endsWith('.css')) return {};
  return require(id);
}).default;
test('real strip render, click, keyboard focus, hidden tabs and soft keyboard', async () => {
  assert.equal(tabs.length, 9);
  const root = createRoot(document.getElementById('root'));
  const selected = [];
  const render = () => root.render(React.createElement(Nav, { tab: 'notes', hiddenTabs: ['paid'], onTabChange: key => selected.push(key) }));
  await act(render);
  const buttons = [...document.querySelectorAll('button')];
  assert.equal(buttons.length, 8);
  assert.equal(document.querySelector('[data-course-strip="paid"]'), null);
  assert.equal(document.querySelector('[data-course-strip="notes"]').getAttribute('aria-pressed'), 'true');
  assert.ok(buttons.every(button => button.getAttribute('aria-label') && button.style.getPropertyValue('--strip-color')));
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
