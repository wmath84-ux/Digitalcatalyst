// tests/coursePlayerUiverseFolderBurstContract.test.mjs
//
// Contract for the Uiverse.io "Card" folder burst on the Course Player's
// Module dock button (owner's request: the uiverse element
// https://uiverse.io/byllzz/great-wombat-13 by byllzz, MIT, installed
// verbatim; the existing dock button is NOT removed — the folder card only
// appears on click, plays its exact open animation in full, then closes
// back into icon form).
//
// Asserted against SOURCE (same style as the other player contract tests):
//   - the burst component carries the element's exact markup/classes
//     (folder-card, folder-toggle checkbox, hint, folder back/front, five
//     files with their names/tags, FILES·05 counter, search pill),
//   - the stylesheet is the element's exact CSS (values preserved,
//     namespaced under .uiverse-folder-burst),
//   - it mounts in the player and listens ONLY for the Module dock tab,
//   - the phase machine holds the open state for the full animation and
//     then closes back to icon form,
//   - the dock itself is untouched (buildDockItems still drives the tabs).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const burst = readSource("src/course/ModuleFolderBurst.tsx");
const burstCss = readSource("src/course/uiverse-folder-card.css");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");

// ---------------------------------------------------------------------------
// 1. The element is installed verbatim
// ---------------------------------------------------------------------------

test("The burst renders the uiverse folder-card markup exactly", () => {
  // The element's root label + hidden checkbox driver
  assert.match(burst, /className="folder-card"/);
  assert.match(burst, /type="checkbox" className="folder-toggle"/);
  // The closed state's floating hint ("Click to open" + blue arrow)
  assert.match(burst, /className="hint-wrapper"/);
  assert.match(burst, /className="hint-text">Click to open</);
  assert.match(burst, /className="hint-arrow" viewBox="0 0 40 40"/);
  // 3D folder: back panel + front flap wrapper + white label pill
  assert.match(burst, /className="folder-back" viewBox="0 0 50 40"/);
  assert.match(burst, /fill="#0056b3"/);
  assert.match(burst, /className="folder-front-wrapper"/);
  assert.match(burst, /fill="rgba\(0, 123, 255, 0\.65\)"/);
  assert.match(burst, /className="folder-label"/);
  // The five files, in element order, with the element's names + tags
  assert.match(burst, /className="file file-5"[\s\S]*?Hero_BG\.png[\s\S]*?PNG • 4\.2 MB/);
  assert.match(burst, /className="file file-4"[\s\S]*?Promo_Cut\.mp4[\s\S]*?MP4 • 128 MB/);
  assert.match(burst, /className="file file-3"[\s\S]*?app_config\.json[\s\S]*?JSON • 12 KB/);
  assert.match(burst, /className="file file-2"[\s\S]*?Q3_Report\.pdf[\s\S]*?PDF • 1\.1 MB/);
  assert.match(burst, /className="file file-1"[\s\S]*?Pitch_Deck\.pptx[\s\S]*?PPTX • 8\.4 MB/);
  assert.match(burst, /className="shine"/);
  assert.match(burst, /className="file-tag"/);
  // The FILES · 05 counter with the pulsing status dot
  assert.match(burst, /className="counter">/);
  assert.match(burst, /className="status-dot"/);
  assert.match(burst, /className="counter-label">FILES</);
  assert.match(burst, /className="counter-number">05</);
  // The rising search pill
  assert.match(burst, /className="folder-search"/);
  assert.match(burst, /placeholder="Search files\.\.\."/);
});

test("The stylesheet keeps the element's exact animation values (scoped)", () => {
  // Every selector is namespaced so .file/.counter/.shine can't leak app-wide…
  assert.match(burstCss, /\.uiverse-folder-burst \.folder-card \{/);
  assert.match(burstCss, /\.uiverse-folder-burst \.folder-toggle:checked ~ \.folder-container \{/);
  // …but the values are the element's own:
  assert.match(burstCss, /width: 170px;\s*\n\s*height: 130px;\s*\n\s*perspective: 1200px;/);
  assert.match(burstCss, /transform: rotateX\(10deg\) rotateY\(-5deg\);/);
  assert.match(burstCss, /transform 0\.6s cubic-bezier\(0\.23, 1, 0\.32, 1\)/);
  assert.match(burstCss, /transform 0\.5s cubic-bezier\(0\.175, 0\.885, 0\.32, 1\.275\)/);
  assert.match(burstCss, /transform: rotateX\(-50deg\);/);
  assert.match(burstCss, /transition: all 0\.6s cubic-bezier\(0\.68, -0\.55, 0\.265, 1\.55\);/);
  assert.match(burstCss, /left: 150%;\s*\n\s*transition: left 0\.8s ease-in-out;\s*\n\s*transition-delay: 0\.3s;/);
  // File fan-out transforms, per file, exact
  assert.match(burstCss, /\.file-1 \{\s*\n\s*transform: translateY\(-70px\) rotate\(-10deg\) translateX\(-15px\) translateZ\(20px\);/);
  assert.match(burstCss, /\.file-2 \{\s*\n\s*transform: translateY\(-55px\) rotate\(8deg\) translateX\(18px\) translateZ\(10px\);/);
  assert.match(burstCss, /\.file-3 \{\s*\n\s*transform: translateY\(-40px\) rotate\(-15deg\) translateX\(-8px\);/);
  assert.match(burstCss, /\.file-4 \{\s*\n\s*transform: translateY\(-25px\) rotate\(12deg\) translateX\(12px\);/);
  assert.match(burstCss, /\.file-5 \{\s*\n\s*transform: translateY\(-10px\) rotate\(-5deg\);/);
  // Colours of the five files + counter pill, exact
  assert.match(burstCss, /\.file-1 \{\s*\n\s*background: #ff5f6d;/);
  assert.match(burstCss, /\.file-2 \{\s*\n\s*background: #ffc371;/);
  assert.match(burstCss, /\.file-3 \{\s*\n\s*background: #4facfe;/);
  assert.match(burstCss, /\.file-4 \{\s*\n\s*background: #00f2fe;/);
  assert.match(burstCss, /\.file-5 \{\s*\n\s*background: #a18cd1;/);
  assert.match(burstCss, /background-color: #a18cd1;/);
  assert.match(burstCss, /background-color: #60a5fa;/);
  // Namespaced keyframes with the element's timing
  assert.match(burstCss, /@keyframes uiverse-float-hint \{[\s\S]*?50% \{\s*\n\s*transform: translateY\(6px\);/);
  assert.match(burstCss, /animation: uiverse-float-hint 2\.5s ease-in-out infinite;/);
  assert.match(burstCss, /@keyframes uiverse-status-pulse \{[\s\S]*?transform: scale\(3\);\s*\n\s*opacity: 0;/);
  assert.match(burstCss, /animation: uiverse-status-pulse 2s infinite;/);
  // The overlay root is fixed + click-transparent (decoration only)
  assert.match(burstCss, /\.uiverse-folder-burst \{\s*\n\s*position: fixed;[\s\S]*?pointer-events: none;/);
});

// ---------------------------------------------------------------------------
// 2. Click-only trigger on the EXISTING Module dock button
// ---------------------------------------------------------------------------

test("The burst triggers only from the existing Module dock tab, on click", () => {
  // Mounted by the player…
  assert.match(coursePlayer, /import ModuleFolderBurst from "\.\/course\/ModuleFolderBurst"/);
  assert.match(coursePlayer, /<ModuleFolderBurst \/>/);
  // …listening for pointerup/click on the dock's Module tab button…
  assert.match(burst, /document\.addEventListener\("pointerup", onActivate, true\)/);
  assert.match(burst, /document\.addEventListener\("click", onActivate, true\)/);
  assert.match(burst, /closest<HTMLButtonElement>\('\[data-course-dock-tab\]\[data-tab="modules"\]'\)/);
  // …primary button only (no burst on right-click release).
  assert.match(burst, /event\.button !== 0\) return/);
  // …one tap = one burst (pointerup + click dedupe via the busy ref).
  assert.match(burst, /busyRef\.current = false/);
});

test("The animation runs its FULL length, then closes back to icon form", () => {
  // Mount closed → open on the next painted frame (the transition actually plays)
  assert.match(burst, /type Phase = "idle" \| "mount" \| "open" \| "closing"/);
  assert.match(burst, /requestAnimationFrame\(\(\) => \{\s*mountFrameRef\.current = window\.requestAnimationFrame/);
  // The checkbox checked state IS the open state — the stylesheet drives it
  assert.match(burst, /checked=\{phase === "open"\}/);
  // Full open hold, then the close, then unmount back to icon form
  assert.match(burst, /setPhase\("closing"\), OPEN_HOLD_MS/);
  assert.match(burst, /setPhase\("idle"\);[\s\S]*?OPEN_HOLD_MS \+ CLOSE_MS/);
  // The card is anchored just above the tapped button
  assert.match(burst, /window\.innerHeight - rect\.top \+ 10/);
});

test("The existing dock button is untouched", () => {
  // The dock still selects tabs through the same shared item builder…
  assert.match(overlay, /const dockItems: GlassDockItem\[\] = buildDockItems\(tab\);/);
  assert.match(overlay, /onSelect=\{\(id\) => props\.onTabChange\(id as DockTab\)\}/);
  // …with its data hooks intact — the burst adds an overlay, it does not
  // modify the button.
  assert.match(overlay, /"data-course-dock-tab": ""/);
  assert.match(overlay, /"data-tab": key/);
  assert.doesNotMatch(overlay, /ModuleFolderBurst/);
});
