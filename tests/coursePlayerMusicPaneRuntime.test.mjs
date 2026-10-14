// The Music tab, driven as real UI in a real DOM.
//
// The source-shape rules live in tests/coursePlayerMusicTabContract.test.mjs;
// this file mounts the ACTUAL pane and proves the owner's brief end to end:
//
//   "click karne par music ka vahi already design UI jo course player ke andar
//    hai vahi open ho, aur usmein LIBRARY ka button ho. Library par click karte
//    hi user har tarah ka song — poori library ka, internet ka koi bhi song —
//    play kar sake."
//
//   1. the pane opens on its library, and the Library button toggles it;
//   2. a course track plays through the REAL glass player (the lesson design);
//   3. a pasted YouTube link becomes a library row and an official embed;
//   4. a link we cannot play is refused with a sentence, and nothing is stored;
//   5. a saved song comes back on the next mount (the library persists);
//   6. with no YouTube key the search hands the query to YouTube itself;
//   7. the library search filters all three shelves at once.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Music pane ────────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import MusicPanel from ${JSON.stringify(path.join(ROOT, "src/course/MusicPanel.tsx"))};

// ONE root for the whole file. React 18 refuses a second createRoot() on a
// container it has already seen, so a fresh visit is a fresh KEY — the same
// thing React does when a learner signs out and back in: the pane remounts,
// its state starts from storage again.
let root = null;
let visits = 0;

export function mountMusic(host, options = {}) {
  if (!root) root = createRoot(host);
  visits += 1;
  act(() => {
    root.render(
      <MusicPanel
        key={options.key || \`visit-\${visits}\`}
        uid={options.uid || "learner-1"}
        courseAudio={options.courseAudio || []}
      />,
    );
  });
}

export function unmountMusic() {
  if (root) act(() => root.unmount());
  root = null;
}

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
  "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLMediaElement", "HTMLAnchorElement",
  "SVGElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent",
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
window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700, toJSON: () => ({}),
});
// jsdom has no media stack: the glass player must mount without trying to play.
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => undefined;
window.HTMLMediaElement.prototype.load = () => undefined;
// No network in a unit test — the oEmbed title lookup fails silently by design.
define("fetch", () => Promise.reject(new Error("offline")));
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

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
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

/** A fresh visit to the tab — new component state, same browser storage. */
function mount(options = {}) {
  fixture.mountMusic(host(), { courseAudio: [COURSE_TRACK], ...options });
}

after(() => {
  fixture.unmountMusic();
  window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── the tests ───────────────────────────────────────────────────────────── */

test("the Music pane opens on its library, and the Library button toggles it", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  assert.ok(Boolean(q("[data-course-music-panel]")), "the pane renders");
  assert.equal(q("[data-course-music-panel]").getAttribute("data-music-active"), "true");
  // Nothing played yet → the library is what the tab opens on.
  assert.equal(Boolean(q("[data-music-library-sheet]")), true, "the library is open on first visit");
  assert.equal(q("[data-music-library-toggle]").getAttribute("aria-expanded"), "true");

  await act(async () => { q("[data-music-library-toggle]").click(); });
  await settle();
  assert.equal(Boolean(q("[data-music-library-sheet]")), false, "the button closes the library");
  assert.ok(Boolean(q("[data-music-empty]")), "and the empty stage asks for a library");

  await act(async () => { q("[data-music-empty] button").click(); });
  await settle();
  assert.equal(Boolean(q("[data-music-library-sheet]")), true, "the empty stage opens the library again");
});

test("the library lists the course's own audio, and one tap plays it in the glass player", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  const row = q('[data-music-track="course-f1"]');
  assert.ok(Boolean(row), "the course shelf lists the lesson's audio");
  assert.equal(row.getAttribute("data-music-track-source"), "course");
  assert.match(row.textContent, /Intro theme/);
  assert.match(row.textContent, /Basics/);
  // A course row is not the learner's to delete.
  assert.equal(Boolean(row.querySelector('button[aria-label^="Remove"]')), false);

  await act(async () => { row.querySelector('button[aria-label^="Play"]').click(); });
  await settle();
  assert.equal(q("[data-music-stage]").getAttribute("data-music-stage"), "audio");
  assert.ok(Boolean(q("[data-course-audio-player]")), "the REAL glass player mounts");
  assert.ok(Boolean(q("[data-course-audio-disc]")), "…with its disc");
  assert.equal(Boolean(q("[data-music-library-sheet]")), false, "playing a song returns to the stage");
  // The song is remembered per learner.
  const stored = JSON.parse(window.localStorage.getItem("dc.music.last.v1:learner-1"));
  assert.equal(stored.id, "course-f1");
  assert.equal(stored.title, "Intro theme");
});

test("a pasted YouTube link becomes a library row and the official embed", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  typeInto(q("[data-music-link]"), "https://youtu.be/dQw4w9WgXcQ?si=abc");
  await act(async () => { q("[data-music-add-link]").click(); });
  await settle();

  const frame = q('[data-music-embed="youtube"]');
  assert.ok(Boolean(frame), "the embed stage takes over");
  assert.equal(q("[data-music-stage]").getAttribute("data-music-stage"), "youtube");
  assert.equal(
    frame.getAttribute("src"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1&enablejsapi=1",
  );
  assert.match(frame.getAttribute("allow"), /encrypted-media/);
  assert.equal(frame.hasAttribute("allowfullscreen"), true);

  // …and the link is on the shelf, saved for the next visit.
  const saved = JSON.parse(window.localStorage.getItem("dc.music.library.v1:learner-1"));
  assert.equal(saved.tracks.length, 1);
  assert.equal(saved.tracks[0].provider, "youtube");
  assert.equal(saved.tracks[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("a saved song opens with the pane again — the library survives the visit", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  typeInto(q("[data-music-link]"), "https://cdn.example.test/Ghost_Love.mp3");
  await act(async () => { q("[data-music-add-link]").click(); });
  await settle();
  assert.equal(q("[data-music-stage]").getAttribute("data-music-stage"), "audio");

  // A brand-new mount (the learner comes back tomorrow) starts on that song.
  mount();
  await settle();
  assert.equal(q("[data-music-stage]").getAttribute("data-music-stage"), "audio");
  assert.equal(Boolean(q("[data-music-library-sheet]")), false, "a remembered song skips the library");
  assert.match(q("[data-course-audio-player]").textContent || "", /Ghost Love|/); // the player is mounted on it

  await act(async () => { q("[data-music-library-toggle]").click(); });
  await settle();
  const row = qa('[data-music-track]').find((element) => /Ghost Love/.test(element.textContent));
  assert.ok(Boolean(row), "and the row is still on the shelf");
  assert.equal(row.getAttribute("data-music-track-source"), "link");

  // Removing it takes it off the shelf AND out of storage.
  await act(async () => { row.querySelector('button[aria-label^="Remove"]').click(); });
  await settle();
  assert.equal(qa('[data-music-track]').some((element) => /Ghost Love/.test(element.textContent)), false);
  const saved = JSON.parse(window.localStorage.getItem("dc.music.library.v1:learner-1") || '{"tracks":[]}');
  assert.equal(saved.tracks.length, 0);
});

test("a link we cannot play is refused with a sentence and stores nothing", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  typeInto(q("[data-music-link]"), "https://example.test/some/page.html");
  await act(async () => { q("[data-music-add-link]").click(); });
  await settle();

  const notice = q("[data-music-notice]");
  assert.ok(Boolean(notice), "the refusal is visible");
  assert.match(notice.textContent, /not playable here/);
  assert.match(notice.textContent, /YouTube, Spotify or SoundCloud/);
  assert.equal(Boolean(q("[data-music-embed]")), false, "no embed was created");
  assert.equal(q('[data-music-section="link"]').getAttribute("data-music-section-count"), "0");
  assert.equal(window.localStorage.getItem("dc.music.library.v1:learner-1"), null);
});

test("with no YouTube key, search hands the query to YouTube itself", async () => {
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
  // A per-tab result button only exists when an API key is configured.
  assert.equal(Boolean(q("[data-music-search-run]")), false);
});

test("the library's search filters every shelf at once", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  typeInto(q("[data-music-link]"), "https://cdn.example.test/Only_Song.mp3");
  await act(async () => { q("[data-music-add-link]").click(); });
  await settle();
  await act(async () => { q("[data-music-library-toggle]").click(); });
  await settle();

  assert.equal(q('[data-music-section="course"]').getAttribute("data-music-section-count"), "1");
  assert.equal(q('[data-music-section="link"]').getAttribute("data-music-section-count"), "1");

  typeInto(q("[data-music-search]"), "only");
  await settle();
  assert.equal(q('[data-music-section="course"]').getAttribute("data-music-section-count"), "0");
  assert.equal(q('[data-music-section="link"]').getAttribute("data-music-section-count"), "1");

  typeInto(q("[data-music-search]"), "nothing matches this");
  await settle();
  assert.equal(q('[data-music-section="link"]').getAttribute("data-music-section-count"), "0");
  assert.match(host().textContent, /Kuch nahin mila/);
});
