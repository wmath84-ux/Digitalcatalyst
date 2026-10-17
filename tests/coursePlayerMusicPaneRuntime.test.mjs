// The Music tab, driven as real UI in a real DOM — the REDESIGNED page
// (owner brief, 2026-10-15).
//
// The source-shape rules live in tests/coursePlayerMusicTabContract.test.mjs;
// this file mounts the ACTUAL pane and proves the brief behaves:
//
//   1. the tab opens on the library page — the YouTube-style search bar, then
//      the pure-white tray with All FIRST and the NEW URL button;
//   2. an empty library says the right thing in every filter ("Search to view
//      library", "There is no audio from this course.", …), and the All filter
//      centres its column of ways to start;
//   3. the ONE search box follows the filter: a plain filter for Course/Device,
//      a URL input for URL (arrow + Enter = add);
//   4. the Device filter owns the bottom-right ＋ button;
//   5. an audio tap opens the lesson player at FULL AREA — no card, back arrow
//      on the left, library glyph on the right, and the library page's return
//      never unmounts the song;
//   6. a YouTube tap opens the official embed COMPACT: player, draggable
//      divider, library below; full screen hides both and coming back restores
//      them; the compact search bar's arrow jumps to the full library page;
//   7. the footer navigation's session value follows the player/library rule;
//   8. search results carry real artwork with NO wash over it, online keeps
//      what the learner searched, and no key hands the query to YouTube itself;
//   9. the pane's shape comes from the PANE's width, not the viewport.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Music pane (+ the real session store) ─────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import MusicPanel from ${JSON.stringify(path.join(ROOT, "src/course/MusicPanel.tsx"))};
import { getCoursePanelSession } from ${JSON.stringify(path.join(ROOT, "src/course/coursePanelSession.ts"))};

// ONE root for the whole file. React 18 refuses a second createRoot() on a
// container it has already seen, so a fresh visit is a fresh KEY — the same
// thing React does when a learner signs out and back in.
let root = null;
let visits = 0;

export function mountMusic(host, options = {}) {
  if (!root) root = createRoot(host);
  visits += 1;
  act(() => {
    root.render(
      React.createElement(MusicPanel, {
        key: options.key || ("visit-" + visits),
        uid: options.uid === undefined ? "learner-1" : options.uid,
        courseAudio: options.courseAudio || [],
      }),
    );
  });
}

export function unmountMusic() {
  if (root) act(() => root.unmount());
  root = null;
}

/** The footer-navigation rule's own source of truth. */
export const panelSession = () => getCoursePanelSession();

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-music-pane-runtime");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

const bundle = buildFixture();

/* ── the DOM ─────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="music"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "https://learn.example.test/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLFormElement", "HTMLMediaElement", "HTMLAnchorElement",
  "SVGElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "SubmitEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "MutationObserver", "localStorage",
]) {
  define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, addEventListener: () => undefined,
    removeEventListener: () => undefined, addListener: () => undefined,
    removeListener: () => undefined, dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);
define("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
window.ResizeObserver = globalThis.ResizeObserver;

/** jsdom lays nothing out, so the test owns the ONE box every measurement reads. */
let paneWidth = 900;
let paneHeight = 800;
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, left: 0, top: 0, right: paneWidth, bottom: paneHeight, width: paneWidth, height: paneHeight, toJSON: () => ({}) };
};
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() { return paneWidth; },
});
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() { return paneHeight; },
});

/* Pointer capture the way a browser behaves: the capturing element keeps
 * receiving that pointer's moves. */
const captured = new Map();
window.Element.prototype.setPointerCapture = function setPointerCapture(pointerId) { captured.set(pointerId, this); };
window.Element.prototype.releasePointerCapture = function releasePointerCapture(pointerId) {
  if (captured.get(pointerId) === this) captured.delete(pointerId);
};

// The file picker is never really opened in a test — it is counted instead.
let pickerOpens = 0;
window.HTMLInputElement.prototype.click = function click() {
  if (String(this.type).toLowerCase() === "file") pickerOpens += 1;
};

// jsdom has no media stack: the glass player must mount without trying to play.
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => undefined;
window.HTMLMediaElement.prototype.load = () => undefined;

// No network in a unit test: a switchable stub, so a test can answer either
// like a platform's oEmbed or like the YouTube Data API.
let fetchResponder = () => Promise.reject(new Error("offline"));
define("fetch", (...args) => Promise.resolve(fetchResponder(...args)));
// No API key configured: the pane must fall back to YouTube's own search page.
delete globalThis.__DC_YOUTUBE_API_KEY__;

const fixture = require(bundle);
const { act } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 40) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

// jsdom nodes NEVER go to assert directly: a failed strict comparison makes
// node inspect the element, walk the whole window graph and OOM the runner.
// Every DOM check below is a BOOLEAN or a string.
const host = () => window.document.getElementById("music");
const q = (selector) => window.document.querySelector(selector);
const qa = (selector) => [...window.document.querySelectorAll(selector)];
const text = (selector) => (q(selector)?.textContent || "");

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function click(el) {
  return act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}

/** Enter/arrow on the URL box: jsdom has no implicit form submission. */
function submitForm() {
  return act(async () => {
    q("[data-music-searchbar]").dispatchEvent(new window.SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

function pointerEvent(type, x, y, pointerId) {
  return new window.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId, isPrimary: true,
    pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
  });
}

const COURSE_TRACK = {
  id: "course-f1",
  provider: "audio",
  title: "Intro theme",
  subtitle: "Basics",
  url: "https://cdn.example.test/intro.mp3",
  embedUrl: "",
  source: "course",
  addedAt: 0,
};

const COURSE_TRACK_2 = {
  id: "course-f2",
  provider: "audio",
  title: "Outro theme",
  subtitle: "Wrap up",
  url: "https://cdn.example.test/outro.mp3",
  embedUrl: "",
  source: "course",
  addedAt: 0,
};

const YOUTUBE_EMBED =
  "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1";

/** A fresh visit to the tab — new component state, same browser storage. */
function mount(options = {}) {
  fixture.mountMusic(host(), { courseAudio: [COURSE_TRACK, COURSE_TRACK_2], ...options });
}

// Every test starts offline; a test that wants an answer sets its own responder.
beforeEach(() => {
  fetchResponder = () => Promise.reject(new Error("offline"));
  pickerOpens = 0;
  paneWidth = 900;
  paneHeight = 800;
  // No master key unless a test asks for one.
  delete globalThis.__DC_YOUTUBE_API_KEY__;
});

after(() => {
  fixture.unmountMusic();
  window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── the tests ───────────────────────────────────────────────────────────── */

test("the tab opens on the library page: the search bar, then the white tray, All first", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  assert.ok(Boolean(q("[data-course-music-panel]")), "the pane renders");
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "library");
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "all");
  assert.ok(Boolean(q("[data-music-searchbar]")), "a YouTube-style search bar takes the header's place");
  assert.ok(Boolean(q("[data-music-tray]")), "…and the tray sits under it");
  assert.equal(q("[data-music-tray]").getAttribute("data-music-tray-theme"), "white");
  // The bar really is ABOVE the tray.
  const bar = q("[data-music-searchbar]");
  const tray = q("[data-music-tray]");
  assert.equal(bar.compareDocumentPosition(tray) & window.Node.DOCUMENT_POSITION_FOLLOWING, window.Node.DOCUMENT_POSITION_FOLLOWING, "the tray follows the bar");
  // All FIRST, then the four the page has always had plus the NEW URL button.
  assert.equal(
    qa("[data-music-filters] [data-music-filter]").map((el) => el.getAttribute("data-music-filter")).join(","),
    "all,course,device,online,url",
  );
  assert.equal(q('[data-music-filters] [data-music-filter="all"]').getAttribute("data-active"), "true");
  assert.equal(q('[data-music-filters] [data-music-filter="url"]').getAttribute("data-active"), "false");
  // The library page is where the footer navigation belongs.
  assert.equal(fixture.panelSession().musicView, "library");
  assert.ok(Boolean(q('[data-music-library="page"]')), "the library is the page itself — no sheet, no pill button");
  assert.equal(Boolean(q("[data-music-library-toggle]")), false, "the old floating Library button is gone");
});

test("an empty library says the right thing in every filter, and All centres its options", async () => {
  window.localStorage.clear();
  mount({ courseAudio: [] });
  await settle();

  // All + nothing at all → the centred column of ways to start.
  assert.ok(Boolean(q("[data-music-start-options]")), "the All filter opens the start column");
  assert.match(text("[data-music-start-options]"), /Search to view library/);
  assert.equal(
    qa("[data-music-start-option]").map((el) => el.getAttribute("data-music-start-option")).join(","),
    "search-online,device,course,url",
  );

  await click(q('[data-music-filter="course"]'));
  await settle();
  assert.equal(text("[data-music-empty-page]"), "There is no audio from this course.Is course mein abhi koi audio lesson nahin hai.");
  assert.equal(Boolean(q("[data-music-start-options]")), false);

  await click(q('[data-music-filter="device"]'));
  await settle();
  assert.match(text("[data-music-empty-page]"), /There is no music from this device yet\./);

  await click(q('[data-music-filter="online"]'));
  await settle();
  assert.match(text("[data-music-empty-page]"), /There is no online music yet\./);

  await click(q('[data-music-filter="url"]'));
  await settle();
  assert.match(text("[data-music-empty-page]"), /There is no saved link yet\./);
  // The URL filter turns the search box into a URL input.
  assert.ok(Boolean(q("[data-music-url]")), "the one box became a URL input");
  assert.equal(Boolean(q("[data-music-search]")), false);

  await click(q('[data-music-filter="all"]'));
  await settle();
  assert.ok(Boolean(q("[data-music-start-options]")), "back on All, the start column is there again");
});

test("the All column starts a filter, and the Device filter owns the ＋ button", async () => {
  window.localStorage.clear();
  mount({ courseAudio: [] });
  await settle();

  // No ＋ button until the learner is IN the device filter.
  assert.equal(Boolean(q("[data-music-add-fab]")), false);
  await click(q('[data-music-start-option="device"]'));
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "device");
  assert.ok(Boolean(q("[data-music-add-fab]")), "the device filter shows the bottom-right ＋");
  assert.equal(pickerOpens > 0, true, "choosing Device from the column opens the learner's picker");

  // The ＋ opens the file picker; no other filter keeps it.
  const before = pickerOpens;
  await click(q("[data-music-add-fab]"));
  assert.equal(pickerOpens, before + 1);
  await click(q('[data-music-filter="course"]'));
  await settle();
  assert.equal(Boolean(q("[data-music-add-fab]")), false);

  // The URL row routes to the URL filter (the box is ready to paste).
  await click(q('[data-music-filter="all"]'));
  await settle();
  await click(q('[data-music-start-option="url"]'));
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "url");
  assert.ok(Boolean(q("[data-music-url]")));
});

test("the one search box filters the filter's own shelf — and All lists every shelf", async () => {
  window.localStorage.clear();
  mount();
  await settle();

  // A library with music in it never shows the start column.
  assert.equal(Boolean(q("[data-music-start-options]")), false);
  assert.equal(Boolean(q("[data-music-section=\"course\"]")), true);
  assert.equal(q('[data-music-section="course"]').getAttribute("data-music-section-count"), "2");
  assert.ok(Boolean(q('[data-music-track="course-f1"]')), "the course audio is listed");

  await click(q('[data-music-filter="course"]'));
  await settle();
  assert.equal(q('[data-music-section="course"]').getAttribute("data-music-section-count"), "2");
  assert.equal(Boolean(q('[data-music-section="link"]')), false, "Course shows only the course shelf");

  typeInto(q("[data-music-search]"), "outro");
  await settle();
  assert.equal(q('[data-music-section="course"]').getAttribute("data-music-section-count"), "1");
  assert.equal(Boolean(q('[data-music-track="course-f1"]')), false);

  await click(q('[data-music-filter="device"]'));
  await settle();
  // The query is dropped when the filter changes: each filter starts clean.
  assert.equal(q("[data-music-search]").value, "");
  assert.match(text("[data-music-empty-page]"), /There is no music from this device yet\./);
});

test("the URL filter adds a link with the arrow, and it plays in the official embed", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  await click(q('[data-music-filter="url"]'));
  await settle();

  typeInto(q("[data-music-url]"), "https://youtu.be/dQw4w9WgXcQ?si=abc");
  await settle();
  // The arrow appears with the text ("jaise hi user inter kare … arrow ka nishan").
  assert.ok(Boolean(q("[data-music-url-add]")), "the arrow is there once there is something to add");

  await submitForm();
  await settle();

  // Enter/the arrow plays it straight away — in the platform's own player.
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "player");
  assert.equal(fixture.panelSession().musicView, "player", "an open player hides the footer");
  const frame = q('[data-music-embed="youtube"]');
  assert.ok(Boolean(frame), "the official embed takes over");
  assert.equal(frame.getAttribute("src"), YOUTUBE_EMBED);
  assert.match(frame.getAttribute("allow"), /encrypted-media/);
  assert.equal(frame.hasAttribute("allowfullscreen"), true);
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-stage"), "youtube");

  // …and the link is on the shelf for the next visit.
  const saved = JSON.parse(window.localStorage.getItem("dc.music.library.v1:learner-1"));
  assert.equal(saved.tracks.length, 1);
  assert.equal(saved.tracks[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

  // A link we cannot play is refused with a sentence, and stores nothing.
  // The player carries no overlay chrome any more (owner, 2026-10-16) — the
  // way back to the library is the compact search bar's arrow, which lands
  // on the full library page.
  await click(q("[data-music-open-library]"));
  await settle();
  assert.equal(fixture.panelSession().musicView, "library");
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "all", "the arrow lands on the full library");
  await click(q('[data-music-filter="url"]'));
  await settle();
  typeInto(q("[data-music-url]"), "https://example.test/some/page.html");
  await submitForm();
  await settle();
  assert.match(text("[data-music-notice]"), /not playable here/);
  assert.equal(JSON.parse(window.localStorage.getItem("dc.music.library.v1:learner-1")).tracks.length, 1);
});

test("an audio tap opens the lesson player at FULL AREA — no card, back arrow, library glyph", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  const row = q('[data-music-track="course-f1"]');
  assert.ok(Boolean(row), "the course shelf lists the lesson's audio");
  await click(row.querySelector('button[aria-label^="Play"]'));
  await settle();

  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "player");
  assert.equal(fixture.panelSession().musicView, "player");
  assert.ok(Boolean(q('[data-music-player="audio"]')), "the Music page's player is the audio one");
  // The REAL glass player, in its page (not card) presentation.
  assert.ok(Boolean(q("[data-course-audio-player]")), "the REAL glass player mounts");
  assert.ok(Boolean(q("[data-course-audio-disc]")), "…with its vinyl");
  assert.equal(q("[data-course-audio-player]").getAttribute("data-audio-full-player"), "true");
  assert.equal(Boolean(q("[data-course-music-player]")), false, "…and no card wrapper at all");
  assert.equal(Boolean(q("[data-music-library=\"page\"]")), false, "the library page gives way to the player");
  // Top-left is the BACK arrow now; the library glyph sits on the same row.
  const back = q("[data-course-audio-back]");
  assert.ok(Boolean(back), "the top-left control is the back arrow");
  assert.equal(back.getAttribute("aria-label"), "Back to library");
  assert.ok(Boolean(q("[data-course-audio-library]")), "a library glyph is on the player");

  // The glyph opens the library OVER the player — the same audio element keeps
  // playing (a song must not stop because the learner browsed).
  const audioBefore = q("[data-course-audio-element]");
  await click(q("[data-course-audio-library]"));
  await settle();
  assert.ok(Boolean(q("[data-music-library-panel]")), "the library opens over the player");
  assert.equal(Boolean(q('[data-music-library="sheet"]')), true);
  assert.ok(Boolean(q("[data-music-searchbar]")), "…with the same search box");
  assert.equal(q("[data-course-audio-element]") === audioBefore, true, "the same audio element keeps its playback");

  // …and its arrow goes straight to the full library page (still playing).
  assert.ok(Boolean(q("[data-music-library-panel] [data-music-open-library]")), "the panel carries the full-page shortcut");
  await click(q("[data-music-library-panel] [data-music-open-library]"));
  await settle();
  assert.equal(Boolean(q("[data-music-library-panel]")), false);
  assert.ok(Boolean(q('[data-music-library="page"]')), "…the full library page");
  assert.equal(q("[data-course-audio-element]") === audioBefore, true, "and the song never stopped");

  // The library glyph opens the panel again — the close button shuts it.
  await click(q("[data-course-audio-library]"));
  await settle();
  assert.ok(Boolean(q("[data-music-library-panel]")));
  await click(q("[data-music-panel-close]"));
  await settle();
  assert.equal(Boolean(q("[data-music-library-panel]")), false);

  // The back arrow returns to the library page — without unmounting the song.
  await click(q("[data-course-audio-back]"));
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "library");
  assert.equal(fixture.panelSession().musicView, "library", "the footer navigation comes back");
  assert.ok(Boolean(q('[data-music-library="page"]')));
  assert.equal(q("[data-course-audio-element]") === audioBefore, true, "the song is still mounted, just hidden");
});

test("a video opens compact: official player, a draggable divider, the library below", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  await click(q('[data-music-filter="url"]'));
  await settle();
  typeInto(q("[data-music-url]"), "https://youtu.be/dQw4w9WgXcQ");
  await submitForm();
  await settle();

  // The library is the LOWER half, and the divider really separates them.
  assert.ok(Boolean(q("[data-music-player-divider]")), "the divider exists");
  assert.ok(Boolean(q("[data-music-video-library]")), "the library is below the player");
  const divider = q("[data-music-player-divider]");
  assert.equal(divider.getAttribute("role"), "separator");
  assert.equal(divider.getAttribute("aria-orientation"), "horizontal");
  // It is COMPACT by default: nothing is full screen.
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "player");
  assert.equal(q('[data-music-player="video"]').getAttribute("data-music-video-fullscreen"), "false");

  // The compact search bar is shorter and carries the arrow to the full page.
  assert.ok(Boolean(q("[data-music-open-library]")), "the arrow to the full library page");
  assert.equal(q("[data-music-searchbar]").getAttribute("data-music-searchbar-layout"), "common".replace("common", "compact"));

  // ── Drag the divider: 100px → 400px of an 800px stage = 50%.
  const topBefore = q("[data-music-video-pane]");
  assert.equal(Number.isFinite(Number.parseFloat(topBefore.style.flexGrow)), true);
  await act(async () => {
    divider.dispatchEvent(pointerEvent("pointerdown", 400, 100, 7));
    divider.dispatchEvent(pointerEvent("pointermove", 400, 400, 7));
  });
  assert.equal(Number.parseFloat(q("[data-music-video-pane]").style.flexGrow), 50, "the live drag writes the new share");
  await act(async () => {
    divider.dispatchEvent(pointerEvent("pointerup", 400, 400, 7));
  });
  await settle();
  assert.equal(q("[data-music-player-divider]").getAttribute("aria-valuenow"), "50", "…and it is committed");

  // ── The overlay chrome is GONE ENTIRELY (owner, 2026-10-16): no extra
  //    full-screen button, no title strip, no left-side back button — the
  //    YouTube player owns its whole surface; the compact search bar's
  //    arrow is the way back to the library.
  assert.equal(q("[data-music-fullscreen-toggle]"), null, "no second full-screen button");
  assert.equal(q("[data-music-player-chrome]"), null, "no overlay chrome at all on the player");
  assert.ok(Boolean(q('[data-music-embed="youtube"]')), "the official player keeps playing");

  // ── The search box and the filter tray live INSIDE the library's scroller
  //    under a playing video, so they scroll away with the page itself.
  assert.ok(Boolean(q('[data-music-video-library] [data-music-body] [data-music-searchbar]')), "the box is in the scroll flow");
  assert.ok(Boolean(q('[data-music-video-library] [data-music-body] [data-music-tray]')), "…and the tray with it");
  assert.equal(q('[data-music-video-library] [data-music-tray]').getAttribute("data-music-tray-away"), "false", "in flow it never collapses on its own");

  // ── The arrow in the compact search bar jumps to the full library page.
  await click(q("[data-music-open-library]"));
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-view"), "library");
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "all");
  assert.ok(Boolean(q('[data-music-library="page"]')), "…the full-page library");
  assert.equal(fixture.panelSession().musicView, "library");
  assert.ok(Boolean(q('[data-music-track]')), "and the saved link is on the shelf");
});

test("online search keeps what the learner looked at, with clean artwork", async () => {
  window.localStorage.clear();
  // The owner's override slot — the same switch `VITE_YOUTUBE_API_KEY` feeds.
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } },
        { id: { videoId: "9bZkp7q19f0" }, snippet: { title: "GANGNAM STYLE", channelTitle: "officialpsy" } },
      ],
    }),
  });
  mount({ courseAudio: [] });
  await settle();
  assert.equal(q("[data-music-searchbar]").getAttribute("data-music-search-mode"), "api");
  assert.ok(Boolean(q("[data-music-search-run]")), "with a key the pane searches inside itself");

  // The Enter control is INSIDE the pill, on its right — and it is the form's
  // own submit, so the keyboard's Enter runs the very same search.
  const pill = q("[data-music-searchbar] > span");
  const enter = q("[data-music-search-run]");
  assert.equal(Boolean(pill && enter && pill.contains(enter)), true, "the Enter button lives inside the box");
  assert.equal(enter.getAttribute("type"), "submit");

  typeInto(q("[data-music-search]"), "koi bhi gaana");
  const startedAt = Date.now();
  await click(enter);
  // A full second of flash scan even though this fetch answers instantly…
  await settle(60);
  assert.equal(Boolean(q("[data-dc-flash-scan]")), true, "the flash scan holds the page while the search is in flight");
  assert.equal(Boolean(q("[data-music-result]")), false, "no result may land before the floor");
  // …and then the results, with the scan gone.
  await settle(1100);
  assert.ok(Date.now() - startedAt >= 1000, "the one-second floor really elapsed");
  assert.equal(Boolean(q("[data-dc-flash-scan]")), false, "the scan ends when the results do");

  // A search IS an online act: the results land in the online list.
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-filter"), "online");
  const results = qa("[data-music-result]");
  assert.equal(results.length, 2);
  assert.match(results[0].textContent, /Never Gonna Give You Up/);

  // The artwork is a real <img>, edge to edge — nothing washed over it.
  const image = q("[data-music-result-thumbnail] img");
  assert.ok(Boolean(image));
  assert.equal(image.getAttribute("src"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.match(image.className, /object-cover/);
  let node = image.parentElement;
  while (node && node !== window.document.body) {
    assert.doesNotMatch(String(node.className || ""), /bg-white\//, "no white layer over the picture");
    node = node.parentElement;
  }
  assert.equal(Boolean(q("[data-music-result-thumbnail] img")), true, "no overlay element replaces it");

  // Leaving Online and coming back keeps what was searched.
  await click(q('[data-music-filter="course"]'));
  await settle();
  assert.equal(Boolean(q("[data-music-result]")), false);
  await click(q('[data-music-filter="online"]'));
  await settle();
  assert.equal(qa("[data-music-result]").length, 2, "online keeps the results the learner has seen");
  assert.match(text("[data-music-results]"), /koi bhi gaana/);

  // …and All shows them too: a searched library is not an empty one.
  await click(q('[data-music-filter="all"]'));
  await settle();
  assert.equal(Boolean(q("[data-music-start-options]")), false, "the start column belongs to an EMPTY library");
  assert.equal(qa("[data-music-result]").length, 2);
  await click(q('[data-music-filter="online"]'));
  await settle();

  // Tapping one plays it here AND keeps it on the shelf.
  await click(qa("[data-music-result]")[1].querySelector('button[aria-label^="Play"]'));
  await settle();
  assert.match(q('[data-music-embed="youtube"]').getAttribute("src"), /youtube-nocookie\.com\/embed\/9bZkp7q19f0/);
  const saved = JSON.parse(window.localStorage.getItem("dc.music.library.v1:learner-1"));
  assert.equal(saved.tracks.length, 1);
  assert.equal(saved.tracks[0].url, "https://www.youtube.com/watch?v=9bZkp7q19f0");
  // …saved AS the provider described it (owner, 2026-10-16): the real name,
  // the real channel and the artwork — never a generic "YouTube video" row
  // with no photo in the All list.
  assert.equal(saved.tracks[0].title, "GANGNAM STYLE");
  assert.equal(saved.tracks[0].subtitle, "officialpsy");
  assert.equal(saved.tracks[0].thumbnailUrl, "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg");

  // The saved shelf row shows BOTH the name and the picture. The chrome-less
  // player's way back is the compact bar's arrow to the full library page.
  await click(q("[data-music-open-library]"));
  await settle();
  await click(q('[data-music-filter="all"]'));
  await settle();
  const shelfRow = q('[data-music-track][data-music-track-source="link"]');
  assert.ok(Boolean(shelfRow), "the played result is on the shelf");
  assert.match(shelfRow.textContent, /GANGNAM STYLE/);
  const shelfArt = shelfRow.querySelector("[data-music-track-thumbnail]");
  assert.ok(Boolean(shelfArt), "with its artwork");
  assert.equal(shelfArt.getAttribute("src"), "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg");
  // The list row's artwork frame is a real block — a zero-size inline span
  // was exactly the "photo nahin dikhta" bug.
  assert.match(String(shelfArt.closest("[data-music-artwork]").className), /\bblock\b|\bgrid\b/);
});

test("with no key the query goes to YouTube itself — and never from the URL box", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  typeInto(q("[data-music-search]"), "arijit singh songs");
  await settle();
  const link = q("[data-music-search-external]");
  assert.ok(Boolean(link), "an anchor, not a silent button");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  assert.equal(link.getAttribute("href"), "https://www.youtube.com/results?search_query=arijit%20singh%20songs");
  assert.equal(Boolean(q("[data-music-search-run]")), false);

  // The URL filter is a paste box, never a search hand-off.
  await click(q('[data-music-filter="url"]'));
  await settle();
  assert.equal(Boolean(q("[data-music-search-external]")), false);
  assert.ok(Boolean(q("[data-music-url]")));

  // A key that finds nothing says so and offers the hand-off.
  await click(q('[data-music-filter="online"]'));
  await settle();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  await act(async () => { window.dispatchEvent(new window.Event("dc:music-youtube-key")); });
  await settle();
  fetchResponder = () => ({ ok: false, status: 403, json: () => Promise.resolve({}) });
  typeInto(q("[data-music-search]"), "quota khatam");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  assert.ok(Boolean(q("[data-music-no-results]")), "the pane says so");
  assert.match(text("[data-music-notice]"), /quota ya network/);
  assert.equal(q("[data-music-no-results] a").getAttribute("href"), "https://www.youtube.com/results?search_query=quota%20khatam");
});

test("the pane's shape follows the PANE, not the viewport", async () => {
  window.localStorage.clear();
  // A narrow split column (a phone, or a hard-dragged divider) → rows.
  paneWidth = 380;
  mount();
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-layout"), "compact");
  await click(q('[data-music-filter="url"]'));
  await settle();
  typeInto(q("[data-music-url]"), "https://cdn.example.test/Filter_Song.mp3");
  await submitForm();
  await settle();
  await click(q("[data-course-audio-back]"));
  await settle();
  assert.equal(q('[data-music-list="list"]')?.getAttribute("data-music-list"), "list", "a narrow pane lists rows");

  // A wide pane gets the thumbnail grid (and a fresh visit to prove it).
  paneWidth = 1200;
  mount({ key: "wide-visit" });
  await settle();
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-layout"), "wide");
  assert.equal(q('[data-music-list="grid"]')?.getAttribute("data-music-list"), "grid", "a wide pane shows thumbnail cards");
  assert.equal(q("[data-music-open-library]"), null, "the full library page needs no shortcut for itself");
});

test("an empty library search remembers the query, and shows it back YouTube-style", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  await act(async () => { window.dispatchEvent(new window.Event("dc:music-youtube-key")); });
  await settle();
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } }],
    }),
  });

  await click(q('[data-music-filter="online"]'));
  await settle();
  typeInto(q("[data-music-search]"), "purane gaane");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  assert.equal(qa("[data-music-result]").length, 1);

  // The query is on this device's own history list…
  const stored = JSON.parse(window.localStorage.getItem("dc.searchHistory.v1.course-music"));
  assert.deepEqual(stored, ["purane gaane"]);

  // …and clearing the box with the caret in it brings it back, in YouTube's
  // own shape: a heading, one row per search, a remove control, and Clear.
  await click(q('[data-music-searchbar] button[aria-label="Clear the search box"]'));
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(Boolean(q("[data-dc-search-history]")), true, "the history list appears");
  assert.equal(Boolean(q("[data-dc-history-clear]")), true, "…with YouTube's Clear button");
  const rows = qa("[data-dc-history-entry]");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].getAttribute("data-dc-history-entry"), "purane gaane");
  assert.equal(Boolean(q("[data-dc-history-pick]")), true);

  // Picking one runs it again — through the very same search.
  await click(q("[data-dc-history-pick]"));
  await settle(1200);
  assert.equal(qa("[data-music-result]").length, 1);
  assert.equal(q("[data-music-search]").value, "purane gaane");
});

test("the format button converts ITSELF: one tap, the other listing", async () => {
  window.localStorage.clear();
  mount({ courseAudio: [] });
  await settle();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  await act(async () => { window.dispatchEvent(new window.Event("dc:music-youtube-key")); });
  await settle();
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } },
        { id: { videoId: "9bZkp7q19f0" }, snippet: { title: "GANGNAM STYLE", channelTitle: "officialpsy" } },
      ],
    }),
  });
  await click(q('[data-music-filter="online"]'));
  await settle();
  typeInto(q("[data-music-search]"), "thoda gaana");
  await click(q("[data-music-search-run]"));
  await settle(1200);

  assert.equal(qa("[data-music-result]").length, 2);
  // The listing wears one of the two formats — the music library's own two…
  const first = q('[data-music-list="list"]') ? "list" : "grid";
  const other = first === "list" ? "grid" : "list";
  // …and the ONE control on the tray promises the OTHER one, with nothing else
  // on screen: no menu, no second option.
  const toggle = q("[data-music-search-format-toggle]");
  assert.ok(Boolean(toggle), "a single self-convertible control");
  assert.equal(toggle.getAttribute("data-music-search-format-next"), other);
  assert.equal(Boolean(q("[data-music-view-option]")), false, "no options are ever shown");

  await click(toggle);
  await settle();
  assert.equal(Boolean(q(`[data-music-list="${other}"]`)), true, "the listing converted with the button");
  assert.equal(q("[data-music-search-format-toggle]").getAttribute("data-music-search-format-next"), first);
  assert.equal(qa("[data-music-result]").length, 2);

  await click(q("[data-music-search-format-toggle]"));
  await settle();
  assert.equal(Boolean(q(`[data-music-list="${first}"]`)), true, "and back");
});

test("the idle box slides the shared sentence, and the filter's placeholder returns on focus", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  const slide = q("[data-dc-slide]");
  assert.ok(Boolean(slide), "the long sentence rides in the box");
  assert.match(slide.textContent, /Search your favourite lecture on YouTube/);
  // jsdom has no layout engine: width 0 means it never had to slide.
  assert.equal(q("[data-music-search]").hasAttribute("data-dc-slide-active"), false);

  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(Boolean(q("[data-dc-slide]")), false, "the caret hands the box back to the filter's own placeholder");
  assert.equal(q("[data-music-search]").getAttribute("placeholder"), "Songs, videos, course — dhoondo…");
});

test("the music search page takes the footer, the results give it back, a scroll down steps it away", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } }],
    }),
  });
  mount({ courseAudio: [] });
  await settle();

  // The music LIBRARY page keeps the footer navigation (the owner's rule).
  assert.equal(fixture.panelSession().musicSearch, "closed");

  // The flash scan IS the search page — the footer is away there too, and not
  // because a player opened (musicView is still "library").
  typeInto(q("[data-music-search]"), "purane gaane");
  await click(q("[data-music-search-run]"));
  await settle(60);
  assert.equal(fixture.panelSession().musicSearch, "page", "the search page takes the footer");
  assert.equal(fixture.panelSession().musicView, "library");

  // The results give it back, at the top of the page.
  await settle(1200);
  assert.equal(fixture.panelSession().musicSearch, "results");
  assert.equal(fixture.panelSession().musicSearchScrolledAway, false);

  // "Scroll down kare to hide ho jaye, wapas top par aate hi dikh jaye."
  const body = q("[data-music-body]");
  const scrollTo = async (top, expected) => {
    await act(async () => {
      body.scrollTop = top;
      body.dispatchEvent(new window.Event("scroll", { bubbles: true }));
      const deadline = Date.now() + 600;
      while (Date.now() < deadline && fixture.panelSession().musicSearchScrolledAway !== expected) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });
  };
  await scrollTo(180, true);
  assert.equal(fixture.panelSession().musicSearchScrolledAway, true, "scrolled down → away");
  await scrollTo(0, false);
  assert.equal(fixture.panelSession().musicSearchScrolledAway, false, "back at the top → shown again");

  // …and the ready-to-write box with the recent searches under it is the
  // search PAGE again, not a results page.
  await click(q('[data-music-searchbar] button[aria-label="Clear the search box"]'));
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(Boolean(q("[data-dc-search-history]")), true, "the history list is up");
  assert.equal(fixture.panelSession().musicSearch, "page", "the search page takes the footer again");
  assert.equal(fixture.panelSession().musicSearchScrolledAway, false, "…and never stays scrolled away");
});

test("the key is configured in SETTINGS — the Course Player only says WHY a search failed", async () => {
  window.localStorage.clear();
  mount();
  await settle();

  // No configuration UI lives in the Course Player any more — the key is set
  // up in Settings, so the school can keep its billing account switched off.
  assert.equal(q("[data-music-youtube-key-toggle]"), null, "no key button in the pane");
  assert.equal(q("[data-you-tube-key-card]"), null, "no key card in the pane");

  // A key that the API refuses still has to SAY WHY, and point at Settings.
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  await act(async () => { window.dispatchEvent(new window.Event("dc:music-youtube-key")); });
  await settle();
  fetchResponder = () => ({
    ok: false,
    status: 403,
    json: () => Promise.resolve({ error: { code: 403, message: "Quota exceeded", errors: [{ reason: "quotaExceeded" }] } }),
  });
  typeInto(q("[data-music-search]"), "koi bhi gaana");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  const banner = q("[data-music-search-error]");
  assert.ok(Boolean(banner), "the failure is announced");
  assert.equal(banner.getAttribute("data-music-search-error-code"), "quota",
    "and it names the REAL reason — a dead quota is not the same as no results");
  assert.match(banner.textContent, /Settings/, "and it points at the place that configures the key");
});

test("the quota handover: the master's key takes over and the search simply goes on", async () => {
  window.localStorage.clear();
  // The learner's own key, and the school's (the master's) key.
  window.localStorage.setItem("dc.music.youtubeKey", "learner-key");
  globalThis.__DC_YOUTUBE_API_KEY__ = "owner-key";
  fetchResponder = (url) => {
    const key = new URL(String(url)).searchParams.get("key");
    if (key === "learner-key") {
      return {
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }),
      };
    }
    return {
      ok: true,
      json: () => Promise.resolve({
        items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } }],
      }),
    };
  };
  mount({ courseAudio: [] });
  await settle();

  await click(q('[data-music-filter="online"]'));
  await settle();
  typeInto(q("[data-music-search]"), "koi bhi gaana");
  await click(q("[data-music-search-run]"));
  await settle(1200);

  // The results arrived — no error, no interruption.
  assert.equal(qa("[data-music-result]").length, 1, "the results are on screen");
  assert.equal(Boolean(q("[data-music-search-error]")), false, "and there is NO error banner");
  // One quiet line says what happened.
  const note = q("[data-music-search-fallback]");
  assert.ok(Boolean(note), "the handover is mentioned, once, quietly");
  assert.match(note.textContent, /master/i);
});

test("the music library's search box opens the YouTube search page — on EVERY surface", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } }],
    }),
  });
  mount({ courseAudio: [COURSE_TRACK] });
  await settle();

  // ── 1. THE PAGE: the library page's own box opens the search page. ──────
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(q('[data-music-library="page"]').getAttribute("data-music-search-page"), "open",
    "a tap in the box opens the YouTube search page");
  assert.ok(Boolean(q("[data-music-search-back]")), "with its own back arrow in the header");
  // …and the results page opens from there.
  typeInto(q("[data-music-search]"), "purane gaane");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  assert.equal(qa("[data-music-result]").length, 1, "the results page opens");
  // …and the back arrow walks back to the board, then to the library.
  await click(q("[data-music-search-back]"));
  await settle();
  assert.ok(Boolean(q("[data-dc-search-history]")), "the board is back");
  await click(q("[data-music-search-back]"));
  await settle();
  assert.equal(q('[data-music-library="page"]').getAttribute("data-music-search-page"), "closed",
    "and the second back returns to the library");

  // ── 2. THE PANEL over the player — the one whose header says "Music
  //       library". Its box opens the very same search page. ──────────────
  // (a search is an online act, so the shelf filter is back on "online")
  await click(q('[data-music-filter="course"]'));
  await settle();
  await click(q('[data-music-track="course-f1"] button[aria-label^="Play"]'));
  await settle();
  await click(q("[data-course-audio-library]"));
  await settle();
  const sheet = '[data-music-library="sheet"]';
  assert.ok(Boolean(q(`${sheet} [data-music-search]`)), "the panel carries the same search box");
  await act(async () => { q(`${sheet} [data-music-search]`).focus(); });
  await settle();
  assert.equal(q(sheet).getAttribute("data-music-search-page"), "open",
    "the panel's box opens the YouTube search page too");
  assert.ok(Boolean(q(`${sheet} [data-music-search-back]`)), "with its own back arrow");

  // The results page opens from there as well.
  typeInto(q(`${sheet} [data-music-search]`), "purane gaane");
  await click(q(`${sheet} [data-music-search-run]`));
  await settle(1200);
  assert.equal(qa(`${sheet} [data-music-result]`).length, 1, "the results page opens in the panel");
  await click(q(`${sheet} [data-music-search-back]`));
  await settle();
  assert.equal(qa(`${sheet} [data-music-result]`).length, 0, "the back arrow steps back to the board");
  assert.ok(Boolean(q(`${sheet} [data-dc-search-history]`)));

  // ── 3. THE HALF UNDER A PLAYING VIDEO — the compact bar opens it too. ──
  await click(q("[data-music-open-library]"));
  await settle();
  // The search page is still open (on its board) — close it, the way the
  // learner would: the back arrow walks the board, then the library.
  await click(q("[data-music-search-back]"));
  await settle();
  assert.equal(Boolean(q("[data-music-search-back]")), false, "the search page is closed");
  await click(q('[data-music-filter="url"]'));
  await settle();
  typeInto(q("[data-music-url]"), "https://youtu.be/dQw4w9WgXcQ");
  await submitForm();
  await settle();
  const video = '[data-music-library="video"]';
  // The URL filter turned the box into a paste box — the shelf goes back to
  // "All", and the box is a search box again.
  await click(q(`${video} [data-music-filter="all"]`));
  await settle();
  assert.ok(Boolean(q(`${video} [data-music-search]`)), "the half under the video carries the same box");
  await act(async () => { q(`${video} [data-music-search]`).focus(); });
  await settle();
  assert.equal(q(video).getAttribute("data-music-search-page"), "open",
    "the compact bar opens the YouTube search page as well");
  assert.ok(Boolean(q(`${video} [data-music-search-back]`)), "with its own back arrow");
});

test("the search page's back walks TWO steps: results → board → library", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({
    ok: true,
    json: () => Promise.resolve({
      items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Never Gonna Give You Up", channelTitle: "Rick Astley" } }],
    }),
  });
  mount({ courseAudio: [] });
  await settle();

  // The search page opens with the box ready to write — the BOARD.
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(q("[data-music-library]").getAttribute("data-music-search-page"), "open",
    "the search page is open");
  assert.ok(Boolean(q("[data-music-search-back]")), "with its own back arrow in the header");

  // A search RUN lands on the RESULTS.
  typeInto(q("[data-music-search]"), "purane gaane");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  assert.equal(qa("[data-music-result]").length, 1, "the results are on screen");
  assert.equal(q("[data-music-search-back]").getAttribute("data-music-search-back-step"), "results",
    "the back arrow now knows it is on the results");

  // The FIRST back goes to the board — the recent searches, the box waiting.
  await click(q("[data-music-search-back]"));
  await settle();
  assert.equal(q("[data-music-library]").getAttribute("data-music-search-page"), "open",
    "the search page is still open");
  assert.equal(qa("[data-music-result]").length, 0, "the results stepped aside");
  assert.ok(Boolean(q("[data-dc-search-history]")), "the recent-searches board is back");
  assert.equal(q("[data-music-search-back]").getAttribute("data-music-search-back-step"), "board",
    "the back arrow now knows it is on the board");

  // The SECOND back closes the page and returns to the library.
  await click(q("[data-music-search-back]"));
  await settle();
  assert.equal(q("[data-music-library]").getAttribute("data-music-search-page"), "closed",
    "the search page is closed");
  assert.ok(Boolean(q("[data-music-filter]")), "the library's own tray is back");

  // And tapping the search BOX on the results walks back the same way.
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  typeInto(q("[data-music-search]"), "purane gaane");
  await click(q("[data-music-search-run]"));
  await settle(1200);
  assert.equal(qa("[data-music-result]").length, 1);
  await act(async () => { q("[data-music-search]").focus(); });
  await settle();
  assert.equal(qa("[data-music-result]").length, 0,
    "the box on the results takes the learner back to the board");
  assert.equal(q("[data-music-library]").getAttribute("data-music-search-page"), "open");
});
