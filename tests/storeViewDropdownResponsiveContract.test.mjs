// tests/storeViewDropdownResponsiveContract.test.mjs
//
// Contract for the active Store layout selector: the original issue was a
// view popover collapsing to the width of its small trigger on tablet/desktop.
// StorePage now uses an accessible listbox and the shared PDP glass window;
// these checks ensure its layout variant stays self-sized and viewport-safe.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const storePage = fs.readFileSync("src/components/StorePage.tsx", "utf8");
const storeCss = fs.readFileSync("src/components/store-marketplace.css", "utf8");
const glassCss = fs.readFileSync("src/glass.css", "utf8");

test("Store sort and view controls use accessible click-open listboxes", () => {
  assert.match(storePage, /data-store-sort=\{isSort \? "" : undefined\}/);
  assert.match(storePage, /data-store-view-selector=\{!isSort \? "" : undefined\}/);
  assert.match(storePage, /aria-haspopup="listbox"/);
  assert.match(storePage, /aria-expanded=\{open\}/);
  assert.match(storePage, /role="listbox"/);
  assert.match(storePage, /role="option"/);
  assert.match(storePage, /closeOnOutsidePointer/);
  assert.match(storePage, /event\.key !== "Escape"/);
  assert.match(storePage, /moveOptionFocus/);
});

test("the view window sizes independently from its trigger at every viewport width", () => {
  const view = /\.dc-marketplace-view-window\s*\{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(view, "expected a self-sized Store view window rule");
  assert.match(view, /width:\s*min\(190px,\s*calc\(100vw - 2rem\)\)/);
  assert.match(view, /min-width:\s*min\(190px,\s*calc\(100vw - 2rem\)\)/);
  assert.match(view, /height:\s*70px/);

  const option = /\.dc-marketplace-popup-option--view\s*\{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(option, "view choices must retain a horizontal row layout");
  assert.match(option, /flex:\s*1 1 0/);
  assert.match(option, /min-height:\s*2\.25rem/);
  assert.match(option, /white-space:\s*nowrap/);
});

test("sort gets a readable list variant without changing the shared glass material", () => {
  const sort = /\.dc-compact-glass-window--menu\s*\{([^}]*)\}/.exec(storeCss)?.[1];
  assert.ok(sort, "expected a compact list variant for sort choices");
  assert.match(sort, /width:\s*min\(15rem,\s*calc\(100vw - 2rem\)\)/);
  assert.match(sort, /height:\s*auto/);
  assert.match(storePage, /className=\{`dc-compact-glass-window/);
  assert.match(glassCss, /\.dc-compact-glass-window\s*\{[\s\S]*?background:[\s\S]*?backdrop-filter:\s*blur\(5px\)\s*saturate\(1\.2\)/);
  assert.match(fs.readFileSync("src/PdpApp.tsx", "utf8"), /className="dc-compact-glass-window dc-pdp-share-menu"/);
});

test("both Store windows use the PDP opening placement and exact stretch animation", () => {
  assert.match(glassCss, /\.dc-compact-glass-window\s*\{[\s\S]*?bottom:\s*calc\(100%\s*\+\s*0\.375rem\)/);
  assert.match(glassCss, /\.dc-compact-glass-window\[data-open="true"\][\s\S]*?animation:\s*dc-compact-glass-window-stretch 760ms ease-out 40ms both/);
  assert.match(glassCss, /@keyframes dc-compact-glass-window-stretch[\s\S]*?10%\s*\{[^}]*scale\(1\.1,\s*0\.9\)[\s\S]*?30%\s*\{[^}]*scale\(0\.9,\s*1\.1\)/);
});


test("Store popovers escape the narrow trigger and clamp to the viewport", () => {
  assert.match(storePage, /import \{ createPortal \} from "react-dom"/);
  assert.match(storePage, /useLayoutEffect\(\(\) => \{/);
  assert.match(storePage, /data-store-popover-portal/);
  assert.match(storePage, /position: "fixed"/);
  assert.match(storePage, /viewportWidth - width - gutter/);
  assert.match(storePage, /menuRef\.current\?\.contains\(target\)/);
});
