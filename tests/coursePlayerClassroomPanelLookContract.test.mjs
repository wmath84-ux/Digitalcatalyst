// tests/coursePlayerClassroomPanelLookContract.test.mjs
//
// The 3D Classroom is gone (tests/classroom3dRemovalContract.test.mjs), but the
// owner kept the one thing they liked about it — HOW ITS PANELS LOOKED — and
// asked for exactly that on the flat player, for "relief, maximum visibility
// and comfortability":
//
//   "3D class room ke andar jo panel ka design aur look hai, exactly vahi flat
//    player ke panels aur background per apply karo."
//
// So src/course/flatPlayerChrome.css dresses the flat Split Deck in the room's
// own material: the board's near-black plate, the desk's navy gradient, the
// wall headers, the floating chooser's gradient + bloom, the HUD's frosted
// tray, the row states and the five surface accents — over a backdrop of the
// room instead of the busy winter scene showing through every pane.
//
// Asked to pin the brief down, the owner answered four questions (2026-09-08):
// the WHOLE panel language goes on; NOTHING floats — the dock, the peek rails
// and the divider's pills are solid plates with no blur; the room's module ⇄
// content CONNECTION is kept (cyan module → dashed rail → violet lessons); and
// the backdrop becomes the room's own deep-navy gradient.
//
// Four things this contract exists to protect:
//
//   1. PROVENANCE — the values are the room's, not an invented palette. Every
//      number below was lifted from classroom3d.css / panels.tsx /
//      RoomSheet.tsx before those files were deleted.
//   2. PAINT ONLY — the flat player's behaviour was explicitly out of bounds
//      ("don't touch even a single code of flat player"). The file may set
//      colour, shadow, radius and font smoothing; it may NOT set a single
//      layout property, so no pane, row, divider or dock can move. The one
//      exception is the §6b rail, an inert absolutely-positioned ::before.
//   3. THE FOUR ANSWERS — solid not floating, and the connection kept.
//   4. SCOPE — every rule is inside `.course-player-shell` (or on the delete
//      dialog the player portals to <body>), and the app-wide glass token in
//      index.css is untouched, so the store, the headers and every other route
//      keep their published material.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const CSS_FILE = "src/course/flatPlayerChrome.css";
const css = read(CSS_FILE);
const indexCss = read("src/index.css");
const main = read("src/main.tsx");

/** The flat player's own sources — what a selector in the port must exist in. */
const FLAT_SOURCES = [
  "src/CoursePlayerApp.tsx",
  ...fs.readdirSync(new URL("../src/course", import.meta.url)).filter((f) => f.endsWith(".tsx")).map((f) => `src/course/${f}`),
  "src/components/glass-dock/GlassDock.tsx",
  "src/components/ui/glass.tsx",
  "src/index.css",
].map(read).join("\n");

/* ── A tiny CSS block walker ───────────────────────────────────────────────
   Enough for this one file: comments out, then every `selector { … }` pair at
   any nesting depth, with the @-rule it sits under recorded alongside. */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

function rules(text) {
  const out = [];
  const walk = (source, conditions) => {
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf("{", i);
      if (open === -1) break;
      const selector = source.slice(i, open).trim();
      // Find this block's matching brace.
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === "{") depth += 1;
        else if (source[j] === "}") depth -= 1;
        j += 1;
      }
      const body = source.slice(open + 1, j - 1);
      if (selector.startsWith("@media") || selector.startsWith("@supports")) {
        walk(body, [...conditions, selector]);
      } else if (selector.startsWith("@")) {
        // keyframes / font-face and friends: this file declares none.
        out.push({ selector, body, conditions, atRule: selector });
      } else {
        out.push({ selector, body, conditions, atRule: null });
      }
      i = j;
    }
  };
  walk(stripComments(text), []);
  return out.filter((rule) => !rule.atRule);
}

const declarations = (body) =>
  body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(":");
      return { property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim() };
    });

const ALL_RULES = rules(css);

/* ── 1. The port is wired in, after the material it re-points ───────────── */

test("the ported stylesheet is imported LAST, so it wins the ties it re-points", () => {
  const order = [...main.matchAll(/import "(\.\/[^"]+\.css)";/g)].map((m) => m[1]);
  assert.ok(order.includes("./course/flatPlayerChrome.css"), "the port is imported");
  assert.ok(
    order.indexOf("./course/flatPlayerChrome.css") > order.indexOf("./glass.css"),
    `import order must be after glass.css, got ${order.join(" → ")}`,
  );
  assert.ok(order.indexOf("./course/flatPlayerChrome.css") > order.indexOf("./index.css"));
});

/* ── 2. Provenance: the room's own values ───────────────────────────────── */

test("the plates are the classroom's plates", () => {
  // BoardPanel's body + title bar, WallHeader, DeskPanel's gradient.
  for (const value of ["#060910", "#0d1424", "#0b1120", "#0b1024", "#070a14"]) {
    assert.ok(css.includes(value), `missing the room's plate ${value}`);
  }
  assert.match(css, /\.course-player-shell \[data-course-lesson-pane\] \{[^}]*--dc-flat-board/s);
  assert.match(css, /\.course-player-shell \[data-course-study-pane\] \{[^}]*--dc-flat-desk-top/s);
});

test("the floating chooser's material is the RoomSheet's", () => {
  // RoomSheet: gradient plate, 22px blur, black drop + inset hairline + accent
  // bloom, over a radial scrim that keeps the room lit but pushed back.
  assert.ok(css.includes("linear-gradient(180deg, rgba(15, 19, 36, 0.94), rgba(8, 11, 22, 0.96))"));
  assert.ok(css.includes("blur(22px) saturate(150%)"));
  assert.ok(css.includes("0 40px 90px rgba(0, 0, 0, 0.6)"));
  assert.ok(css.includes("radial-gradient(120% 80% at 50% 45%, rgba(4, 6, 14, 0.32), rgba(4, 6, 14, 0.62))"));
  assert.match(css, /\[data-course-confirm-card\] \{[^}]*0 40px 90px rgba\(0, 0, 0, 0\.6\)/s);
  assert.match(css, /\[data-course-confirm-backdrop\] \{[^}]*var\(--dc-flat-scrim\)/s);
});

test("the HUD / control-tray material is the room's — and where it still floats", () => {
  // The room's furniture glass and its frost survive as tokens, and they are
  // what the player's own chrome-glass token is re-pointed at, so the surfaces
  // that read it (the rich-text toolbar, the mind map library, the divider's
  // pills' fallback) pick the room's material up with no edit of their own.
  assert.match(css, /--dc-flat-glass: rgba\(9, 12, 24, 0\.62\);/, "the HUD's glass");
  assert.match(css, /--dc-flat-glass-deep: rgba\(9, 12, 24, 0\.66\);/, "the control tray's glass");
  assert.match(css, /--dc-flat-blur: blur\(18px\) saturate\(150%\);/, "the HUD's frost");
  assert.match(css, /--dc-chrome-glass: var\(--dc-flat-glass\);/);
  assert.match(css, /--dc-chrome-glass-blur: var\(--dc-flat-blur\);/);
  // The dock and the rails are the exception the owner asked for: solid plates,
  // pinned by "nothing floats" below. The tray's deep shadow is still theirs.
  assert.match(css, /--dc-flat-shadow-tray: 0 18px 55px rgba\(0, 0, 0, 0\.48\);/);
  assert.match(css, /\[data-course-dock\] \[data-glass-dock\] \{[^}]*var\(--dc-flat-shadow-tray\) !important/s);
});

test("the rows, their states and their ink are the room's", () => {
  // RoomSheet rows + DeskPanel module/lesson rows.
  assert.ok(css.includes("rgba(255, 255, 255, 0.04)"), "row plate");
  assert.ok(css.includes("rgba(255, 255, 255, 0.09)"), "row hover");
  assert.ok(css.includes("rgba(255, 255, 255, 0.08)"), "row hairline");
  assert.ok(css.includes("rgba(255, 255, 255, 0.18)"), "row hover hairline");
  assert.ok(css.includes("rgba(255, 255, 255, 0.94)"), "title ink");
  assert.ok(css.includes("rgba(255, 255, 255, 0.45)"), "sub ink");
  assert.match(css, /border-radius: 16px;/, "the room's 16px row radius");
  // Browsed module = cyan, playing/open lesson = violet, locked = amber.
  assert.match(css, /\[data-course-overlay-module\]\[data-selected="true"\][^}]*--dc-flat-cyan-wash/s);
  assert.match(css, /\[data-course-sheet-row\]\[data-selected="true"\][^}]*--dc-flat-violet-wash/s);
  assert.match(css, /\[data-course-sheet-row\]\[data-locked="true"\][^}]*rgba\(245, 158, 11, 0\.32\)/s);
});

test("the five surface accents are the room's five", () => {
  for (const accent of ["#38bdf8", "#22d3ee", "#a78bfa", "#8b5cf6", "#f59e0b", "#6ee7b7"]) {
    assert.ok(css.includes(accent), `missing accent ${accent}`);
  }
  // Board sky, desk cyan, mind violet, notes amber, done emerald.
  assert.match(css, /--dc-flat-sky: #38bdf8;/);
  assert.match(css, /--dc-flat-cyan: #22d3ee;/);
  assert.match(css, /--dc-flat-violet: #a78bfa;/);
  assert.match(css, /--dc-flat-amber: #f59e0b;/);
  assert.match(css, /--dc-flat-done: #6ee7b7;/);
  // The notes wall's accent is the one the note cards wear.
  assert.match(css, /\[data-course-notes-grid\] \[data-course-note\]:focus-within \{[^}]*--dc-flat-amber-wash/s);
});

test("the backdrop, scrollbars and type rendering are the room's", () => {
  // The player paints its own room now instead of letting the scene through.
  assert.match(css, /\.course-player-shell \{[^}]*background-color: #04060e;/s);
  assert.match(css, /linear-gradient\(to bottom, #0d1424 0%, #080c18 46%, #04060e 100%\)/);
  // `.dc-classroom-surface` scrollbars: 8px, white/18 thumb, 99px radius.
  assert.match(css, /::-webkit-scrollbar \{[^}]*width: 8px;[^}]*height: 8px;/s);
  assert.match(css, /::-webkit-scrollbar-thumb \{[^}]*rgba\(255, 255, 255, 0\.18\)[^}]*border-radius: 99px/s);
  assert.match(css, /scrollbar-color: rgba\(255, 255, 255, 0\.18\) transparent;/);
  // Panels read at arm's length, like a board across a room.
  assert.match(css, /-webkit-font-smoothing: antialiased;/);
  assert.match(css, /text-rendering: optimizeLegibility;/);
});

test("the player's own palette is re-pointed at the room's, by name", () => {
  // Same token names src/index.css declares, so the components that already
  // read them change paint without being edited.
  for (const token of ["--course-text", "--course-muted", "--course-border", "--course-soft", "--course-soft-hover", "--course-loading", "--course-strong"]) {
    assert.ok(new RegExp(`${token}:`).test(css), `${token} is not re-pointed`);
  }
  // The site-wide chrome glass, re-scoped to the player only.
  assert.match(css, /--dc-chrome-glass: var\(--dc-flat-glass\);/);
  assert.match(css, /--dc-chrome-glass-blur: var\(--dc-flat-blur\);/);
  // A light theme that is a DAYLIT room — white ink is the player's contract
  // in both themes, so the plate lifts a step and never goes white.
  assert.match(css, /\.course-player-shell\[data-course-theme="light"\] \{/);
  assert.match(css, /\.course-player-shell\[data-course-theme="light"\] \{[^}]*--dc-flat-desk-top: #1c2740;/s);
});

/* ── 3. Paint only: the flat player cannot move ─────────────────────────── */

/** The §6b module ⇄ content rail is the one rule that draws a new box. */
const isConnector = (rule) => rule.selector.includes("::before");

test("every declaration is paint — no layout property anywhere in the port", () => {
  const PAINT = new Set([
    "background", "background-color", "background-image",
    "color", "box-shadow", "border-radius",
    "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "backdrop-filter", "-webkit-backdrop-filter",
    "outline-color", "transition",
    "scrollbar-width", "scrollbar-color",
    "-webkit-font-smoothing", "text-rendering",
  ]);
  // A scrollbar's own box is paint, not the player's layout.
  const SCROLLBAR_ONLY = new Set(["width", "height", "background"]);
  // The connector's own box: an absolutely positioned, non-interactive
  // pseudo-element inside a row that is already `position: relative`.
  const CONNECTOR_ONLY = new Set(["content", "position", "left", "top", "bottom", "border-left", "pointer-events"]);

  const offenders = [];
  for (const rule of ALL_RULES) {
    const scrollbar = /-webkit-scrollbar/.test(rule.selector);
    for (const { property, value } of declarations(rule.body)) {
      if (property.startsWith("--")) continue; // the palette itself
      if (PAINT.has(property)) continue;
      if (scrollbar && SCROLLBAR_ONLY.has(property)) continue;
      if (isConnector(rule) && CONNECTOR_ONLY.has(property)) continue;
      offenders.push(`${rule.selector} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(offenders, [], `layout properties would move the flat player:\n${offenders.join("\n")}`);
});

test("the connector is the ONLY rule that positions anything, and it is inert", () => {
  const body = stripComments(css);
  assert.doesNotMatch(body, /@keyframes/);
  assert.doesNotMatch(body, /(^|[^-])animation\s*:/);
  assert.doesNotMatch(body, /\bz-index\s*:/);
  assert.doesNotMatch(body, /\bdisplay\s*:/);
  assert.doesNotMatch(body, /\btransform\s*:/);
  for (const property of ["position", "content", "pointer-events"]) {
    const offenders = ALL_RULES.filter(
      (rule) => !isConnector(rule) && declarations(rule.body).some((d) => d.property === property),
    ).map((rule) => rule.selector);
    assert.deepEqual(offenders, [], `${property} outside the connector:\n${offenders.join("\n")}`);
  }
  // And the connector itself cannot take a tap or shift a row.
  const rail = ALL_RULES.find((rule) => /data-row-kind="file"\]::before$/.test(rule.selector));
  assert.ok(rail, "the module ⇄ content rail exists");
  const railDeclarations = Object.fromEntries(declarations(rail.body).map((d) => [d.property, d.value]));
  assert.equal(railDeclarations.position, "absolute");
  assert.equal(railDeclarations["pointer-events"], "none");
  assert.equal(railDeclarations.content, '""');
  // A reduced-motion learner loses only the hover transitions.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

/* ── 3b. The owner's two structural asks ────────────────────────────────── */

test("a module and its own content stay visibly connected, as in the room's chooser", () => {
  // The room drew an expanded module's lessons as a sublist: a dashed hairline
  // down the left, cyan parent, violet content. The flat list is one flat
  // column, so the rail is painted in the file rows' own left gutter.
  const rail = ALL_RULES.find((rule) => /data-row-kind="file"\]::before$/.test(rule.selector));
  const painted = Object.fromEntries(declarations(rail.body).map((d) => [d.property, d.value]));
  assert.match(painted["border-left"], /1px dashed rgba\(255, 255, 255, 0\.14\)/, "the room's dashed hairline");
  assert.equal(painted.left, "3px", "inside the row's own px-2 gutter, clear of its icon plate");
  // It bridges the list's 6px `space-y-1.5` gap so a run of lessons reads as
  // one connected rail rather than as dashes with holes in them.
  assert.equal(painted.top, "-6px");
  assert.equal(painted.bottom, "-6px");

  // …and it stops at a module's last lesson instead of claiming the next one.
  const trimmed = ALL_RULES.filter((rule) => isConnector(rule) && /bottom: 0/.test(rule.body));
  assert.ok(trimmed.length >= 1, "the rail is trimmed at the end of a group");
  assert.ok(
    trimmed.some((rule) => /:has\(\+ \[data-row-kind="module"\]\)/.test(rule.selector)),
    "the trim looks ahead for the next module row",
  );
  assert.ok(trimmed.some((rule) => /:last-child/.test(rule.selector)), "…and for the end of the list");

  // Cyan parent, violet content — the desk's own two-column accent pairing.
  assert.match(css, /\[data-course-overlay-module\]\[data-selected="true"\] \{[^}]*--dc-flat-cyan-wash/s);
  assert.match(css, /\[data-course-sheet-row\]\[data-row-kind="file"\] \{[^}]*rgba\(167, 139, 250, 0\.07\)/s);
  assert.match(css, /\[data-course-sheet-row\]\[data-selected="true"\][^}]*--dc-flat-violet-wash/s);
});

test("nothing floats: the dock, the rails and the divider's pills are solid plates", () => {
  // The room's HUD and trays were frosted glass over a canvas. The flat player
  // gets the same plate family with NO blur, so nothing reads as floating.
  const solid = [
    '[data-course-dock] [data-glass-dock]',
    '[data-course-peek-rail]',
    '[data-course-split-grabber]',
    '[data-course-image-viewer] [data-glass-dock]',
  ];
  for (const target of solid) {
    const rule = ALL_RULES.find((r) => r.selector.includes(target));
    assert.ok(rule, `no solid-plate rule for ${target}`);
    const painted = Object.fromEntries(declarations(rule.body).map((d) => [d.property, d.value]));
    // An opaque plate: a gradient of literal colours, never an rgba tint.
    assert.match(painted.background ?? "", /linear-gradient\(180deg, #141b30 0%, #0a0e1c 100%\)|linear-gradient\(180deg, #16203a 0%, #0b1020 100%\)/, `${target} is not a solid plate`);
    assert.doesNotMatch(painted.background ?? "", /rgba\(/, `${target} still paints a translucent tint`);
    // Inline paint (GlassDock / CHROME_GLASS) only yields to `!important`.
    assert.match(rule.body, /!important/, `${target} cannot reach the inline material`);
  }
  // Blur is switched OFF wherever the port owns the surface, and never turned
  // up: the room's frosted HUD material is not used on the dock or the rails.
  for (const rule of ALL_RULES.filter((r) => /dock|peek-rail|grabber|ratio-bubble/.test(r.selector))) {
    for (const { property, value } of declarations(rule.body)) {
      if (/backdrop-filter/.test(property)) {
        assert.equal(value, "none !important", `${rule.selector} still frosts`);
      }
    }
  }
  // The tooltips are solid too.
  assert.match(css, /data-glass-dock-item\] > div:first-child \{[^}]*background: var\(--dc-flat-board-head\) !important/s);
});

test("'borders' are inset shadows, so no row grows by 2px", () => {
  // A real `border` on an auto-height row would change every list's geometry
  // (and the dock's scroll-snap centres). The room's hairlines are painted
  // inside the box instead.
  const realBorders = ALL_RULES.flatMap((rule) =>
    declarations(rule.body)
      // The §6b rail draws its dashed line on a pseudo-element of its own, so
      // no row's box is involved; every real element stays border-free.
      .filter(({ property }) => /^border(-top|-right|-bottom|-left)?$/.test(property))
      .filter(() => !isConnector(rule))
      .map(({ property, value }) => `${rule.selector} { ${property}: ${value} }`),
  );
  assert.deepEqual(realBorders, [], realBorders.join("\n"));
  // Existing border COLOURS may be re-pointed (the box already has them).
  assert.match(css, /border-bottom-color: var\(--dc-flat-line\);/);
});

/* ── 4. Scope: nothing leaks out of the player ──────────────────────────── */

test("every rule is scoped to the player shell or its portaled dialog", () => {
  const unscoped = ALL_RULES.map((rule) => rule.selector).filter(
    (selector) =>
      !selector.split(",").every((part) => {
        const trimmed = part.trim();
        return (
          trimmed.startsWith(".course-player-shell") ||
          // The delete confirmation is portaled to <body>, so it is addressed
          // by its own attribute — and only the course player ever renders it.
          trimmed.startsWith("[data-course-confirm-")
        );
      }),
  );
  assert.deepEqual(unscoped, [], `unscoped rules:\n${unscoped.join("\n")}`);
});

test("the app-wide glass token keeps its published material", () => {
  // The store's headers, the desktop shell and every other route read the ROOT
  // token; only the player re-scopes it. (Pinned from the other side by
  // tests/storeChromeDockDragScrollContract.test.mjs.)
  assert.match(indexCss, /--dc-chrome-glass: rgba\(60, 62, 68, 0\.105\)/);
  assert.match(indexCss, /\.course-player-shell \{[^}]*--course-bg/s, "the player's own palette block survives in index.css");
  assert.match(indexCss, /\.course-player-shell\[data-course-theme="light"\]/);
});

/* ── 5. Every selector really exists in the flat player ─────────────────── */

test("each attribute hook the port paints is one the flat player renders", () => {
  const attrs = new Set();
  for (const rule of ALL_RULES) {
    for (const match of rule.selector.matchAll(/\[([a-z-]+[a-z0-9-]*)[=\]]/g)) attrs.add(match[1]);
  }
  const missing = [...attrs].filter((attr) => !FLAT_SOURCES.includes(attr));
  assert.deepEqual(missing, [], `selectors with no matching element:\n${missing.join("\n")}`);
  // The surfaces the port dresses, spelled out, so a rename in src/course
  // cannot silently leave a rule painting nothing.
  for (const attr of [
    "data-course-lesson-pane", "data-course-study-pane", "data-course-study-chrome",
    "data-course-overlay-title", "data-course-overlay-tab", "data-course-sheet-row",
    "data-course-panel-row", "data-course-panel-section-label", "data-course-overlay-module",
    "data-course-overlay-file", "data-course-dock", "data-glass-dock", "data-course-note",
    "data-course-notes-grid", "data-course-mindmap-library", "data-course-mindmap-map-card",
    "data-course-editor-zoom", "data-course-image-viewer", "data-course-viewer-audio",
    "data-course-confirm-card", "data-course-confirm-backdrop",
  ]) {
    assert.ok(attrs.has(attr), `the port no longer paints ${attr}`);
    assert.ok(FLAT_SOURCES.includes(attr), `${attr} does not exist in the flat player`);
  }
});

test("each class the port paints is one the flat player renders", () => {
  const classes = new Set();
  for (const rule of ALL_RULES) {
    for (const match of rule.selector.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) classes.add(match[1]);
  }
  const missing = [...classes].filter((name) => !FLAT_SOURCES.includes(name));
  assert.deepEqual(missing, [], `classes with no matching element:\n${missing.join("\n")}`);
  assert.ok(classes.has("course-player-shell"));
  assert.ok(classes.has("course-rich-surface"), "the notes writing surface");
});
