// tests/appZoomAdminLockContract.test.mjs
//
// The admin panel ships one global default-zoom control (default 110%).
// The zoom is locked for end users: in-app pinch / ctrl-wheel / keyboard
// zoom and viewport scaling are blocked, and only an admin edit to the
// {zoom: ...} setting changes what every learner sees.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const zoomUtil = read("src/utils/appZoom.ts");
const zoomContext = read("src/context/AppZoomContext.tsx");
const zoomPage = read("src/admin/pages/ZoomPage.tsx");
const adminApp = read("src/admin/AdminApp.tsx");
const nav = read("src/components/admin/nav.ts");
const main = read("src/main.tsx");
const disableZoom = read("src/utils/disablePageZoom.ts");
const viewport = read("src/utils/documentViewportMode.ts");
const html = read("index.html");

test("default app zoom is 110% and lives in the settings/appZoom document", () => {
  assert.match(zoomUtil, /DEFAULT_APP_ZOOM = 110/);
  assert.match(zoomUtil, /collection: "settings"/);
  assert.match(zoomUtil, /id: "appZoom"/);
  assert.match(zoomUtil, /MIN_APP_ZOOM = 50/);
  assert.match(zoomUtil, /MAX_APP_ZOOM = 200/);
});

test("zooming applies to the viewport and refuses user scaling", () => {
  assert.match(zoomUtil, /initial-scale=/);
  assert.match(zoomUtil, /viewportContentLockedToZoom/);
  assert.match(zoomUtil, /lockViewportScaling\(\)/);
  assert.match(zoomUtil, /dataset\.appZoom/);
  assert.match(zoomUtil, /user-scalable=no/);
  assert.match(zoomUtil, /maximum-scale=/);
  assert.match(zoomUtil, /minimum-scale=/);
});

test("the app subscribes to the zoom setting live (cache + Firestore)", () => {
  assert.match(zoomContext, /onSnapshot\(/);
  assert.match(zoomContext, /APP_ZOOM_DOC_PATH\.collection, APP_ZOOM_DOC_PATH\.id/);
  assert.match(zoomContext, /writeCachedAppZoom/);
  assert.match(zoomContext, /applyDocumentAppZoom/);
  assert.match(zoomContext, /APP_ZOOM_CHANGE_EVENT/);
  assert.match(main, /<AppZoomProvider>/);
});

test("page zoom gestures stay locked while the app zoom is active", () => {
  assert.match(disableZoom, /lockViewportScaling/);
  assert.match(disableZoom, /MutationObserver/);
  assert.match(disableZoom, /gesture(start|change|end)/);
  assert.match(disableZoom, /ctrlKey/);
  assert.match(disableZoom, /event\.preventDefault\(\)/);
  assert.match(viewport, /viewportContentLockedToZoom/);
});

test("cached zoom is applied before React loads so there is no flash", () => {
  assert.match(html, /eduvora\.appZoom\.v1/);
  assert.match(html, /viewportMeta\.content/);
  assert.match(html, /initial-scale=/);
  assert.match(html, /dataset\.appZoom/);
  assert.match(html, /110/);
});

test("admin can customise the zoom from the Default Zoom page", () => {
  assert.match(nav, /\/admin\/zoom/);
  assert.match(adminApp, /\/admin\/zoom/);
  assert.match(adminApp, /ZoomPage/);
  assert.match(zoomPage, /DEFAULT_APP_ZOOM/);
  assert.match(zoomPage, /setDoc\(/);
  assert.match(zoomPage, /APP_ZOOM_DOC_PATH\.collection, APP_ZOOM_DOC_PATH\.id/);
  assert.match(zoomPage, /writeCachedAppZoom/);
  assert.match(zoomPage, /data-default-zoom-input/);
  assert.match(zoomPage, /type="range"/);
  assert.match(zoomPage, /Reset default/);
  assert.match(zoomPage, /110%/);
});
