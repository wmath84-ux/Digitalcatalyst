// tests/coursePlayerTranscriptTabContract.test.mjs
//
// The owner's brief (2026-10-17):
//   "course player ke andar resource library button ke bagal mein footer
//    navigation mein ek aur button add karo … active YouTube video ka
//    transcript automatically dikhe … loading state ho to loading dikhayein …
//    koi video na chale to clear design mein likhein … har timestamp par click
//    karne se video uss jagah se live skip ho kar chale."
//
// This suite pins the whole chain down:
//   · the tab sits immediately after Module in the ONE TABS list;
//   · the page is parent-owned and receives the file open in the lesson pane;
//   · the panel auto-fetches, shows a loading skeleton, and renders the
//     designed empty state with its exact guidance copy;
//   · every line calls the seek bus, and the YouTube player obeys it;
//   · `/api/youtube-transcript` is dispatched by the shared serverless
//     function (Vercel's 12-function cap) and the dev server;
//   · the server's parser turns YouTube's real caption shapes into lines.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const panel = read("src/course/TranscriptPanel.tsx");
const bus = read("src/course/youtubePlayerBus.ts");
const viewer = read("src/course/ResourceViewer.tsx");
const blockPages = read("src/course/blockPages.ts");
const router = read("api/referral-leaderboard.ts");
const vercel = JSON.parse(read("vercel.json"));
const api = read("api/_lib/youtubeTranscript.ts");
const vite = read("vite.config.ts");

const {
  parseYouTubeVideoId,
  parseInlineJson,
  parseCaptionJson3,
  parseCaptionXml,
  groupTranscriptCues,
  chooseCaptionTrack,
  isAllowedCaptionUrl,
} = await import("../api/_lib/youtubeTranscript.ts");

/* ── The dock ───────────────────────────────────────────────────────────── */

test("Transcript is a footer tab immediately beside the Resource Library", () => {
  assert.match(
    overlay,
    /export type DockTab = "modules" \| "transcript" \| "brain" \| "notes" \| "mindmap" \| "ai" \| "paid" \| "player" \| "experiment" \| "sketch" \| "read" \| "music";/,
  );
  const order = [...overlay.matchAll(/\{ key: "(modules|transcript|brain|notes|mindmap|ai|paid|experiment|sketch|read|music)"/g)].map((match) => match[1]);
  assert.deepEqual(order.slice(0, 3), ["modules", "transcript", "brain"], "Transcript must sit right after Module");
});

test("the dock still builds itself from the one TABS array", () => {
  assert.match(overlay, /TABS\.filter\(\(\{ key \}\) => !hiddenTabs\.includes\(key\)\)/);
  assert.match(overlay, /export const STUDY_TAB_ORDER: DockTab\[\] = TABS\.map\(\(\{ key \}\) => key\);/);
});

test("the overlay hosts the parent-owned transcript page and the plus deck can place it", () => {
  assert.match(overlay, /transcriptPanel\?: ReactNode;/);
  assert.match(overlay, /tab === "transcript"/);
  assert.match(overlay, /transcriptPanel \?\? TRANSCRIPT_FALLBACK/);
  assert.match(overlay, /case "transcript":/);
  assert.match(blockPages, /\| "transcript"/);
  assert.match(blockPages, /key: "transcript"/);
});

/* ── The player wiring ──────────────────────────────────────────────────── */

test("the Course Player hands the open file and the main-pane play callback to the page", () => {
  assert.match(player, /import TranscriptPanel from "\.\/course\/TranscriptPanel";/);
  assert.match(player, /<TranscriptPanel[\s\S]*?activeFile=\{selectedFile\}/);
  assert.match(player, /<TranscriptPanel[\s\S]*?onPlayYouTube=\{openYouTubeSearchResult\}/);
  assert.match(player, /<TranscriptPanel[\s\S]*?onOpenLibrary=\{\(\) => onPaneTabChange\("modules"\)\}/);
});

test("the page auto-fetches, shows loading, and has the designed empty state", () => {
  assert.match(panel, /useEffect\(\(\) => \{[\s\S]*?loadYouTubeTranscript\(videoId, language, controller\.signal\)/);
  assert.match(panel, /data-course-transcript-loading/);
  assert.match(panel, /Fetching the transcript/);
  assert.match(panel, /data-course-transcript-empty/);
  assert.match(panel, /No video playing/);
  assert.match(panel, /Play any video from the course library/);
  assert.match(panel, /with timestamps/);
  assert.match(panel, /Tap any timestamp to jump straight to that moment/);
  assert.match(panel, /data-course-transcript-search/);
  assert.match(panel, /data-course-transcript-open-library/);
});

test("every transcript line is a timestamp button that seeks the live video", () => {
  assert.match(panel, /data-transcript-line=\{index\}/);
  assert.match(panel, /onClick=\{\(\) => seekTo\(segment\.start\)\}/);
  assert.match(panel, /const seekTo = \(start: number\) => \{[\s\S]*?requestYouTubeSeek\(videoId, start\)/);
  assert.match(panel, /subscribeYouTubeProgress/);
  assert.match(panel, /data-course-transcript-clock/);
  assert.match(panel, /data-active=\{index === activeIndex \? "true" : "false"\}/);
});

test("the YouTube player listens for seeks and reports its clock", () => {
  assert.match(viewer, /subscribeYouTubeSeek\(\(detail\) => \{/);
  assert.match(viewer, /detail\.videoId !== videoId \|\| !activeRef\.current/);
  assert.match(viewer, /player\.seekTo\(seconds, true\)/);
  assert.match(viewer, /player\.playVideo\?\.\(\)/);
  assert.match(viewer, /reportYouTubeProgress\(\{ videoId, position, duration \}\)/);
  // The plain-embed fallback reloads at the requested second.
  assert.match(viewer, /autoplay=1/);
  assert.match(bus, /YOUTUBE_SEEK_EVENT = "dc:youtube-seek"/);
  assert.match(bus, /YOUTUBE_PROGRESS_EVENT = "dc:youtube-progress"/);
});

/* ── The API ────────────────────────────────────────────────────────────── */

test("the transcript API rides the shared serverless function (12-function cap)", () => {
  assert.match(router, /import \{ handleYouTubeTranscript \} from "\.\/_lib\/youtubeTranscript\.js";/);
  assert.match(router, /"youtube-transcript",/);
  assert.match(router, /route === "youtube-transcript"\) return handleYouTubeTranscript\(req, res\)/);
  const rewrite = vercel.rewrites.find((entry) => entry.source === "/api/youtube-transcript");
  assert.ok(rewrite, "vercel.json must rewrite /api/youtube-transcript");
  assert.equal(rewrite.destination, "/api/referral-leaderboard?route=youtube-transcript");
});

test("the parser reads every YouTube caption shape", () => {
  assert.equal(parseYouTubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ?start=9"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), "");
  assert.equal(parseYouTubeVideoId("not a video"), "");

  // The brace scan must not stop at a `}` inside a string.
  const html = '<script>var ytInitialPlayerResponse = {"a":{"b":"} not the end"},"c":1}; var next=1;</script>';
  assert.deepEqual(parseInlineJson(html, "ytInitialPlayerResponse"), { a: { b: "} not the end" }, c: 1 });

  const json3 = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 1400, segs: [{ utf8: "Hello " }, { utf8: "world." }] },
      { tStartMs: 1500, dDurationMs: 1200, segs: [{ utf8: "This is a test." }] },
    ],
  });
  const jsonCues = parseCaptionJson3(json3);
  assert.equal(jsonCues.length, 2);
  assert.equal(jsonCues[0].text, "Hello world.");

  const classic = '<transcript><text start="1.5" dur="2">Tom &amp; Jerry</text><text start="4" dur="2">&#39;hello&#39;</text></transcript>';
  const classicCues = parseCaptionXml(classic);
  assert.equal(classicCues.length, 2);
  assert.equal(classicCues[0].start, 1.5);
  assert.equal(classicCues[0].text, "Tom & Jerry");
  assert.equal(classicCues[1].text, "'hello'");

  const srv3 = '<timedtext><body><p t="2000" d="1500"><s>One</s><s> two</s></p></body></timedtext>';
  const srv3Cues = parseCaptionXml(srv3);
  assert.equal(srv3Cues.length, 1);
  assert.equal(srv3Cues[0].start, 2);
  assert.equal(srv3Cues[0].text, "One two");
});

test("lines merge politely and keep the first cue's timestamp", () => {
  const merged = groupTranscriptCues([
    { start: 10, end: 12, text: "This is" },
    { start: 12, end: 14, text: "one thought." },
    { start: 18, end: 20, text: "A new thought after a pause." },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].start, 10);
  assert.equal(merged[0].text, "This is one thought.");
  assert.equal(merged[1].start, 18);
});

test("track choice prefers the request, then manual English", () => {
  const tracks = [
    { baseUrl: "https://www.youtube.com/api/timedtext?x=1", language: "hi", label: "Hindi", autoGenerated: true },
    { baseUrl: "https://www.youtube.com/api/timedtext?x=2", language: "en", label: "English", autoGenerated: false },
  ];
  assert.equal(chooseCaptionTrack(tracks)?.language, "en");
  assert.equal(chooseCaptionTrack(tracks, "hi")?.language, "hi");
  assert.equal(isAllowedCaptionUrl("https://www.youtube.com/api/timedtext?x=1"), true);
  assert.equal(isAllowedCaptionUrl("https://youtube.com.evil.test/api"), false);
  assert.equal(isAllowedCaptionUrl("http://www.youtube.com/api"), false);
});

test("the API never scrapes from the browser and is cached at the edge", () => {
  assert.doesNotMatch(panel, /youtube\.com\/watch\?v=.*fetch\(/);
  assert.match(api, /youtubei\/v1\/player/);
  assert.match(api, /ytInitialPlayerResponse/);
  assert.match(api, /fmt", "json3"|searchParams\.set\("fmt", "json3"\)/);
  assert.match(api, /s-maxage=3600/);
  assert.match(api, /CAPTION_HOST/);
});

test("local dev runs the SAME transcript handler as Vercel — one status map, one layer trail", () => {
  // Two implementations of one route is how localhost and production drift
  // apart: the dev copy used to answer without the `?diagnostics=1` trail and
  // without the success cache headers, so a bug found locally was not the bug
  // that shipped. The middleware must delegate, not re-implement.
  assert.match(vite, /import \{ handleYouTubeTranscript \} from "\.\/api\/_lib\/youtubeTranscript";/);
  assert.match(vite, /server\.middlewares\.use\("\/api\/youtube-transcript"/);
  assert.match(vite, /void handleYouTubeTranscript\(/);
  assert.doesNotMatch(vite, /code === "no_transcript"/, "no second copy of the status map in the dev server");
  assert.doesNotMatch(vite, /fetchYouTubeTranscript\(videoId/, "the dev server does not call the fetcher itself");

  // The same delegation for the Google search server path.
  assert.match(vite, /import \{ handleGoogleSearch \} from "\.\/api\/_lib\/googleSearchProxy";/);
  assert.match(vite, /server\.middlewares\.use\("\/api\/google-search"/);
  assert.match(vite, /void handleGoogleSearch\(/);
});
