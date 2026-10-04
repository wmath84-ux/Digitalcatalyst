// tests/courseSketchCanvasTheme.test.mjs
//
// The Course Player Sketch tab's CANVAS COLOUR model — the white/preset
// swatches and the pencil icon's full-RGB picker. Everything here runs with no
// React, no Firestore and no Excalidraw bundle: `utils/sketchCanvas.js` is
// deliberately dependency-free.
//
// The contract this file defends, in one line each:
//   · "White" is a real, one-click canvas colour, and it is EXACTLY #ffffff;
//   · the colour a learner picks is the colour the canvas RENDERS — in the
//     light theme directly, and in the dark theme through the inverse of
//     Excalidraw's own `invert(93%) hue-rotate(180deg)` filter;
//   · a colour, its theme and the scene value are ONE choice: they can never
//     be split into a pair that renders something else;
//   · the learner's last choice survives a reopen, on this device, without
//     touching the cloud or the board;
//   · a full-RGB picker can be naive (any channel value, any hex text) and
//     still produce a value Excalidraw accepts.

import test from "node:test";
import assert from "node:assert/strict";

import {
  SKETCH_CANVAS_DEFAULT,
  SKETCH_CANVAS_PRESETS,
  SKETCH_CANVAS_PREF_KEY,
  SKETCH_THEME_DARK,
  SKETCH_THEME_LIGHT,
  normalizeSketchColor,
  readSketchCanvasPreference,
  sketchCanvasAppState,
  sketchCanvasFromAppState,
  sketchCanvasPrefKey,
  sketchColorChannels,
  sketchColorLuminance,
  sketchColorUnderDarkFilter,
  sketchRenderedCanvasColor,
  sketchRgbToHex,
  sketchSceneCanvasColor,
  sketchThemeForColor,
  writeSketchCanvasPreference,
} from "../utils/sketchCanvas.js";

/** The tiny storage the model takes, so nothing has to exist in Node. */
const fakeStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
};

const channels = (hex) => sketchColorChannels(hex);
const channelDelta = (a, b) => {
  const left = channels(a);
  const right = channels(b);
  return Math.max(Math.abs(left.r - right.r), Math.abs(left.g - right.g), Math.abs(left.b - right.b));
};

// ---------------------------------------------------------------------------
// Presets — including the white canvas that was asked for
// ---------------------------------------------------------------------------

test("the presets offer a white canvas, a dark default, and nothing exotic", () => {
  const ids = SKETCH_CANVAS_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, ["dark", "white", "paper", "sky", "mint", "grey"]);
  for (const preset of SKETCH_CANVAS_PRESETS) {
    assert.equal(normalizeSketchColor(preset.color), preset.color, `${preset.id} is a real colour`);
    assert.equal(typeof preset.label, "string");
    assert.equal(preset.label.length > 0, true);
  }
  // "White" is white, and it is one click away — not a shade of grey.
  const white = SKETCH_CANVAS_PRESETS.find((preset) => preset.id === "white");
  assert.equal(white.color, "#ffffff");
  // The default board is Excalidraw's own dark canvas, unchanged.
  assert.deepEqual(SKETCH_CANVAS_DEFAULT, { color: "#121212", theme: "dark" });
});

// ---------------------------------------------------------------------------
// Colours in, colours out
// ---------------------------------------------------------------------------

test("a full-RGB picker may hand over anything: hex, shorthand, rgb() — all normalise", () => {
  assert.equal(normalizeSketchColor("#FFF"), "#ffffff");
  assert.equal(normalizeSketchColor("#1A2B3C"), "#1a2b3c");
  assert.equal(normalizeSketchColor("  #1a2b3c  "), "#1a2b3c");
  assert.equal(normalizeSketchColor("rgb(18, 52, 86)"), "#123456");
  assert.equal(normalizeSketchColor("rgba(18,52,86,0.5)"), "#123456");
  // Out-of-range channels are clamped, never NaN — a slider cannot break it.
  assert.equal(normalizeSketchColor(sketchRgbToHex(300, -20, 128)), "#ff0080");
  assert.equal(sketchRgbToHex(1.6, 2.4, 255), "#0202ff");
  // …and anything that is not a colour is refused, so a half-typed hex field
  // simply does not paint.
  for (const bad of ["", "#12", "#12345", "rgb(1,2)", "papayawhip", null, undefined, 42, {}]) {
    assert.equal(normalizeSketchColor(bad), null, `${String(bad)} is not a canvas colour`);
  }
});

test("lightness decides the theme, so the learner's ink stays readable", () => {
  assert.equal(sketchThemeForColor("#ffffff"), SKETCH_THEME_LIGHT);
  assert.equal(sketchThemeForColor("#f6f3e7"), SKETCH_THEME_LIGHT);
  assert.equal(sketchThemeForColor("#e4eeff"), SKETCH_THEME_LIGHT);
  assert.equal(sketchThemeForColor("#121212"), SKETCH_THEME_DARK);
  assert.equal(sketchThemeForColor("#0b1020"), SKETCH_THEME_DARK);
  assert.equal(sketchColorLuminance("#ffffff"), 1);
  assert.equal(sketchColorLuminance("#000000"), 0);
  assert.equal(sketchColorLuminance("not a colour"), 0);
});

// ---------------------------------------------------------------------------
// The dark theme's filter, and its inverse — the reason this module exists
// ---------------------------------------------------------------------------

test("the dark filter is Excalidraw's own invert(93%) hue-rotate(180deg)", () => {
  // Excalidraw renders the default board — scene background #ffffff — as
  // #121212, which is where "the dark canvas" comes from. That is the exact
  // value the editor's own `applyDarkModeFilter` produces.
  assert.equal(sketchColorUnderDarkFilter("#ffffff"), "#121212");
  // Mid greys are mirrored around the middle (to the byte that 93% rounding
  // allows)…
  assert.equal(channelDelta(sketchColorUnderDarkFilter("#808080"), "#808080") <= 1, true);
  assert.equal(sketchColorUnderDarkFilter("#000000"), "#ededed");
  // …and a saturated colour is inverted out of its light counterpart: red, in
  // the dark theme, is what "cyan-ish light" renders as.
  const red = channels(sketchColorUnderDarkFilter("#ff0000"));
  assert.equal(red.r, 255);
  assert.equal(red.g === red.b, true, "the hue rotation leaves green and blue equal");
  assert.equal(red.g < 200, true);
  assert.equal(sketchColorUnderDarkFilter("nonsense"), null);
});

test("a picked colour RENDERS as itself, in both themes", () => {
  // Light theme: no filter at all, so what is stored is what is seen — every
  // colour, exactly.
  for (const picked of ["#ffffff", "#f6f3e7", "#e4eeff", "#000000", "#1e40af"]) {
    assert.equal(sketchSceneCanvasColor(picked, SKETCH_THEME_LIGHT), picked);
    assert.equal(sketchRenderedCanvasColor(picked, SKETCH_THEME_LIGHT), picked);
  }

  // Dark theme: the scene value is the INVERSE of the filter, so the canvas
  // renders the colour that was picked. Neutral and slate-dark canvases come
  // back to the byte — these are the colours the dark theme is for.
  for (const picked of ["#121212", "#1e293b", "#212529", "#2b2b2b", "#20303c"]) {
    const scene = sketchSceneCanvasColor(picked, SKETCH_THEME_DARK);
    assert.notEqual(scene, null);
    assert.equal(
      channelDelta(sketchRenderedCanvasColor(scene, SKETCH_THEME_DARK), picked) <= 2,
      true,
      `${picked} renders back as itself (got ${sketchRenderedCanvasColor(scene, SKETCH_THEME_DARK)})`,
    );
  }

  // Saturated colours lose saturation in the dark theme (the filter's own
  // gamut — see the model's header). What must hold is that the canvas stays
  // the same kind of colour: still dark, still the same hue family, and never
  // the pale inverse the stock editor would show.
  for (const picked of ["#3f1d38", "#1e40af", "#4b0082", "#8b0000"]) {
    const scene = sketchSceneCanvasColor(picked, SKETCH_THEME_DARK);
    const rendered = sketchRenderedCanvasColor(scene, SKETCH_THEME_DARK);
    assert.equal(sketchColorLuminance(rendered) < 0.5, true, `${picked} stays a dark canvas`);
    assert.equal(channelDelta(rendered, sketchColorUnderDarkFilter(picked)) > 0, true);
    const stock = sketchColorUnderDarkFilter(picked);
    assert.equal(
      Math.abs(sketchColorLuminance(rendered) - sketchColorLuminance(picked)) <
        Math.abs(sketchColorLuminance(stock) - sketchColorLuminance(picked)),
      true,
      `${picked} is closer to what was picked than the uncompensated value would be`,
    );
  }

  // The default dark canvas is already exact today: the scene default #ffffff
  // + the dark theme = #121212, so choosing "Dark" cannot change the board.
  assert.equal(sketchSceneCanvasColor("#121212", SKETCH_THEME_DARK), "#ffffff");
  assert.equal(sketchRenderedCanvasColor("#ffffff", SKETCH_THEME_DARK), "#121212");
});

test("the filter's reach is honest: pure white lives in the light theme", () => {
  // invert(93%) can only reach rendered channels between 18 and 237, so in the
  // dark theme white lands a hair short — which is exactly why the White
  // preset gets the LIGHT theme, where it is #ffffff to the byte.
  const whiteInDark = sketchRenderedCanvasColor(
    sketchSceneCanvasColor("#ffffff", SKETCH_THEME_DARK),
    SKETCH_THEME_DARK,
  );
  assert.notEqual(whiteInDark, "#ffffff");
  assert.equal(channels(whiteInDark).r >= 237, true, "…but it is still unambiguously a white canvas");

  const applied = sketchCanvasAppState("#ffffff");
  assert.deepEqual(applied, { theme: "light", viewBackgroundColor: "#ffffff" });
  assert.equal(
    sketchRenderedCanvasColor(applied.viewBackgroundColor, applied.theme),
    "#ffffff",
    "the White preset renders pure white",
  );
});

// ---------------------------------------------------------------------------
// One choice: colour + theme + scene value
// ---------------------------------------------------------------------------

test("a colour and its theme are applied together and can never be split", () => {
  const white = sketchCanvasAppState("#ffffff");
  assert.deepEqual(white, { theme: SKETCH_THEME_LIGHT, viewBackgroundColor: "#ffffff" });

  const dark = sketchCanvasAppState(SKETCH_CANVAS_DEFAULT.color);
  assert.deepEqual(dark, { theme: SKETCH_THEME_DARK, viewBackgroundColor: "#ffffff" });

  const sliders = sketchCanvasAppState(sketchRgbToHex(20, 30, 60));
  assert.equal(sliders.theme, SKETCH_THEME_DARK);
  assert.equal(
    channelDelta(sketchRenderedCanvasColor(sliders.viewBackgroundColor, sliders.theme), "#141e3c") <= 16,
    true,
    "a colour mixed on the sliders renders as that colour (dark theme gamut)",
  );
  // A pastel picked on the same sliders is exact, because its theme has no
  // filter in the way at all.
  const pastel = sketchCanvasAppState(sketchRgbToHex(230, 240, 255));
  assert.equal(pastel.theme, SKETCH_THEME_LIGHT);
  assert.equal(
    sketchRenderedCanvasColor(pastel.viewBackgroundColor, pastel.theme),
    "#e6f0ff",
    "a pastel mixed on the sliders renders exactly",
  );

  // …and a board reading the pair back sees the same colour the learner chose.
  const readBack = sketchCanvasFromAppState(dark);
  assert.deepEqual(readBack, { theme: "dark", sceneColor: "#ffffff", rendered: "#121212" });

  // Nothing to read: a board that never chose a colour, or a broken payload.
  assert.equal(sketchCanvasFromAppState({}), null);
  assert.equal(sketchCanvasFromAppState({ theme: "dark" }), null);
  assert.equal(sketchCanvasFromAppState({ viewBackgroundColor: "transparent" }), null);
  assert.equal(sketchCanvasFromAppState(null), null);
  assert.equal(sketchCanvasAppState("not a colour"), null);
});

test("Excalidraw's own theme toggle is still understood (it just filters)", () => {
  // A learner who flips Excalidraw's own dark-mode toggle changes the theme
  // without changing the scene colour: the row must report what they SEE.
  const state = sketchCanvasFromAppState({ theme: "dark", viewBackgroundColor: "#ffffff" });
  assert.equal(state.rendered, "#121212");
  const flipped = sketchCanvasFromAppState({ theme: "light", viewBackgroundColor: "#ffffff" });
  assert.equal(flipped.rendered, "#ffffff");
});

// ---------------------------------------------------------------------------
// The remembered preference
// ---------------------------------------------------------------------------

test("the learner's canvas choice is remembered, per learner, and read back", () => {
  const storage = fakeStorage();
  assert.equal(readSketchCanvasPreference("u1", storage), null, "nothing chosen yet");

  const stored = writeSketchCanvasPreference("u1", "#F6F3E7", storage);
  assert.equal(stored.color, "#f6f3e7");
  assert.equal(stored.theme, SKETCH_THEME_LIGHT);

  const read = readSketchCanvasPreference("u1", storage);
  assert.equal(read.color, "#f6f3e7");
  assert.equal(read.theme, SKETCH_THEME_LIGHT);
  // Another learner on the same device starts clean…
  assert.equal(readSketchCanvasPreference("u2", storage), null);
  // …and an anonymous visit has its own slot.
  assert.equal(readSketchCanvasPreference(null, storage), null);
  assert.equal(sketchCanvasPrefKey("u1"), `${SKETCH_CANVAS_PREF_KEY}.u1`);
  assert.equal(sketchCanvasPrefKey(""), SKETCH_CANVAS_PREF_KEY);
});

test("the preference never throws: private mode, quota and corruption are 'no choice'", () => {
  const hostile = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(readSketchCanvasPreference("u1", hostile), null);
  assert.equal(writeSketchCanvasPreference("u1", "#ffffff", hostile)?.color, "#ffffff");
  assert.equal(readSketchCanvasPreference("u1", null), null);

  const broken = fakeStorage({ [`${SKETCH_CANVAS_PREF_KEY}.u1`]: "{not json" });
  assert.equal(readSketchCanvasPreference("u1", broken), null);
  const wrongShape = fakeStorage({
    [`${SKETCH_CANVAS_PREF_KEY}.u1`]: JSON.stringify({ color: "papayawhip" }),
  });
  assert.equal(readSketchCanvasPreference("u1", wrongShape), null);

  // Nothing valid to store ⇒ nothing stored.
  const storage = fakeStorage();
  assert.equal(writeSketchCanvasPreference("u1", "nope", storage), null);
  assert.equal(storage.map.size, 0);
});
