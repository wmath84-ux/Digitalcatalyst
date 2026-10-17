// tests/coursePlayerTranscriptRuntime.test.mjs
//
// The Transcript page, exercised for real in jsdom — not just read as source.
//
// The contract suite (coursePlayerTranscriptTabContract.test.mjs) pins the
// wiring; this one mounts the actual component against a fake
// `/api/youtube-transcript` and checks the four faces the owner asked for:
//
//   1. No video → the designed empty state, with the guidance copy.
//   2. A video opens → the fetch starts BY ITSELF and the loading skeleton is
//      on screen while it is in flight.
//   3. It resolves → timestamped lines paint, the clock starts from the
//      player's own progress events, and the line under the playhead is
//      marked active.
//   4. A timestamp tap → the exact `dc:youtube-seek` event the YouTube player
//      listens for, with the line's own second.
//
// The real `src/course/youtubeTranscript.ts` and `src/course/youtubePlayerBus.ts`
// are loaded; only the browser-unavailable edges (the API transport and the
// course-file URL helper) are stubbed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);

const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test", pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// The app's bus creates `new CustomEvent(...)` and dispatches it on `window`.
// Node has its own CustomEvent class, which jsdom's EventTarget rejects; use
// the document's own classes so both sides speak the same realm.
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout engine: the page's polite auto-follow calls scrollTo
// on the transcript list. The behaviour is the browser's, not this suite's.
dom.window.HTMLElement.prototype.scrollTo = function scrollTo() {};

/** Every TS/TSX module is transpiled to CJS and resolved through `resolve`. */
function load(file, resolve) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(resolve, mod, mod.exports);
  return mod.exports;
}

/* ── The fake transcript endpoint ─────────────────────────────────────── */

let pendingFetch = null;
const fetchedUrls = [];

/* The page's SECOND OPINION — when the server cannot deliver the lines, the
   browser tries YouTube itself (InnerTube, the get_transcript panel, the
   legacy timedtext list). Those run on the real `fetch`, so this suite owns it
   too. By default every direct YouTube door is closed, which is exactly what a
   browser does when CORS refuses a cross-origin POST to youtube.com. */
const youtubeCalls = [];
let youtubeResponder = () => Promise.reject(new TypeError("Failed to fetch"));
globalThis.fetch = (url, init) => {
  youtubeCalls.push(String(url));
  return Promise.resolve().then(() => youtubeResponder(String(url), init));
};
const resetYouTube = () => {
  youtubeCalls.length = 0;
  youtubeResponder = () => Promise.reject(new TypeError("Failed to fetch"));
};

function apiFetch(url, init) {
  fetchedUrls.push(String(url));
  return new Promise((resolve, reject) => {
    const settle = (body, ok = true, status = 200) => {
      pendingFetch = null;
      resolve({ ok, status, json: async () => body });
    };
    pendingFetch = { url: String(url), settle };
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
}

/* The real loader + bus; only the browser edges around them are stubbed. */
const transcriptModule = load("src/course/youtubeTranscript.ts", (id) => {
  if (id === "../utils/apiBase") return { apiFetch };
  if (id === "../utils/courseEmbed") {
    return {
      extractYouTubeId: (value) => {
        const match = String(value || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
        return match ? match[1] : "";
      },
      getCourseFileUrl: (file) => String(file?.url || ""),
    };
  }
  return require(id);
});

const panelModule = load("src/course/TranscriptPanel.tsx", (id) => {
  if (id === "./CoursePageHeader") return load("src/course/CoursePageHeader.tsx", (inner) => {
    if (inner.endsWith(".css")) return {};
    return require(inner);
  });
  if (id === "./YouTubeKeyCard") return { default: () => null };
  if (id === "../utils/courseEmbed") {
    return {
      getYouTubeWatchUrl: (file) => String(file?.url || ""),
      extractYouTubeId: (value) => {
        const match = String(value || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
        return match ? match[1] : "";
      },
      getCourseFileUrl: (file) => String(file?.url || ""),
    };
  }
  if (id === "./musicSearch") {
    return {
      youTubeSearchAvailable: () => false,
      subscribeYouTubeKey: () => () => {},
      youTubeSearchUrl: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query || "")}`,
      searchYouTubeOutcome: async () => ({ rows: [], error: "", message: "" }),
    };
  }
  if (id === "./youtubeTranscript") return transcriptModule;
  if (id === "./youtubePlayerBus") return load("src/course/youtubePlayerBus.ts", (inner) => require(inner));
  if (id.endsWith(".css")) return {};
  return require(id);
});

const TranscriptPanel = panelModule.default;

const VIDEO_ID = "dQw4w9WgXcQ";
const youtubeFile = {
  id: `yt:${VIDEO_ID}`,
  name: "Lecture one",
  type: "youtube",
  url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
};

const payloadFor = (videoId, segments) => ({
  ok: true,
  videoId,
  title: "A test lecture",
  language: "en",
  languageLabel: "English",
  autoGenerated: true,
  tracks: [{ language: "en", label: "English (auto-generated)", autoGenerated: true }],
  segments,
  truncated: false,
  fetchedAt: Date.now(),
});

const segments = [
  { start: 0, duration: 4, text: "Welcome to the lecture." },
  { start: 12, duration: 5, text: "This is the second line." },
  { start: 31, duration: 6, text: "And this is where the argument lands." },
];

async function renderPanel(root, props) {
  await act(async () => {
    root.render(React.createElement(TranscriptPanel, props));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
}

test("no video: the designed empty state says exactly what to do", async () => {
  const { host, root } = mount();
  await renderPanel(root, { activeFile: null, uid: "u1", onOpenLibrary: () => {} });

  const empty = host.querySelector("[data-course-transcript-empty]");
  assert.ok(empty, "the empty state is on screen");
  assert.match(empty.textContent, /Play any video from the course library/);
  assert.match(empty.textContent, /with timestamps/);
  assert.match(empty.textContent, /Tap any timestamp to jump straight to that moment/);
  assert.ok(host.querySelector("[data-course-transcript-open-library]"), "the library CTA is there");
  assert.ok(host.querySelector("[data-course-transcript-search]"), "and a real search box");
  assert.equal(host.querySelector("[data-course-transcript-loading]"), null, "nothing pretends to load");
  assert.equal(host.querySelector("[data-course-transcript-header]")?.textContent.trim(), "Transcript");

  await act(() => root.unmount());
  host.remove();
});

test("a YouTube lesson auto-fetches: loading first, then timestamped lines", async () => {
  const { host, root } = mount();
  await renderPanel(root, { activeFile: youtubeFile, uid: "u1" });

  const loading = host.querySelector("[data-course-transcript-loading]");
  assert.ok(loading, "the loading state is shown while the request is in flight");
  assert.match(loading.textContent, /Fetching the transcript/);
  assert.equal(fetchedUrls.filter((url) => url.includes("/api/youtube-transcript")).length, 1);
  assert.match(fetchedUrls.at(-1), new RegExp(`[?&]v=${VIDEO_ID}`));

  await act(async () => {
    pendingFetch.settle(payloadFor(VIDEO_ID, segments));
  });
  await flush();

  assert.equal(host.querySelector("[data-course-transcript-loading]"), null);
  assert.equal(host.querySelectorAll("[data-transcript-line]").length, segments.length);
  assert.equal(host.querySelector('[data-transcript-line="0"] .course-transcript__stamp').textContent, "0:00");
  assert.equal(host.querySelector('[data-transcript-line="2"] .course-transcript__stamp').textContent, "0:31");
  assert.match(host.textContent, /A test lecture/);
  assert.match(host.textContent, /Auto-generated · English/);

  await act(() => root.unmount());
  host.remove();
});

test("the player's clock marks the live line, and a timestamp tap seeks that exact second", async () => {
  const id = "abcdefghijk";
  const file = { id: `yt:${id}`, name: "Talk", type: "youtube", url: `https://youtu.be/${id}` };
  const { host, root } = mount();
  await renderPanel(root, { activeFile: file });

  await act(async () => {
    pendingFetch.settle(payloadFor(id, segments));
  });
  await flush();

  // The player publishes where it is (once a second, see ResourceViewer).
  await act(async () => {
    window.dispatchEvent(new dom.window.CustomEvent("dc:youtube-progress", {
      detail: { videoId: id, position: 13.2, duration: 120 },
    }));
  });
  assert.equal(host.querySelector('[data-transcript-line="1"]').getAttribute("data-active"), "true");
  assert.equal(host.querySelector('[data-transcript-line="0"]').getAttribute("data-active"), "false");
  assert.match(host.querySelector("[data-course-transcript-clock]").textContent, /0:13/);

  // Tapping a line is a seek request for the ACTIVE video — the exact event
  // the YouTube player's subscription listens for.
  let seeked = null;
  const listener = (event) => { seeked = event.detail; };
  window.addEventListener("dc:youtube-seek", listener);
  await act(() => host.querySelectorAll("[data-transcript-line]")[2].click());
  window.removeEventListener("dc:youtube-seek", listener);

  assert.deepEqual(seeked, { videoId: id, seconds: 31 });
  // …and the page moves its own highlight immediately, before the next poll.
  assert.equal(host.querySelector('[data-transcript-line="2"]').getAttribute("data-active"), "true");

  await act(() => root.unmount());
  host.remove();
});

test("an uncaptioned video shows the honest error with a retry, never a blank page", async () => {
  resetYouTube();
  const id = "zzzzzzzzzzz";
  const file = { id: `yt:${id}`, name: "Silent film", type: "youtube", url: `https://www.youtube.com/watch?v=${id}` };
  const { host, root } = mount();
  await renderPanel(root, { activeFile: file });

  await act(async () => {
    pendingFetch.settle({ ok: false, code: "no_captions", error: "This video does not offer captions." }, false, 404);
  });
  await flush();

  // "No captions" from a datacentre IP is a claim worth checking once from the
  // learner's own connection. Every browser door is closed in this suite, so
  // the server's verdict is what stands — but the check really happened.
  assert.ok(youtubeCalls.length > 0, "the browser gave the video its own second opinion");

  const error = host.querySelector("[data-course-transcript-error]");
  assert.ok(error, "the error state is shown");
  assert.match(error.textContent, /does not offer captions/);
  assert.ok(host.querySelector("[data-course-transcript-retry]"), "there is a retry button");
  assert.equal(host.querySelectorAll("[data-transcript-line]").length, 0);
  // And the evidence: which layers were tried, so nobody has to guess again.
  const details = host.querySelector("[data-course-transcript-attempts]");
  assert.ok(details, "the failure lists the layers that were tried");
  assert.match(details.textContent, /server/i);

  await act(() => root.unmount());
  host.remove();
});

test("when the server cannot read the captions but the browser can, the browser's lines win", async () => {
  resetYouTube();
  // The server was throttled; the learner's own connection answers through
  // YouTube's transcript panel — lines, timestamps and all.
  youtubeResponder = (url) => {
    if (url.includes("/youtubei/v1/get_transcript")) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          actions: [{
            updateEngagementPanelAction: {
              content: {
                transcriptRenderer: {
                  content: {
                    transcriptSearchPanelRenderer: {
                      body: {
                        transcriptSegmentListRenderer: {
                          initialSegments: [
                            { transcriptSegmentRenderer: { startMs: "0", endMs: "4000", snippet: { runs: [{ text: "Panel line one." }] } } },
                            { transcriptSegmentRenderer: { startMs: "9000", endMs: "13000", snippet: { runs: [{ text: "Panel line two." }] } } },
                          ],
                        },
                      },
                      footer: { transcriptFooterRenderer: { initialDescription: { runs: [{ text: "Hindi (auto-generated)" }] } } },
                    },
                  },
                },
              },
            },
          }],
        }),
      };
    }
    return { ok: false, status: 403, json: () => Promise.resolve({}) };
  };

  const id = "panelvideo1";
  const file = { id: `yt:${id}`, name: "Throttled lecture", type: "youtube", url: `https://www.youtube.com/watch?v=${id}` };
  const { host, root } = mount();
  await renderPanel(root, { activeFile: file });

  await act(async () => {
    pendingFetch.settle({ ok: false, code: "too_many_requests", error: "Sign in to confirm you're not a bot" }, false, 429);
  });
  await flush();

  const lines = host.querySelectorAll("[data-transcript-line]");
  assert.equal(lines.length, 2, "the browser's own read painted the transcript");
  assert.equal(host.querySelector("[data-course-transcript-error]"), null, "no error is shown at all");
  assert.match(lines[0].textContent, /Panel line one/);
  assert.match(lines[1].textContent, /0:09/);
  assert.match(host.textContent, /Hindi/i, "the panel's own language is named");

  await act(() => root.unmount());
  host.remove();
});
