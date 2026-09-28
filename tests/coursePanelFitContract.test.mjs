// tests/coursePanelFitContract.test.mjs
//
// The Course Player's two self-sizing surfaces — the Brain practice page and
// the glass music player — now fit the box they are GIVEN, not the screen.
// Owner brief, 2026-09-28:
//
//   "Course player ke andar jo Brain page ka design hai, itna flexible banao
//    ki vah screen size / jaise area ke according question, option aur jo bhi
//    button hai sab kuchh properly visible ho jaaye … jaise split mode mein
//    ham donon hisson ko jitna man kahe utna khinchkar upar niche kar sakte
//    hain, to uske according yah Brain page utna hi flexible ho … aur isi
//    tarah module mein jo music player hai uska bhi design utna hi flexible
//    banao taki vah apne area mein jitna bhi ho uske according vah acche se
//    dikhe pura bina cut hue."
//
// What this file pins:
//
//   1. the ONE fit model (src/course/panelFit.ts): the pure scale functions
//      run for real — a wide box grows the Brain design to its cap, a SHORT
//      box shrinks it to a floor that still clears a 44 px touch target, the
//      music card always fits inside its box and never leaves its own range;
//   2. the Brain panel measures ITSELF (every screen root carries the one
//      measuring ref), keeps its docked Previous / Next bar docked, and keeps
//      the revision design's `calc(px * var(--brain-scale))` language;
//   3. the music player measures its stage, scales the whole card as one
//      artwork (frame + scaler), and still declares its `data-course-audio-*`
//      contract attributes and the reference 320 px card;
//   4. the stylesheet ladder is now only the pre-measure fallback, and the
//      audio CSS block documents the measured fit.
//
// The scale functions are TypeScript in the app, so they are bundled with the
// repo's own esbuild and required here — the arithmetic under test is the
// arithmetic the player runs, not a copy of it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* ── the real fit module, bundled ─────────────────────────────────────────── */

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-panel-fit");
fs.mkdirSync(CACHE, { recursive: true });
const ENTRY = path.join(CACHE, "fit.ts");
const OUT = path.join(CACHE, "fit.cjs");
fs.writeFileSync(
  ENTRY,
  `export {
  brainFitScale,
  audioFitScale,
  paddingOf,
  BRAIN_FIT_FLOOR,
  BRAIN_FIT_CEIL,
  BRAIN_FIT_REFERENCE_HEIGHT,
  BRAIN_FIT_GROW_FROM,
  BRAIN_FIT_PHONE_WIDTH,
  BRAIN_FIT_GROW_TO,
  AUDIO_CARD_WIDTH,
  AUDIO_CARD_HEIGHT,
  AUDIO_FIT_FLOOR,
  AUDIO_FIT_CEIL,
} from ${JSON.stringify(path.join(ROOT, "src/course/panelFit.ts"))};\n`,
);
execFileSync(
  require.resolve("esbuild/bin/esbuild"),
  [
    ENTRY,
    "--bundle",
    "--format=cjs",
    "--platform=node",
    "--target=node20",
    `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
    `--outfile=${OUT}`,
    "--log-level=error",
  ],
  { cwd: ROOT, stdio: "pipe" },
);
const fit = require(OUT);

const brainPanel = read("src/course/CourseBrainPanel.tsx");
const audioPlayer = read("src/course/AudioPlayer.tsx");
const panelFit = read("src/course/panelFit.ts");
const indexCss = read("src/index.css");

/* --------------------------------------------------------------------------- */
/* 1. The Brain fit: the box decides                                        */
/* --------------------------------------------------------------------------- */

test("the Brain design keeps the phone size in a phone-sized pane", () => {
  // 320–560 px wide is the revision page's own home: the design at 1×.
  assert.equal(fit.brainFitScale(320, 700), 1);
  assert.equal(fit.brainFitScale(390, 640), 1);
  assert.equal(fit.brainFitScale(560, 900), 1);
  // Narrower than the phone it was drawn for (the divider dragged towards the
  // study side), the design shrinks with the pane so the question still fits
  // ACROSS — floor included.
  assert.equal(fit.brainFitScale(280, 700), 0.875);
  assert.equal(fit.brainFitScale(240, 700), fit.BRAIN_FIT_FLOOR);
});

test("a WIDE pane grows the Brain design, up to the cap", () => {
  const wide = fit.brainFitScale(900, 800);
  assert.ok(wide > 1 && wide < fit.BRAIN_FIT_CEIL, `a wide pane grows (${wide})`);
  // The ladder the viewport media queries used to climb, now keyed to the pane.
  assert.equal(fit.brainFitScale(1200, 900), fit.BRAIN_FIT_CEIL);
  assert.equal(fit.brainFitScale(1600, 1200), fit.BRAIN_FIT_CEIL, "never past the cap");
  // …and it is monotonic: a wider pane is never a smaller design.
  let previous = 0;
  for (const width of [560, 640, 720, 800, 900, 1000, 1100, 1200, 1400]) {
    const scale = fit.brainFitScale(width, 900);
    assert.ok(scale >= previous, `monotonic at ${width} (${previous} → ${scale})`);
    previous = scale;
  }
});

test("a SHORT pane shrinks the Brain design so the question and buttons fit", () => {
  // The Split Deck dragged small: the study pane is 310 px tall, the very
  // height a landscape phone gives it. The design comes down instead of
  // cutting the question off.
  const short = fit.brainFitScale(390, 310);
  assert.ok(short < 1, `a short pane shrinks the design (${short})`);
  assert.equal(short, fit.BRAIN_FIT_FLOOR, "…down to the floor, never past it");
  // The floor is a legibility + touch floor: the 56 px answer tile is still a
  // real target, and the 19 px prompt still reads.
  assert.ok(56 * short >= 44, "the answer tile stays above a 44 px touch target");
  assert.ok(19 * short >= 15, "the prompt stays legible");
  // Between the floor and 1: exactly proportional to the height it has.
  assert.equal(fit.brainFitScale(390, 620), 1);
  assert.equal(fit.brainFitScale(390, 496), fit.BRAIN_FIT_FLOOR);
  assert.equal(fit.brainFitScale(390, 558), 0.9);
  // Monotonic in height too.
  let previous = 0;
  for (const height of [300, 400, 496, 520, 560, 620, 800]) {
    const scale = fit.brainFitScale(390, height);
    assert.ok(scale >= previous, `monotonic at ${height} (${previous} → ${scale})`);
    previous = scale;
  }
});

test("a missing measurement is the design's own size, never a guess", () => {
  assert.equal(fit.brainFitScale(0, 0), 1, "the panel renders at 1× before it is measured");
  assert.equal(fit.brainFitScale(Number.NaN, 600), 1);
  assert.equal(fit.brainFitScale(600, Number.NaN), 1);
  assert.equal(fit.brainFitScale(-40, 600), 1);
});

/* --------------------------------------------------------------------------- */
/* 2. The music card fits its stage, whole                                   */
/* --------------------------------------------------------------------------- */

test("the music card fits the stage it is given — nothing cut", () => {
  const cases = [
    // [box width, box height, label] — a portrait phone, a landscape phone, a
    // hard-dragged divider and a big desktop stage.
    [366, 444, "portrait phone lesson pane"],
    [366, 310, "landscape phone lesson pane"],
    [250, 800, "narrow split column"],
    [1000, 800, "desktop stage"],
  ];
  for (const [width, height, label] of cases) {
    const scale = fit.audioFitScale(width, height);
    assert.ok(scale >= fit.AUDIO_FIT_FLOOR && scale <= fit.AUDIO_FIT_CEIL, `${label}: within range (${scale})`);
    assert.ok(
      fit.AUDIO_CARD_WIDTH * scale <= width + 0.5,
      `${label}: the card's width fits (${fit.AUDIO_CARD_WIDTH * scale} ≤ ${width})`,
    );
    assert.ok(
      fit.AUDIO_CARD_HEIGHT * scale <= height + 0.5,
      `${label}: the card's height fits (${fit.AUDIO_CARD_HEIGHT * scale} ≤ ${height})`,
    );
  }
});

test("the music card follows both axes and both ends of its range", () => {
  // Height-bound (the short pane), width-bound (the narrow column).
  assert.equal(fit.audioFitScale(366, 444), 0.906);
  assert.equal(fit.audioFitScale(366, 310), 0.632);
  assert.equal(fit.audioFitScale(250, 800), 0.781);
  // The reference card never grows past a fifth, and never shrinks past the floor.
  assert.equal(fit.audioFitScale(2000, 2000), fit.AUDIO_FIT_CEIL);
  assert.equal(fit.audioFitScale(320, 120), fit.AUDIO_FIT_FLOOR);
  // The 52 px play button is still a control at the floor…
  assert.ok(52 * fit.AUDIO_FIT_FLOOR > 26, `the play button stays tappable (${52 * fit.AUDIO_FIT_FLOOR} px)`);
  // …and an unmeasured stage renders the reference card.
  assert.equal(fit.audioFitScale(0, 0), 1);
  assert.equal(fit.audioFitScale(Number.NaN, 400), 1);
});

/* --------------------------------------------------------------------------- */
/* 3. The Brain panel measures ITSELF                                        */
/* --------------------------------------------------------------------------- */

test("every Brain screen measures its own box and publishes the scale", () => {
  assert.match(panelFit, /export function useFitTarget\(publish: \(node: HTMLElement \| null\) => void\)/);
  assert.match(panelFit, /new ResizeObserver\(\(\) => publishRef\.current\(nodeRef\.current\)\)/);
  assert.match(panelFit, /publishRef\.current\(node\);/, "published synchronously on attach, before the paint");
  assert.match(brainPanel, /import \{ brainFitScale, publishVar, useFitTarget \} from "\.\/panelFit";/);
  assert.match(brainPanel, /const fitRef = useFitTarget\(publishBrainFit\);/);
  assert.match(
    brainPanel,
    /publishVar\(node, "--brain-scale", String\(brainFitScale\(node\.clientWidth, node\.clientHeight\)\)\)/,
    "the panel's own box is what the scale is solved from",
  );
  assert.match(panelFit, /export function publishVar\(el: HTMLElement, name: string, value: string\): void \{\s*\n\s*if \(el\.style\.getPropertyValue\(name\) === value\) return;/,
    "an unchanged value is never re-written — the divider drag is a per-frame path");
  // The ref sits on EVERY screen root (library / review / result / answers /
  // question), so whichever one is mounted owns the measurement.
  const roots = brainPanel.match(/data-brain-screen="\w+"/g) ?? [];
  assert.equal(roots.length, 5, "five screens");
  assert.equal((brainPanel.match(/ref=\{fitRef\}/g) ?? []).length, 5, "…and all five measure themselves");
});

test("the Brain page's fixed rows and its action bar are docked, never squeezed", () => {
  // The bar carrying Previous / Next (and the review screen's Submit bar) can
  // never be compressed by the question above it — the question scrolls, the
  // buttons do not.
  const bars = brainPanel.match(/dc-scene-plate dc-scene-plate--bar flex shrink-0[^`"]*/g) ?? [];
  assert.equal(bars.length, 2, `both action bars are shrink-0 (found ${bars.length})`);
  assert.match(brainPanel, /<div className="flex shrink-0 items-center" style=\{\{ padding: `\$\{S\(12\)\} \$\{S\(16\)\} 0`/);
  assert.match(brainPanel, /<div className="shrink-0" style=\{\{ padding: `\$\{S\(12\)\} \$\{S\(16\)\} 0` \}\}>/);
  // …and no fixed numeric font size can bypass the scale.
  assert.ok(!/fontSize: \d+/.test(brainPanel), "every metric still goes through S()");
});

/* --------------------------------------------------------------------------- */
/* 4. The music player measures its stage and scales the whole card          */
/* --------------------------------------------------------------------------- */

test("the music card is scaled as ONE artwork around a reference-size card", () => {
  assert.match(audioPlayer, /const stageRef = useFitTarget\(publishAudioFit\);/);
  assert.match(audioPlayer, /const scale = audioFitScale\(/);
  assert.match(audioPlayer, /publishVar\(stage, "--audio-scale", String\(scale\)\)/);
  // The frame is the SCALED box (so centring + scrolling agree with the paint)…
  assert.match(audioPlayer, /data-course-audio-frame/);
  assert.match(audioPlayer, /width: `calc\(\$\{AUDIO_CARD_WIDTH\}px \* var\(--audio-scale, 1\)\)`/);
  assert.match(audioPlayer, /height: `calc\(var\(--audio-card-h, \$\{AUDIO_CARD_HEIGHT\}px\) \* var\(--audio-scale, 1\)\)`/);
  // …the scaler wears the one transform…
  assert.match(audioPlayer, /data-course-audio-scaler/);
  assert.match(audioPlayer, /transform: "scale\(var\(--audio-scale, 1\)\)"/);
  assert.match(audioPlayer, /transformOrigin: "top left"/);
  // …and the card keeps its own reference width, in the design's own px.
  assert.match(audioPlayer, /className="relative isolate w-\[320px\] overflow-hidden rounded-\[32px\]"/);
  assert.doesNotMatch(audioPlayer, /w-\[320px\] max-w-full/, "the card must not shrink out of its own frame");
  // The card's own height is measured (not guessed) so the frame mirrors it.
  assert.match(audioPlayer, /new ResizeObserver\(publish\);\s*\n\s*observer\.observe\(card\);/);
});

test("the music player keeps every playback contract attribute", () => {
  for (const attribute of [
    "data-course-viewer-audio",
    "data-course-audio-player",
    "data-course-audio-play",
    "data-course-audio-seek",
    "data-course-audio-seek-fill",
    "data-course-audio-current",
    "data-course-audio-duration",
    "data-course-audio-loop",
    "data-course-audio-restart",
    "data-course-audio-mute",
    "data-course-audio-disc",
    "data-course-audio-element",
  ]) {
    assert.ok(audioPlayer.includes(attribute), `${attribute} survives the fit`);
  }
  assert.match(audioPlayer, /src=\{url\}/);
  assert.match(audioPlayer, /role="slider"/);
});

/* --------------------------------------------------------------------------- */
/* 5. The one stylesheet knows both stories                                  */
/* --------------------------------------------------------------------------- */

test("the CSS ladder is the pre-measure fallback, the measurement is the truth", () => {
  // The ladder stays (old engines, the frame before the panel mounts)…
  assert.match(indexCss, /\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
  assert.match(indexCss, /@media \(min-width: 1200px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.24;/);
  assert.match(indexCss, /@media \(max-height: 460px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
  // …and the sheet says out loud that the panel's own measurement wins.
  assert.match(indexCss, /The ladder below is only the PRE-MEASURE fallback/);
  assert.match(indexCss, /src\/course\/panelFit\.ts → `brainFitScale`/);
  assert.match(indexCss, /src\/course\/panelFit\.ts → `--audio-scale`/);
});
