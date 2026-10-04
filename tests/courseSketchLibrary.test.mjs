// tests/courseSketchLibrary.test.mjs
//
// The Sketch tab's PERSONAL LIBRARY — "my items were saved but the library is
// blank when I come back", and "Add to Excalidraw from the libraries site must
// land in my own library".
//
//   · RUNTIME — utils/excalidrawLibraryLink.js is the pure half of the
//     "Add to Excalidraw" return flow: read the link out of the URL the
//     libraries site sends the browser back to, keep only links the editor
//     itself trusts, park them for the Sketch panel, and put the learner back
//     on the route they were on (this app routes with `#/…`, so a raw
//     `#addLibrary=` would otherwise strand them on an unknown route).
//   · CONTRACT — the wiring that makes the library persist at all: the panel
//     hands Excalidraw a real persistence adapter (`useHandleLibrary`), the
//     hook stores it under the learner's own document with a device mirror,
//     the return link is captured before React renders, and the rules keep the
//     document owner-only.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EXCALIDRAW_LIBRARY_LINK_KEY,
  captureExcalidrawLibraryReturn,
  clearStoredExcalidrawLibraryLink,
  isAllowedExcalidrawLibraryUrl,
  lastRecordedRoute,
  parseExcalidrawLibraryLink,
  readStoredExcalidrawLibraryLink,
  storeExcalidrawLibraryLink,
} from "../utils/excalidrawLibraryLink.js";

const read = (path) => readFileSync(path, "utf8");

const LIB = "https://libraries.excalidraw.com/?useHash=true#/library/abc123.excalidrawlib";
const ROUTE_HISTORY_KEY = "eduvora.routeHistory.v1";

/** A minimal Storage stand-in (sessionStorage/localStorage are not in Node). */
const fakeStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
};

// ---------------------------------------------------------------------------
// Runtime: parsing
// ---------------------------------------------------------------------------

test("the return link is read from the hash (current) and the query (legacy)", () => {
  const fromHash = parseExcalidrawLibraryLink("", `#addLibrary=${encodeURIComponent(LIB)}&token=editor-7`);
  assert.equal(fromHash.libraryUrl, LIB);
  assert.equal(fromHash.idToken, "editor-7");

  const fromQuery = parseExcalidrawLibraryLink(`?addLibrary=${encodeURIComponent(LIB)}`, "");
  assert.equal(fromQuery.libraryUrl, LIB);
  assert.equal(fromQuery.idToken, null);

  // A return URL that kept our own route hash in front of it still parses.
  const nested = parseExcalidrawLibraryLink("", `#/course/demo#addLibrary=${encodeURIComponent(LIB)}`);
  assert.equal(nested.libraryUrl, LIB);

  // No link at all → nothing to do (the app must never see a phantom install).
  assert.equal(parseExcalidrawLibraryLink("", "#/course/demo"), null);
  assert.equal(parseExcalidrawLibraryLink("?utm=1", ""), null);
  assert.equal(parseExcalidrawLibraryLink("", "#addLibrary="), null);
});

test("only the hosts the editor itself trusts are accepted", () => {
  assert.equal(isAllowedExcalidrawLibraryUrl(LIB), true);
  assert.equal(isAllowedExcalidrawLibraryUrl("https://excalidraw.com/?x=1"), true);
  assert.equal(
    isAllowedExcalidrawLibraryUrl("https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/master/libraries/diagrams.excalidrawlib"),
    true,
  );
  assert.equal(isAllowedExcalidrawLibraryUrl("https://excalidraw.com.evil.example/lib"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl("https://evil.example/#/library/x.excalidrawlib"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl("https://raw.githubusercontent.com/someone/else/master/x.excalidrawlib"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl("http://libraries.excalidraw.com/x"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl("https://user:pass@excalidraw.com/x"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExcalidrawLibraryUrl(""), false);
  assert.equal(isAllowedExcalidrawLibraryUrl(null), false);
});

test("a parked link is stored, read back, and refuses anything corrupt", () => {
  const storage = fakeStorage();
  assert.equal(storeExcalidrawLibraryLink(storage, { libraryUrl: LIB, idToken: "t" }), true);
  const parked = readStoredExcalidrawLibraryLink(storage);
  assert.equal(parked.libraryUrl, LIB);
  assert.equal(parked.idToken, "t");
  assert.ok(parked.capturedAt > 0);

  // A disallowed URL is never written…
  assert.equal(storeExcalidrawLibraryLink(storage, { libraryUrl: "https://evil.example/x" }), false);
  // …and a hand-written record for one is ignored on read.
  storage.setItem(EXCALIDRAW_LIBRARY_LINK_KEY, JSON.stringify({ libraryUrl: "https://evil.example/x" }));
  assert.equal(readStoredExcalidrawLibraryLink(storage), null);
  storage.setItem(EXCALIDRAW_LIBRARY_LINK_KEY, "{not json");
  assert.equal(readStoredExcalidrawLibraryLink(storage), null);
  // No storage at all (private mode) is not a crash.
  assert.equal(readStoredExcalidrawLibraryLink(null), null);
  assert.equal(storeExcalidrawLibraryLink(null, { libraryUrl: LIB }), false);

  storeExcalidrawLibraryLink(storage, { libraryUrl: LIB });
  clearStoredExcalidrawLibraryLink(storage);
  assert.equal(readStoredExcalidrawLibraryLink(storage), null);
});

test("the return is rewritten to the route the learner was on, and the link is parked", () => {
  const storage = fakeStorage({ [ROUTE_HISTORY_KEY]: JSON.stringify(["#/home", "#/course/demo"]) });
  let replaced = "";
  const captured = captureExcalidrawLibraryReturn({
    pathname: "/app",
    search: "",
    hash: `#addLibrary=${encodeURIComponent(LIB)}&token=editor-7`,
    storage,
    replace: (url) => {
      replaced = url;
    },
    routeHistoryKey: ROUTE_HISTORY_KEY,
    fallbackRoute: "#/home",
  });

  assert.ok(captured);
  assert.equal(captured.libraryUrl, LIB);
  assert.equal(captured.idToken, "editor-7");
  // The learner lands back on their course, and the raw token is gone.
  assert.equal(captured.nextUrl, "/app#/course/demo");
  assert.equal(replaced, "/app#/course/demo");
  assert.equal(readStoredExcalidrawLibraryLink(storage).libraryUrl, LIB);

  // The legacy query form is cleaned the same way (and other params survive).
  const queryStorage = fakeStorage();
  const queryCapture = captureExcalidrawLibraryReturn({
    pathname: "/app",
    search: `?addLibrary=${encodeURIComponent(LIB)}&token=1&utm=keep`,
    hash: "#/course/other",
    storage: queryStorage,
    replace: () => {},
    routeHistoryKey: ROUTE_HISTORY_KEY,
  });
  assert.ok(queryCapture);
  assert.equal(queryCapture.nextUrl, "/app?utm=keep#/course/other");

  // No link → untouched: the boot hook must be a no-op on a normal open.
  assert.equal(captureExcalidrawLibraryReturn({ pathname: "/app", search: "", hash: "#/course/demo", storage, replace: () => {} }), null);
});

test("a disallowed link still restores the route but is never parked", () => {
  const storage = fakeStorage({ [ROUTE_HISTORY_KEY]: JSON.stringify(["#/course/demo"]) });
  let replaced = "";
  const captured = captureExcalidrawLibraryReturn({
    pathname: "/app",
    search: "",
    hash: `#addLibrary=${encodeURIComponent("https://evil.example/#/library/x.excalidrawlib")}`,
    storage,
    replace: (url) => {
      replaced = url;
    },
    routeHistoryKey: ROUTE_HISTORY_KEY,
  });
  assert.equal(captured, null);
  assert.equal(replaced, "/app#/course/demo");
  assert.equal(readStoredExcalidrawLibraryLink(storage), null);
});

test("the recorded route is the last real app route, never an auth screen", () => {
  const storage = fakeStorage({
    [ROUTE_HISTORY_KEY]: JSON.stringify(["#/course/a", "#/auth?mode=login", "not-a-route"]),
  });
  assert.equal(lastRecordedRoute(storage, ROUTE_HISTORY_KEY), "#/course/a");
  assert.equal(lastRecordedRoute(fakeStorage(), ROUTE_HISTORY_KEY), "");
  assert.equal(lastRecordedRoute(null, ROUTE_HISTORY_KEY), "");
});

// ---------------------------------------------------------------------------
// Contract: the editor's own persistence hook is actually wired
// ---------------------------------------------------------------------------

test("the Sketch panel hands Excalidraw a real library adapter and the return URL", () => {
  const panel = read("src/course/SketchPanel.tsx");
  assert.match(panel, /import \{ useHandleLibrary \} from "@excalidraw\/excalidraw";/);
  assert.match(panel, /useHandleLibrary\(\{/);
  assert.match(panel, /adapter: library\.adapter/);
  assert.match(panel, /validateLibraryUrl:/);
  assert.match(panel, /isAllowedExcalidrawLibraryUrl/);
  // The browse flow returns to a STABLE URL (origin + pathname), and every
  // library change is persisted even if the hook's own save pass bails.
  assert.match(panel, /libraryReturnUrl=\{libraryReturnUrl\}/);
  assert.match(panel, /onLibraryChange=\{onLibraryChange\}/);
  assert.match(panel, /window\.location\.origin\}\$\{window\.location\.pathname/);
  // The editor is still keyed only by the board, and the API is held in a ref
  // so a re-render can never remount it.
  assert.match(panel, /key=\{sceneKey\}/);
  assert.match(panel, /onExcalidrawAPI=\{\(api\) => \{/);
  // The library read-out is chrome, not a second library UI.
  assert.match(panel, /data-course-sketch-library=\{library\.state\}/);
});

test("the library hook stores per learner, mirrors on the device and flushes before leaving", () => {
  const hook = read("src/course/useSketchLibrary.ts");
  assert.match(hook, /export const SKETCH_LIBRARY_COLLECTION = "sketchLibraries";/);
  assert.match(hook, /export const SKETCH_LIBRARY_DOC_ID = "main";/);
  assert.match(hook, /doc\(db, "users", owner, SKETCH_LIBRARY_COLLECTION, SKETCH_LIBRARY_DOC_ID\)/);
  assert.match(hook, /setDoc\(/);
  assert.match(hook, /getDoc\(/);
  // load/save — the editor's LibraryPersistenceAdapter contract.
  assert.match(hook, /load: async \(\{ source \}\) =>/);
  assert.match(hook, /save: async \(\{ libraryItems \}\) =>/);
  // A refused / offline write keeps the library on the device.
  assert.match(hook, /localStorage\.setItem/);
  assert.match(hook, /"pagehide"/);
  assert.match(hook, /"visibilitychange"/);
  // The "Add to Excalidraw" install path: fetch the published library and
  // install it through the editor's own updateLibrary(merge: true).
  assert.match(hook, /updateLibrary\(\{/);
  assert.match(hook, /merge: true/);
  assert.match(hook, /readStoredExcalidrawLibraryLink/);
  assert.match(hook, /clearStoredExcalidrawLibraryLink/);
  assert.match(hook, /appState: \{ toast: \{ message: "Library added to your personal library"/);
});

test("the return link is captured before the app renders, and the panel opens for it", () => {
  const main = read("src/main.tsx");
  assert.match(main, /import \{ captureExcalidrawLibraryReturn \} from "\.\.\/utils\/excalidrawLibraryLink\.js";/);
  assert.match(main, /captureExcalidrawLibraryReturn\(\{/);
  assert.match(main, /routeHistoryKey: ROUTE_HISTORY_KEY/);
  assert.match(main, /window\.history\.replaceState\(null, "", url\)/);
  assert.match(main, /window\.location\.hash\.includes\("addLibrary"\)/);

  const player = read("src/CoursePlayerApp.tsx");
  // The panel needs to know WHO is drawing — the library is per learner.
  assert.match(player, /uid=\{user\?\.id \?\? null\}/);
  // A parked install opens the Sketch tab once so the learner sees it land.
  assert.match(player, /readStoredExcalidrawLibraryLink\(window\.sessionStorage\)/);
  assert.match(player, /setDockTab\("sketch"\)/);
});

test("firestore.rules keeps the library document owner-only, one per learner", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/sketchLibraries\/\{libraryId\} \{/);
  assert.match(rules, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(rules, /libraryId == 'main'/);
  assert.match(rules, /request\.resource\.data\.uid == uid/);
  assert.match(rules, /request\.resource\.data\.items\.size\(\) <= 900000/);
  assert.match(rules, /request\.resource\.data\.itemCount <= 500/);
});
