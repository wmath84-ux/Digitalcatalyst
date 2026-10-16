// tests/paidPageToProductPageWiring.test.mjs
//
// Both ends of one tap: the course player's Paid page → the product detail
// page's Paid section.
//
// Owner brief (2026-10-16):
//
//   "Jab user click kare us paid module ke type per to wah seedhe product detail
//    page ke paid section me chala jaye … usme jo bhi paid module ya paid type
//    usne click kiya hai woh highlight ya blink ho jaye jaise use dikh jaye, aur
//    wahin se purchase kar sake."
//
// The behaviour itself is proven in
//   · `tests/paidListingRuntime.test.mjs`  (the rows, the locks, the link),
// and this file pins the wiring that carries it across the two pages:
//
//   · the player's Paid tap writes `#/product/<id>?tab=Paid&paid=<rowKey>`
//     and remembers the course as the way back;
//   · the product page opens its Paid tab, finds that EXACT row
//     (`[data-pdp-paid-item]`, or the owned list once bought), scrolls to it
//     and blinks it — with the blink called off for reduced motion;
//   · the product page's back control returns to the course it came from;
//   · the product route still resolves with a query string on it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const PLAYER = read("src/CoursePlayerApp.tsx");
const OVERLAY = read("src/course/CourseOverlay.tsx");
const PDP = read("src/PdpApp.tsx");
const MAIN = read("src/main.tsx");
const PDP_CSS = read("src/pdp-minimal.css");

/* ── 1 · the course player's Paid page ─────────────────────────────────── */

test("the Paid page hands the product page the row key it was tapped on", () => {
  // The overlay takes the link and the panel fires it for every paid row.
  assert.match(OVERLAY, /onOpenPaid\?: \(paidKey: string\) => void;/);
  const panel = OVERLAY.slice(OVERLAY.indexOf("function PaidLibraryPanel"), OVERLAY.indexOf("function ComingSoonPanel"));
  assert.match(panel, /if \(onOpenPaid\) \{/);
  assert.match(panel, /onOpenPaid\(entry\.paidKey\);/);
  // The player builds the address and remembers the way back BEFORE it leaves.
  const handler = PLAYER.slice(PLAYER.indexOf("const handleOpenPaid"), PLAYER.indexOf("const handleBuyModule"));
  assert.match(handler, /rememberPdpReturn\(String\(product\.id\), `#\/course\/\$\{encodeURIComponent\(String\(product\.id\)\)\}`\);/);
  assert.match(handler, /window\.location\.hash = buildPaidDeepLink\(String\(product\.id\), paidKey\);/);
  assert.ok(handler.indexOf("rememberPdpReturn") < handler.indexOf("window.location.hash"), "remember, then go");
  assert.match(PLAYER, /onOpenPaid=\{handleOpenPaid\}/);
  // The Modules library's own locked-resource flow is untouched.
  assert.match(PLAYER, /onBuyModule=\{handleBuyModule\}/);
  assert.match(PLAYER, /onBuyUpdate=\{onPurchaseUpdate\}/);
  assert.match(PLAYER, /import \{ buildPaidDeepLink, rememberPdpReturn \} from "\.\/utils\/paidDeepLink";/);
});

/* ── 2 · the product detail page's Paid section ────────────────────────── */

test("the product page opens its Paid tab on that row and blinks it", () => {
  assert.match(PDP, /import \{ readPaidDeepLink, readPdpReturn, takePdpReturn \} from "\.\/utils\/paidDeepLink";/);
  assert.match(PDP, /const link = readPaidDeepLink\(window\.location\.hash\);/);
  assert.match(PDP, /if \(!link\.paidTab\) return;\n      setActiveTab\("Paid"\);/);
  assert.match(PDP, /setPaidJump\(link\.paidKey \? \{ key: link\.paidKey, at: Date\.now\(\) \} : null\);/);
  // The exact row — the paid list first, the owned list once it is bought.
  assert.match(PDP, /document\.querySelectorAll<HTMLElement>\("\[data-pdp-paid-item\], \[data-pdp-owned-item\]"\)/);
  assert.match(PDP, /row\.getAttribute\("data-pdp-paid-item"\) === paidJump\.key/);
  assert.match(PDP, /match\.setAttribute\("data-pdp-paid-focus", "true"\);/);
  assert.match(PDP, /match\.scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth", block: "center", inline: "nearest" \}\);/);
  assert.match(PDP, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  // The mark is temporary: it is cleared, and the rows arrive asynchronously.
  assert.match(PDP, /mark\?\.removeAttribute\("data-pdp-paid-focus"\);/);
  assert.match(PDP, /\}, 6000\);/);
  assert.match(PDP, /if \(tries\+\+ < 90\) frame = window\.requestAnimationFrame\(find\);/);
  // And the learner is told where he is.
  assert.match(PDP, /data-pdp-paid-from-course/);
});

test("the product page's back control returns to the course it came from", () => {
  const back = PDP.slice(PDP.indexOf("const handlePdpBack"), PDP.indexOf("const gallery = useMemo"));
  assert.match(back, /const back = takePdpReturn\(product\.id\);/);
  assert.match(back, /window\.location\.hash = back;/);
  assert.match(back, /onBack\(\);/);
  assert.match(PDP, /onClick=\{handlePdpBack\} className="min-h-9 shrink-0 px-1 transition hover:text-white">\{courseReturn \? "Course" : "Store"\}<\/button>/);
  assert.match(PDP, /const \[courseReturn, setCourseReturn\] = useState\(""\);/);
});

test("the blink is a real, motion-safe animation — and the route still resolves", () => {
  assert.match(PDP_CSS, /\[data-pdp-root\] \[data-pdp-paid-focus\] \{/);
  assert.match(PDP_CSS, /animation: dc-pdp-paid-blink 1\.15s ease-in-out 4;/);
  assert.match(PDP_CSS, /@keyframes dc-pdp-paid-blink \{/);
  assert.match(PDP_CSS, /@media \(prefers-reduced-motion: reduce\) \{\n  \[data-pdp-root\] \[data-pdp-paid-focus\] \{ animation: none;/);
  // `#/product/<id>?tab=Paid&paid=…` must keep resolving to `<id>`.
  assert.match(MAIN, /const routeId = hash\.startsWith\(PRODUCT_HASH\) \? decodeURIComponent\(hash\.slice\(PRODUCT_HASH\.length\)\.split\("\?"\)\[0\]\) : "";/);
});
