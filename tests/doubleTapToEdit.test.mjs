import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('node_modules/.cache/double-tap-edit');
fs.mkdirSync(dir, { recursive: true });
buildSync({ stdin: { contents: `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { flushSync } from 'react-dom';
  import { useDoubleTapToEdit } from './src/course/useDoubleTapToEdit';
  export function mount(host, enabled, onEdit) {
    let handlers;
    function Harness() { handlers = useDoubleTapToEdit(enabled, onEdit); return null; }
    const root = createRoot(host);
    flushSync(() => root.render(<Harness />));
    return { handlers, unmount: () => flushSync(() => root.unmount()) };
  }`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/client'], outfile: path.join(dir, 'fixture.cjs') });
const { mount } = createRequire(import.meta.url)(path.join(dir, 'fixture.cjs'));
const dom = new JSDOM('<div id="host"></div><div id="canvas" />');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Element: dom.window.Element });
after(() => { dom.window.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function setup(enabled = true) {
  let edits = 0;
  const target = document.getElementById('canvas');
  const view = mount(document.getElementById('host'), enabled, () => edits++);
  const event = (at, extra = {}) => ({ target, currentTarget: target, pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 30, clientY: 40, timeStamp: at, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
  const tap = (at, extra = {}) => { view.handlers.onPointerDownCapture(event(at, extra)); const up = event(at + 40, extra); view.handlers.onPointerUpCapture(up); return up; };
  return { ...view, event, tap, edits: () => edits };
}

test('a single touch reads; a second nearby touch activates once and consumes the event', () => {
  const v = setup();
  v.tap(0); assert.equal(v.edits(), 0);
  const second = v.tap(150); assert.equal(v.edits(), 1);
  assert.equal(second.prevented, true); assert.equal(second.stopped, true);
  v.tap(300); assert.equal(v.edits(), 1);
  v.unmount();
});
test('scroll, long press, pointer cancellation, distant taps and multitouch cannot unlock', () => {
  for (const kind of ['scroll', 'long', 'cancel', 'distance', 'multitouch', 'slow']) {
    const v = setup();
    v.handlers.onPointerDownCapture(v.event(0));
    if (kind === 'scroll') v.handlers.onPointerMoveCapture(v.event(20, { clientY: 90 }));
    if (kind === 'cancel') v.handlers.onPointerCancelCapture();
    if (kind === 'multitouch') v.handlers.onPointerDownCapture(v.event(10, { pointerId: 2, isPrimary: false }));
    v.handlers.onPointerUpCapture(v.event(kind === 'long' ? 600 : 40));
    v.tap(kind === 'slow' ? 1000 : 150, kind === 'distance' ? { clientX: 100 } : {});
    assert.equal(v.edits(), 0, kind);
    v.unmount();
  }
});
test('mouse requires double-click, keyboard requires a focused container, MASTER stays disabled', () => {
  const v = setup();
  v.tap(0, { pointerType: 'mouse' }); v.tap(150, { pointerType: 'mouse' }); assert.equal(v.edits(), 0);
  v.handlers.onDoubleClickCapture(v.event(200)); assert.equal(v.edits(), 1);
  v.handlers.onKeyDown(v.event(300, { key: 'F2' })); assert.equal(v.edits(), 2);
  v.handlers.onKeyDown(v.event(310, { key: 'Enter', target: document.createElement('span') })); assert.equal(v.edits(), 2);
  v.unmount();
  const master = setup(false); master.tap(0); master.tap(150); master.handlers.onDoubleClickCapture(master.event(200)); master.handlers.onKeyDown(master.event(300, { key: 'Enter' })); assert.equal(master.edits(), 0); master.unmount();
});
test('links and controls are ignored, but read-only titles and React Flow nodes accept gestures', () => {
  for (const html of ['<a href="#">link</a>', '<button>action</button>', '<input>', '<textarea></textarea>', '<span role="button">action</span>']) {
    const v = setup(); const node = document.createElement('div'); node.innerHTML = html; const target = node.firstChild;
    v.tap(0, { target }); v.tap(150, { target }); v.handlers.onDoubleClickCapture(v.event(200, { target })); assert.equal(v.edits(), 0, html); v.unmount();
  }
  for (const html of ['<textarea readonly></textarea>', '<div role="button" class="react-flow__node"><span>idea</span></div>']) {
    const v = setup(); const node = document.createElement('div'); node.innerHTML = html; const target = node.querySelector('span') || node.firstChild;
    v.tap(0, { target }); v.tap(150, { target }); assert.equal(v.edits(), 1, html); v.unmount();
  }
});
