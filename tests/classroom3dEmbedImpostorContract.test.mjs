// tests/classroom3dEmbedImpostorContract.test.mjs
//
// Part 14 — 3D Classroom third-party-embed optimization.
//
// YouTube/Docs/Sheets/Slides/Forms/Whimsical/generic embeds render
// uncontrollably inside cross-origin iframes, so the room treats them the
// way games treat expensive assets: impostor billboards while the camera
// moves, decoupled tick rates, occlusion/lazy loading, layer isolation,
// and full use of the one remote control available (the YT IFrame API).
//
//   A. IMPOSTOR — a motion signal (drag/pinch/spring/lean) CSS-swaps every
//      live third-party iframe for a static placeholder; settle restores it
//      after a debounce. The iframe is NEVER unmounted. Native media stays
//      live (Part 13's choice, preserved).
//   B. YOUTUBE — motion steps quality to 'small' (audio continues); focus
//      away still pauses (Part 13's WallActivity, preserved).
//   C. DECOUPLED RATE — iframe walls commit DOM transforms at ~22 Hz during
//      motion via a reusable hook; full precision at rest.
//   D. ISOLATION — compositor/layout containment that was audited against
//      drei's actual DOM (no fighting its structure).
//   E. LAZY — no iframe `src` until first wall focus; `content-visibility:
//      auto` + intrinsic size on walls; loaded frames never unmount.
//   F. PERMISSIONS — `allow` tightened per kind; sandbox untouched.
//
// Style note: like every other contract file in this repo, these tests assert
// the SOURCE so the implementation stays in sync with the part spec.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const classroom = read("src/classroom3d/Classroom3D.tsx");
const seatRig = read("src/classroom3d/SeatRig.tsx");
const css = read("src/classroom3d/classroom3d.css");
const motion = read("src/classroom3d/embedMotion.ts");
const throttle = read("src/classroom3d/throttledTransform.ts");
const wallActivity = read("src/classroom3d/WallActivity.tsx");
const resourceViewer = read("src/course/ResourceViewer.tsx");
const impostor = read("src/course/EmbedImpostor.tsx");
const audioPlayer = read("src/course/AudioPlayer.tsx");

// ---------------------------------------------------------------------------
// A1/A3. One motion signal: drag/pinch/spring/lean in, debounced rest out.
// ---------------------------------------------------------------------------

test("the motion store raises immediately and clears after a quiet window", () => {
  // Settle debounce inside the required 150–250 ms band.
  assert.match(motion, /EMBED_MOTION_SETTLE_MS = 200;/);
  // Every report re-arms the timer; only a full quiet window clears motion.
  assert.match(motion, /clearTimeout\(settleTimer\);/);
  assert.match(motion, /settleTimer = setTimeout\(\(\) => \{/);
  assert.match(motion, /EMBED_MOTION_SETTLE_MS\);/);
  // Edge-only notification — subscribers never hear per-frame chatter.
  assert.match(motion, /if \(!moving\) \{\n    moving = true;\n    notify\(\);\n  \}/);
  // Leaving the room can never strand subscribers inside a stale "moving".
  assert.match(motion, /export function resetEmbedMotion\(\): void \{/);
  assert.match(motion, /export function subscribeEmbedMotion\(/);
  assert.match(motion, /export function isEmbedMoving\(\): boolean \{/);
  // React binding re-renders on edges only; server snapshot is at rest.
  assert.match(motion, /useSyncExternalStore\(subscribeEmbedMotion, isEmbedMoving, \(\) => false\)/);
});

test("SeatRig publishes motion for drag, pinch, springs and lean — not sway", () => {
  assert.match(seatRig, /reportEmbedMotion,/);
  // A finger on the glass (drag OR held pinch) counts even before deltas.
  assert.match(seatRig, /dragging\.current \|\|/);
  assert.match(seatRig, /pointers\.current\.size >= 2 \|\|/);
  // A travelling spring (focus hop, pinch/wheel lean, recenter glide) counts.
  assert.match(seatRig, /target\.current\.yaw !== current\.current\.yaw \|\|/);
  assert.match(seatRig, /target\.current\.pitch !== current\.current\.pitch \|\|/);
  assert.match(seatRig, /target\.current\.zoom !== current\.current\.zoom/);
  assert.match(seatRig, /reportEmbedMotion\(\);/);
  // Sub-visible spring residuals snap to rest so motion ends when VISIBLE
  // motion ends — not a second into the exponential tail.
  assert.equal((seatRig.match(/< 0\.002\) current\.current\./g) || []).length, 2);
  assert.match(seatRig, /if \(Math\.abs\(target\.current\.pitch - current\.current\.pitch\) < 0\.002\) \{/);
  // The breathing sway is added straight to the camera, never to the refs
  // the motion check reads — idle rest correctly reads as rest.
  assert.match(seatRig, /camera\.rotation\.y = current\.current\.yaw \+ swayY;/);
});

test("SeatRig mirrors motion onto the canvas parent as a CSS class", () => {
  assert.match(seatRig, /subscribeEmbedMotion\(\(moving\) => \{/);
  assert.match(seatRig, /element\?\.classList\.toggle\(EMBED_MOVING_CLASS, moving\);/);
  // Unmount removes the class and resets the store (no stale "moving" for
  // a remount, no stranded subscribers).
  assert.match(seatRig, /element\?\.classList\.remove\(EMBED_MOVING_CLASS\);/);
  assert.match(seatRig, /resetEmbedMotion\(\);/);
  assert.match(motion, /EMBED_MOVING_CLASS = "dc-embed-moving";/);
});

// ---------------------------------------------------------------------------
// A2. Impostor swap: static placeholder over the live frame, pure CSS.
// ---------------------------------------------------------------------------

test("the impostor is a static chrome placeholder — never a screenshot", () => {
  assert.match(impostor, /export type EmbedImpostorMode = "motion" \| "lazy";/);
  // Kind-driven icon + label from the viewer's own kind strings.
  assert.match(impostor, /youtube: MonitorPlay,/);
  assert.match(impostor, /mindmap: Network,/);
  assert.match(impostor, /youtube: "YouTube video",/);
  assert.match(impostor, /mindmap: "Whimsical board",/);
  assert.match(impostor, /data-embed-impostor/);
  assert.match(impostor, /data-impostor-mode=\{mode\}/);
  // Purely presentational: no state, no effects, no gesture theft, hidden
  // from assistive tech (it duplicates the live frame's chrome).
  assert.ok(!impostor.includes("useState"));
  assert.ok(!impostor.includes("useEffect"));
  assert.match(impostor, /pointer-events-none/);
  assert.match(impostor, /aria-hidden="true"/);
  // Hard browser limit, respected structurally: no pixel reading of any kind.
  // (Comments may NAME the forbidden tools to document the limit — only live
  // code is scanned, so full-line comments and block comments are stripped.)
  const codeOnly = (source) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  for (const banned of ["html2canvas", "getImageData", "toDataURL", "readPixels", "captureStream"]) {
    assert.ok(!codeOnly(impostor).includes(banned), `impostor must not attempt ${banned}`);
    assert.ok(!codeOnly(resourceViewer).includes(banned), `viewer must not attempt ${banned}`);
  }
});

test("motion swaps the live frame for its impostor sibling via CSS only", () => {
  // Both third-party frame types mark their live surface and render a
  // motion sibling — classroom walls only (flat player renders neither).
  assert.equal((resourceViewer.match(/data-embed-impostor-target/g) || []).length, 2);
  assert.equal((resourceViewer.match(/\{wall \? <EmbedImpostor/g) || []).length, 2);
  assert.equal((resourceViewer.match(/mode="motion"/g) || []).length, 2);
  // The swap itself is two CSS rules — zero React renders on motion edges.
  assert.match(css, /\.dc-embed-moving \[data-embed-impostor-target\] \{\n  visibility: hidden;\n\}/);
  assert.match(css, /\[data-impostor-mode="motion"\] \{\n  display: none;\n\}/);
  assert.match(css, /\.dc-embed-moving \[data-impostor-mode="motion"\] \{\n  display: grid;\n\}/);
});

test("native video and audio stay live during motion (Part 13 preserved)", () => {
  // DirectVideo's whole body (up to YouTubeFrame) never mentions impostors.
  const directVideo = resourceViewer.slice(
    resourceViewer.indexOf("function DirectVideo"),
    resourceViewer.indexOf("function YouTubeFrame"),
  );
  assert.ok(!directVideo.includes("EmbedImpostor"));
  assert.ok(!directVideo.includes("embedMotion"));
  assert.ok(!audioPlayer.includes("EmbedImpostor"));
  assert.ok(!audioPlayer.includes("embedMotion"));
  // And the class rule only targets marked third-party surfaces — native
  // media elements carry no such marker.
  assert.ok(!resourceViewer.includes("<video") || !directVideo.includes("data-embed-impostor-target"));
});

// ---------------------------------------------------------------------------
// B5. YouTube: quality steps down in motion, pauses only on look-away.
// ---------------------------------------------------------------------------

test("YouTube steps to small quality during motion and restores on settle", () => {
  // The IFrame API surface grows by exactly the two quality methods, called
  // defensively so a torn-down player can never throw the room.
  assert.match(resourceViewer, /setPlaybackQuality\?: \(quality: string\) => void;/);
  assert.match(resourceViewer, /getPlaybackQuality\?: \(\) => string;/);
  const motionEffect = resourceViewer.slice(
    resourceViewer.indexOf("Part 14 (B)"),
    resourceViewer.indexOf("}, [wallLoaded]);"),
  );
  assert.match(motionEffect, /subscribeEmbedMotion\(\(moving\) => \{/);
  assert.match(motionEffect, /priorQuality = player\.getPlaybackQuality\?\.\(\) \|\| "default";/);
  assert.match(motionEffect, /player\.setPlaybackQuality\?\.\("small"\);/);
  assert.match(motionEffect, /player\.setPlaybackQuality\?\.\(priorQuality\);/);
  // Explicitly NOT a pause: a drag must never mute the lesson — audio
  // continuity is the whole point of preferring the quality step-down.
  // (The comment above names pauseVideo to document the split; only code
  // lines are scanned.)
  const motionCode = motionEffect
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.ok(!motionCode.includes("pauseVideo"));
  // Resume bookkeeping is untouched: the stored second still seeds `start`.
  assert.match(resourceViewer, /start: Math\.floor\(resumeRef\.current\)/);
});

test("focus-away YouTube pause still flows through WallActivity (Part 13)", () => {
  // One mechanism owns focus pause/resume — the generic postMessage gate —
  // so the API-based motion path can never fight it.
  assert.match(wallActivity, /youTubeCommand\(frame, "pauseVideo"\);/);
  assert.match(wallActivity, /youTubeCommand\(frame, "playVideo"\);/);
});

// ---------------------------------------------------------------------------
// C6/C7. The wall transform commits at ~22 Hz during motion, exact at rest.
// ---------------------------------------------------------------------------

test("useThrottledTransform commits matrices on a decoupled tick", () => {
  // 45 ms ≈ 22 updates/sec, inside the required 20–24 Hz band.
  assert.match(throttle, /TRANSFORM_THROTTLE_MS = 45;/);
  assert.match(throttle, /export function useThrottledTransform\(\): \(walls: readonly ThrottledWall\[\]\) => void \{/);
  // Resolution walks drei's real structure (hook → portal root → outer →
  // inner) and fails closed to full-rate sync on any mismatch.
  assert.ok(throttle.includes('[data-classroom-wall="${wall}"]'));
  assert.match(throttle, /\.closest\("\.dc-classroom-surface"\)/);
  assert.match(throttle, /outer instanceof HTMLElement && inner instanceof HTMLElement/);
  // At rest every frame commits (the automatic exact snap on settle); while
  // moving, commits are gated on the window and stale values are restored.
  assert.match(throttle, /if \(!moving \|\| now - entry\.lastCommit >= TRANSFORM_THROTTLE_MS\) \{/);
  assert.match(throttle, /entry\.outer\.style\.transform = entry\.outerTransform;/);
  assert.match(throttle, /entry\.inner\.style\.transform = entry\.innerTransform;/);
  // The tick reads the store directly — no subscription, no re-renders.
  assert.match(throttle, /const moving = isEmbedMoving\(\);/);
  assert.ok(!throttle.includes("subscribeEmbedMotion"));
  assert.match(throttle, /export function WallTransformThrottle\(\{ walls \}: \{ walls: readonly ThrottledWall\[\] \}\) \{/);
});

test("Classroom3D throttles only the embed-carrying board, mounted last", () => {
  // Third-party kinds only — native `direct` media is excluded on purpose.
  assert.match(classroom, /"youtube",\n  "pdf",\n  "doc",\n  "sheet",\n  "slides",\n  "form",\n  "drive",\n  "mindmap",\n  "embed",/);
  assert.match(classroom, /THIRD_PARTY_EMBED_KINDS\.has\(getCourseEmbed\(file\)\.kind\)/);
  assert.match(classroom, /throttledWalls = useMemo\(\(\) => \(boardHasEmbed \? \(\["board"\] as const\) : \(\[\] as const\)\), \[boardHasEmbed\]\)/);
  assert.match(classroom, /<WallTransformThrottle walls=\{throttledWalls\} \/>/);
  // Mounted after every wall so drei's matrix writes land first (R3F runs
  // same-priority frames in mount order) and the throttle pass decides.
  assert.ok(classroom.indexOf("<WallTransformThrottle") > classroom.indexOf("</DeskConsole>"));
});

// ---------------------------------------------------------------------------
// D8. Compositor isolation that doesn't fight drei's own structure.
// ---------------------------------------------------------------------------

test("embed frames get layout/style containment, walls get a skip base", () => {
  assert.match(resourceViewer, /className="dc-embed-frame relative h-full min-h-0 w-full min-w-0 overflow-hidden"/);
  assert.match(css, /\.dc-embed-frame \{\n  contain: layout style;\n\}/);
  assert.match(css, /\[data-classroom-wall\] \{\n  content-visibility: auto;\n  contain-intrinsic-size: 1280px 800px;\n\}/);
  // The audited no-list: nothing that would clip drei's ~0×0 portal root,
  // nothing that burns a redundant compositor layer, nothing that could
  // touch the top-layer fullscreen escape hatch.
  const rules = css.slice(css.indexOf(".dc-embed-moving [data-embed-impostor-target]"));
  assert.ok(!rules.includes("will-change"));
  assert.ok(!rules.includes("translateZ"));
  assert.ok(!rules.includes("contain: paint"));
  assert.ok(!rules.includes("contain: size"));
});

// ---------------------------------------------------------------------------
// E9. No iframe src until first wall focus — then mounted forever.
// ---------------------------------------------------------------------------

test("third-party frames latch their first load on wall focus", () => {
  // The wall context ResourceViewer consumes (null = flat player).
  assert.match(wallActivity, /export const WallActivityContext = createContext<WallActivityState \| null>\(null\);/);
  assert.match(wallActivity, /export function useWallActivity\(\): WallActivityState \| null \{/);
  assert.match(resourceViewer, /import \{ useWallActivity \} from "\.\.\/classroom3d\/WallActivity";/);
  // Both third-party frame types latch false → true on first faced render.
  assert.equal(
    (resourceViewer.match(/const \[wallLoaded, setWallLoaded\] = useState\(!wall \|\| wall\.active\);/g) || []).length,
    2,
  );
  assert.equal(
    (resourceViewer.match(/if \(wall\?\.active && !wallLoaded\) setWallLoaded\(true\);/g) || []).length,
    2,
  );
  // Boot effects wait for the latch (player construction, load timeout,
  // motion subscription) — nothing fetches, boots, or bills before it.
  assert.match(resourceViewer, /if \(!videoId \|\| !wallLoaded\) return undefined;/);
  assert.equal((resourceViewer.match(/\}, \[[^\]]*wallLoaded\]\);/g) || []).length, 3);
});

test("pre-latch walls render the placeholder with no iframe at all", () => {
  assert.equal((resourceViewer.match(/if \(!wallLoaded\) \{/g) || []).length, 2);
  assert.equal((resourceViewer.match(/mode="lazy"/g) || []).length, 2);
  // The placeholder return precedes any rendered frame in both paths (the
  // API player's construction effect is separately gated — see above).
  assert.ok(resourceViewer.indexOf("if (!wallLoaded) {") < resourceViewer.indexOf("ref={hostRef}"));
  assert.ok(resourceViewer.indexOf("if (!wallLoaded) {") < resourceViewer.indexOf("<iframe"));
});

test("no loaded iframe is ever unmounted after its first load", () => {
  // The latch only flips one way — there is no code path back to false.
  assert.ok(!resourceViewer.includes("setWallLoaded(false)"));
  // The committed rule, still documented where it was first written.
  assert.match(resourceViewer, /Continue where you left off \(EVERY file type\)/);
});

// ---------------------------------------------------------------------------
// F11. Permissions tightened per kind; sandbox and escape hatches intact.
// ---------------------------------------------------------------------------

test("allow is least-permission per kind with a full-list fallback", () => {
  assert.match(resourceViewer, /allow=\{embedAllowForKind\(kind\)\}/);
  assert.match(
    resourceViewer,
    /const EMBED_ALLOW_FULL = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write";/,
  );
  // Media keeps media; documents keep fullscreen + clipboard; unknown keeps all.
  assert.match(resourceViewer, /youtube: "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write",/);
  assert.match(resourceViewer, /slides: "fullscreen; clipboard-read; clipboard-write",/);
  assert.match(resourceViewer, /pdf: "fullscreen; clipboard-write",/);
  assert.match(resourceViewer, /mindmap: "fullscreen; clipboard-read; clipboard-write",/);
  assert.match(resourceViewer, /embed: EMBED_ALLOW_FULL,/);
  assert.match(resourceViewer, /EMBED_ALLOW_BY_KIND\[kind\] \?\? EMBED_ALLOW_FULL;/);
});

test("sandbox, fullscreen, downloads and edit mode are untouched", () => {
  assert.match(
    resourceViewer,
    /sandbox=\{editMode \? undefined : "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"\}/,
  );
  assert.match(resourceViewer, /allowFullScreen/);
  assert.match(resourceViewer, /requestFullscreen\?\.\(\)/);
  assert.match(resourceViewer, /getCourseDownload\(file\)/);
  assert.match(resourceViewer, /onToggleEditMode: toggleEditMode,/);
});

// ---------------------------------------------------------------------------
// No new heavy dependencies in the Part 14 surface.
// ---------------------------------------------------------------------------

test("Part 14 modules import nothing beyond react, fiber, drei and lucide", () => {
  const files = ["src/classroom3d/embedMotion.ts", "src/classroom3d/throttledTransform.ts", "src/course/EmbedImpostor.tsx"];
  const allowed = new Set(["react", "@react-three/fiber", "@react-three/drei", "lucide-react"]);
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/from "([^"]+)"/g)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) continue;
      assert.ok(allowed.has(specifier), `${file} imports unexpected dependency ${specifier}`);
    }
  }
});
