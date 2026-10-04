// utils/sketchCanvas.js
//
// Course Player SKETCH — the CANVAS COLOUR model behind the Sketch tab's
// "Canvas" control (the white/preset swatches and the pencil icon's full-RGB
// picker). Pure: no React, no Firestore, no Excalidraw import. Node's test
// runner imports this file directly (`tests/courseSketchCanvasTheme.test.mjs`),
// exactly the way `utils/sketchScene.js` backs the persistence half.
//
// ── Why this file exists at all ───────────────────────────────────────────
// Excalidraw's dark theme is not a palette: it is a FILTER over everything the
// editor paints — `invert(93%) hue-rotate(180deg)` — applied to the canvas
// background AND to every element at render time (both the 2D canvas renderer
// and the SVG/PNG exporters go through `@excalidraw/common`'s
// `applyDarkModeFilter`). That is why the default board, whose scene
// background is `#ffffff`, LOOKS like `#121212`.
//
// So "pick a colour and see that colour" needs the picked colour converted
// into the SCENE value that renders as it:
//
//   light theme → the scene value IS the picked colour (no filter);
//   dark theme  → the scene value is the INVERSE of the filter, so
//                 filter(sceneValue) === picked colour.
//
// The arithmetic below mirrors `@excalidraw/common`'s `applyDarkModeFilter` /
// `removeDarkModeFilter` (tinycolor → cssInvert(93) → cssHueRotate(180°)), and
// `tests/courseSketchCanvasTheme.test.mjs` proves the round trip. It is
// deliberately NOT imported from the package: `@excalidraw/common` is a
// transitive dependency of the editor, not a dependency of this app, and the
// whole model is ~30 lines of channel math.
//
// ── The consequence worth knowing ─────────────────────────────────────────
// The dark filter is not lossless, and this module does not pretend it is:
//
//   · LIGHT canvases (luminance ≥ 0.5) go to the light theme, where no filter
//     is applied at all — so the White preset is exactly `#ffffff`, to the
//     byte, and every pastel is exactly itself.
//   · DARK canvases go to the dark theme, where the learner's ink (a dark
//     scene colour) renders light and stays readable on the colour they chose.
//     Neutral and slate-dark colours are exact there (`#1e293b`, `#111827`,
//     `#212529` — error 0); a SATURATED dark colour loses some saturation,
//     because `invert(93%)` can only reach channels between 18 and 237 and
//     `hue-rotate(180°)` clips what falls outside the cube (`#1e40af` renders
//     as `#284a7a`). That is the editor's own dark mode, not a bug in the
//     mapping — the stock alternative is worse (`#1e40af` renders as the pale
//     `#98b5ff`, because nothing compensates at all).
//
// The UI never lies about it: the swatch in the panel and the "current" dot on
// the pencil paint `sketchRenderedCanvasColor()` — what the canvas is ACTUALLY
// showing — never the value that was asked for.
//
// ── What is remembered, and where ─────────────────────────────────────────
//   1. The BOARD remembers its canvas colour + theme itself: both live in the
//      sketch scene's `appState` (`viewBackgroundColor`, `theme`), which
//      `utils/sketchScene.js` already sanitises and stores, so a board reopens
//      exactly as it was left — on every device, because it rides the same
//      Firestore document as the drawing.
//   2. The LEARNER's last choice is also mirrored to localStorage, so a board
//      that has never chosen a colour (a new module, the next course) opens
//      with the same canvas instead of resetting to the dark default.

/** The theme values Excalidraw's `appState.theme` uses. */
export const SKETCH_THEME_LIGHT = "light";
export const SKETCH_THEME_DARK = "dark";

/** Excalidraw's dark-mode filter, as constants (see the file header). */
export const SKETCH_DARK_FILTER_INVERT_PERCENT = 93;
export const SKETCH_DARK_FILTER_HUE_ROTATE_DEGREES = 180;

/** The board's canvas when nothing has been chosen — Excalidraw's own default. */
export const SKETCH_CANVAS_DEFAULT = { color: "#121212", theme: SKETCH_THEME_DARK };

/**
 * The one-click colours. `color` is what the learner SEES (the rendered
 * colour); the theme it needs is derived, never stored next to it.
 */
export const SKETCH_CANVAS_PRESETS = [
  { id: "dark", label: "Dark", color: "#121212" },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "paper", label: "Paper", color: "#f6f3e7" },
  { id: "sky", label: "Sky", color: "#e4eeff" },
  { id: "mint", label: "Mint", color: "#e3f3ea" },
  { id: "grey", label: "Grey", color: "#eef0f3" },
];

/** localStorage key for the learner's remembered canvas (one per learner). */
export const SKETCH_CANVAS_PREF_KEY = "dc.sketchCanvas.v1";

/** …and the key it becomes once a uid is known. */
export const sketchCanvasPrefKey = (uid) => {
  const owner = String(uid ?? "").trim().slice(0, 128);
  return owner ? `${SKETCH_CANVAS_PREF_KEY}.${owner}` : SKETCH_CANVAS_PREF_KEY;
};

const clampChannel = (value) => Math.min(255, Math.max(0, Math.round(value)));

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hex2 = (value) => value.toString(16).padStart(2, "0");

/**
 * Whatever the learner's browser hands us (a hex field's text, Excalidraw's
 * `viewBackgroundColor`, a stored preference) as `#rrggbb` — or null, so a
 * caller always has one thing to branch on. `#rgb`, `#rrggbb`, `rgb()` and
 * `rgba()` are accepted; alpha is dropped (a canvas is opaque here).
 */
export const normalizeSketchColor = (value) => {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  let match = /^#([0-9a-f]{6})$/.exec(text);
  if (match) return `#${match[1]}`;
  match = /^#([0-9a-f]{3})$/.exec(text);
  if (match) {
    const [r, g, b] = match[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(text);
  if (match) {
    const [r, g, b] = match.slice(1, 4).map((part) => clampChannel(Number(part)));
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  return null;
};

/** The three channels of a colour, or null when it is not one. */
export const sketchColorChannels = (value) => {
  const hex = normalizeSketchColor(value);
  if (!hex) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
};

/** Channels back to the canonical `#rrggbb` (clamped, so a picker can be naive). */
export const sketchRgbToHex = (r, g, b) =>
  `#${hex2(clampChannel(Number(r) || 0))}${hex2(clampChannel(Number(g) || 0))}${hex2(clampChannel(Number(b) || 0))}`;

/**
 * Perceived brightness, 0…1 — what decides whether a canvas is a "light" or a
 * "dark" surface for the theme that keeps the learner's ink readable.
 */
export const sketchColorLuminance = (value) => {
  const rgb = sketchColorChannels(value);
  if (!rgb) return 0;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
};

/**
 * The theme a canvas colour needs: light surfaces stay exactly the colour that
 * was picked in the light theme (and keep Excalidraw's dark default ink),
 * dark surfaces use the dark theme, where that same ink renders light.
 */
export const sketchThemeForColor = (value) =>
  sketchColorLuminance(value) >= 0.5 ? SKETCH_THEME_LIGHT : SKETCH_THEME_DARK;

/** `invert(percent%)` on one channel, exactly as the CSS filter does it. */
const invertChannel = (channel, percent) => {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return clampChannel(channel * (1 - p) + (255 - channel) * p);
};

/** …and its inverse, which is what makes a dark canvas land on the right pixel. */
const restoreInvertedChannel = (channel, percent) => {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return clampChannel((channel - 255 * p) / (1 - 2 * p));
};

/** The CSS `hue-rotate()` colour matrix — the same one `applyDarkModeFilter` uses. */
const hueRotate = ({ r, g, b }, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const matrix = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
  const red = (r / 255) * matrix[0] + (g / 255) * matrix[1] + (b / 255) * matrix[2];
  const green = (r / 255) * matrix[3] + (g / 255) * matrix[4] + (b / 255) * matrix[5];
  const blue = (r / 255) * matrix[6] + (g / 255) * matrix[7] + (b / 255) * matrix[8];
  return { r: clampChannel(red * 255), g: clampChannel(green * 255), b: clampChannel(blue * 255) };
};

/** A colour as the dark theme PAINTS it (Excalidraw's `applyDarkModeFilter`). */
export const sketchColorUnderDarkFilter = (value) => {
  const rgb = sketchColorChannels(value);
  if (!rgb) return null;
  const inverted = {
    r: invertChannel(rgb.r, SKETCH_DARK_FILTER_INVERT_PERCENT),
    g: invertChannel(rgb.g, SKETCH_DARK_FILTER_INVERT_PERCENT),
    b: invertChannel(rgb.b, SKETCH_DARK_FILTER_INVERT_PERCENT),
  };
  const rotated = hueRotate(inverted, SKETCH_DARK_FILTER_HUE_ROTATE_DEGREES);
  return sketchRgbToHex(rotated.r, rotated.g, rotated.b);
};

/**
 * The value to hand Excalidraw's `appState.viewBackgroundColor` so the canvas
 * RENDERS as `value` in the given theme. In the dark theme that is the
 * inverse filter (Excalidraw's `removeDarkModeFilter`): hue-rotate back, then
 * undo the 93% invert.
 */
export const sketchSceneCanvasColor = (value, theme = SKETCH_THEME_DARK) => {
  const hex = normalizeSketchColor(value);
  if (!hex) return null;
  if (theme !== SKETCH_THEME_DARK) return hex;
  const rgb = sketchColorChannels(hex);
  const rotated = hueRotate(rgb, SKETCH_DARK_FILTER_HUE_ROTATE_DEGREES);
  return sketchRgbToHex(
    restoreInvertedChannel(rotated.r, SKETCH_DARK_FILTER_INVERT_PERCENT),
    restoreInvertedChannel(rotated.g, SKETCH_DARK_FILTER_INVERT_PERCENT),
    restoreInvertedChannel(rotated.b, SKETCH_DARK_FILTER_INVERT_PERCENT),
  );
};

/**
 * The other direction: what the learner actually SEES for a stored scene
 * colour. This is what the swatch in the panel paints, so the control can
 * never claim a colour the canvas is not showing.
 */
export const sketchRenderedCanvasColor = (sceneColor, theme = SKETCH_THEME_DARK) => {
  const hex = normalizeSketchColor(sceneColor);
  if (!hex) return null;
  return theme === SKETCH_THEME_DARK ? sketchColorUnderDarkFilter(hex) : hex;
};

/**
 * Read a board's canvas out of an Excalidraw `appState` (or a saved scene's
 * `appState`) — `null` when that board has never chosen one, which is what
 * lets the remembered preference apply to it.
 */
export const sketchCanvasFromAppState = (appState) => {
  if (!isPlainObject(appState)) return null;
  const sceneColor = normalizeSketchColor(appState.viewBackgroundColor);
  if (!sceneColor) return null;
  const theme = appState.theme === SKETCH_THEME_LIGHT ? SKETCH_THEME_LIGHT : SKETCH_THEME_DARK;
  return { theme, sceneColor, rendered: sketchRenderedCanvasColor(sceneColor, theme) };
};

/** The `appState` patch that puts a RENDERED colour on the canvas. */
export const sketchCanvasAppState = (value) => {
  const rendered = normalizeSketchColor(value);
  if (!rendered) return null;
  const theme = sketchThemeForColor(rendered);
  return { theme, viewBackgroundColor: sketchSceneCanvasColor(rendered, theme) };
};

/** `localStorage` when it exists and is usable, else null (private mode, SSR). */
const defaultStorage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/**
 * The learner's remembered canvas colour — the preference that follows them to
 * boards that never chose one. Never throws: an empty/corrupt/disabled store
 * simply means "no preference".
 */
export const readSketchCanvasPreference = (uid, storage = defaultStorage()) => {
  try {
    const raw = storage?.getItem(sketchCanvasPrefKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const color = normalizeSketchColor(parsed?.color);
    if (!color) return null;
    return {
      color,
      theme: sketchThemeForColor(color),
      updatedAt: typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
};

/** Remember a choice. Returns what was stored, or null when nothing could be. */
export const writeSketchCanvasPreference = (uid, value, storage = defaultStorage()) => {
  const color = normalizeSketchColor(value);
  if (!color) return null;
  const preference = { color, theme: sketchThemeForColor(color), updatedAt: Date.now() };
  try {
    storage?.setItem(sketchCanvasPrefKey(uid), JSON.stringify({ color, updatedAt: preference.updatedAt }));
  } catch {
    /* private mode / quota — the board itself still remembers its own canvas */
  }
  return preference;
};
