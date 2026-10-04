// src/course/SketchCanvasControls.tsx
//
// The Sketch tab's CANVAS control — the two one-click swatches (White, Dark),
// the pencil icon that opens the full-RGB picker, and the popover itself.
//
// ── Where it sits, and why it is not "our own toolbar" ────────────────────
// It is one row inside the panel's own slim chrome — the save line at the top
// of the study pane — NOT a re-implementation of Excalidraw's toolbar: every
// tool, the shape/colour pickers, the menus and the canvas gestures are still
// Excalidraw's own components, untouched. The only thing this repo adds is the
// CANVAS BACKGROUND choice, which Excalidraw keeps in its main menu
// (`Canvas background`) with its own fixed swatches.
//
// ── What a "canvas colour" means here ─────────────────────────────────────
// The learner picks the colour they want to SEE. `utils/sketchCanvas.js` turns
// that into the pair of `appState` values that render as it — `theme` plus the
// scene-space `viewBackgroundColor` the dark-mode filter is applied to — so the
// canvas is exactly the picked colour in both themes (see that file's header
// for the filter math). The choice is written through Excalidraw's own
// appState, which means the existing sketch pipeline persists it: per board in
// the Firestore document, per device in the mirror, and per learner in a small
// localStorage preference that `SketchPanel` applies to boards that never
// chose a colour.

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  SKETCH_CANVAS_DEFAULT,
  SKETCH_CANVAS_PRESETS,
  normalizeSketchColor,
  sketchColorChannels,
  sketchRgbToHex,
  sketchRenderedCanvasColor,
  type SketchCanvasTheme,
} from "../../utils/sketchCanvas";

/** The two colours worth a permanent button: the dark default and white. */
const QUICK_PRESETS = SKETCH_CANVAS_PRESETS.filter(
  (preset) => preset.id === "dark" || preset.id === "white",
);

export interface SketchCanvasControlsProps {
  /** The editor's live `appState.theme`. */
  theme: SketchCanvasTheme;
  /** The editor's live `appState.viewBackgroundColor` (the scene value). */
  sceneColor: string;
  /** The learner picked a colour — `color` is what they expect to SEE. */
  onPick: (color: string) => void;
  /** False until the editor exists: the controls show state, but cannot apply. */
  ready: boolean;
}

/** One channel of the RGB picker: a slider, a spinner and its letter. */
function ChannelRow({
  channel,
  label,
  value,
  onChange,
}: {
  channel: "r" | "g" | "b";
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2" data-canvas-channel={channel}>
      <span className="w-3 shrink-0 text-[10px] font-bold text-white/50">{label}</span>
      <input
        type="range"
        min={0}
        max={255}
        step={1}
        value={value}
        aria-label={`${label} channel`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
      />
      <input
        type="number"
        min={0}
        max={255}
        value={value}
        aria-label={`${label} value`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-11 shrink-0 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-right text-[10px] font-semibold text-white/80 outline-none focus:border-white/30"
      />
    </label>
  );
}

export default function SketchCanvasControls({
  theme,
  sceneColor,
  onPick,
  ready,
}: SketchCanvasControlsProps) {
  /** What the canvas is showing right now — the truth the row reports. */
  const current = sketchRenderedCanvasColor(sceneColor, theme) ?? SKETCH_CANVAS_DEFAULT.color;

  const [open, setOpen] = useState(false);
  /** The colour being edited — applied live, so the canvas follows the sliders. */
  const [color, setColor] = useState(current);
  /** The hex FIELD's own text: the learner may type a half-finished value. */
  const [hexText, setHexText] = useState(current);

  const channels = sketchColorChannels(color) ?? sketchColorChannels(SKETCH_CANVAS_DEFAULT.color)!;

  // Opening always starts from what is actually on the canvas.
  const openPicker = () => {
    const from = sketchRenderedCanvasColor(sceneColor, theme) ?? SKETCH_CANVAS_DEFAULT.color;
    setColor(from);
    setHexText(from);
    setOpen(true);
  };

  /** Apply a colour: paint it immediately and remember the learner's choice. */
  const applyColor = (value: string) => {
    const hex = normalizeSketchColor(value);
    if (!hex) return;
    setColor(hex);
    setHexText(hex);
    onPick(hex);
  };

  const setChannel = (channel: "r" | "g" | "b", value: number) => {
    const next = { ...channels, [channel]: Number.isFinite(value) ? value : 0 };
    applyColor(sketchRgbToHex(next.r, next.g, next.b));
  };

  // Escape closes the popover — the key the learner already uses to leave a
  // tool, and never a shortcut the player or the editor owns.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const swatchClass = "h-4 w-4 shrink-0 rounded-[5px] border transition-transform hover:scale-110";

  return (
    <div className="relative flex shrink-0 items-center gap-1.5" data-course-sketch-canvas-controls>
      <span className="text-[10px] font-semibold text-white/35">Canvas</span>

      {QUICK_PRESETS.map((preset) => {
        const active = current.toLowerCase() === preset.color;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={!ready}
            title={`${preset.label} canvas`}
            aria-label={`${preset.label} canvas`}
            aria-pressed={active}
            data-canvas-quick={preset.id}
            onClick={() => applyColor(preset.color)}
            style={{ backgroundColor: preset.color }}
            className={`${swatchClass} ${active ? "border-white ring-1 ring-white/60" : "border-white/25"} ${
              ready ? "" : "cursor-not-allowed opacity-50"
            }`}
          />
        );
      })}

      <button
        type="button"
        disabled={!ready}
        title="Custom canvas colour — full RGB"
        aria-label="Custom canvas colour, full RGB"
        aria-expanded={open}
        data-course-sketch-canvas-pencil
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`relative grid h-6 w-6 place-items-center rounded-lg border border-white/15 bg-white/10 text-white/75 transition-colors hover:bg-white/20 hover:text-white ${
          ready ? "" : "cursor-not-allowed opacity-50"
        }`}
      >
        <Pencil size={12} strokeWidth={2.4} />
        {/* The pencil carries the colour it would change. */}
        <span
          aria-hidden
          data-canvas-current={current}
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black/60"
          style={{ backgroundColor: current }}
        />
      </button>

      {open ? (
        <>
          {/* A click-anywhere backdrop instead of a document-level pointer
              listener: the editor's own pointer handling is never touched. */}
          <button
            type="button"
            aria-label="Close canvas colour picker"
            data-canvas-backdrop
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default bg-black/30"
          />
          <div
            role="dialog"
            aria-label="Canvas colour"
            data-course-sketch-canvas-picker
            data-canvas-theme={theme}
            className="absolute right-0 top-full z-30 mt-1.5 w-[236px] rounded-xl border border-white/10 bg-[#15161c] p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-md border border-white/25"
                style={{ backgroundColor: color }}
                data-canvas-preview={color}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold uppercase text-white/70">
                {color}
              </span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/50">
                {theme}
              </span>
            </div>

            <div className="mb-2 grid grid-cols-3 gap-1.5">
              {SKETCH_CANVAS_PRESETS.map((preset) => {
                const active = color.toLowerCase() === preset.color;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={`${preset.label} canvas`}
                    aria-pressed={active}
                    data-canvas-preset={preset.id}
                    onClick={() => applyColor(preset.color)}
                    className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10px] font-semibold transition-colors ${
                      active
                        ? "border-white/50 bg-white/15 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[4px] border border-white/25"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 rounded-lg bg-black/30 p-2" data-course-sketch-canvas-rgb>
              <ChannelRow
                channel="r"
                label="R"
                value={channels.r}
                onChange={(value) => setChannel("r", value)}
              />
              <ChannelRow
                channel="g"
                label="G"
                value={channels.g}
                onChange={(value) => setChannel("g", value)}
              />
              <ChannelRow
                channel="b"
                label="B"
                value={channels.b}
                onChange={(value) => setChannel("b", value)}
              />
              <label className="flex items-center gap-2 pt-0.5">
                <span className="w-3 shrink-0 text-[10px] font-bold text-white/50">#</span>
                <input
                  type="text"
                  value={hexText}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Canvas colour hex value"
                  data-canvas-hex
                  onChange={(event) => {
                    const raw = event.target.value;
                    setHexText(raw);
                    const hex = normalizeSketchColor(raw);
                    if (hex) {
                      setColor(hex);
                      onPick(hex);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[11px] font-semibold uppercase text-white/85 outline-none focus:border-white/30"
                />
              </label>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[9px] leading-snug text-white/35">
                Saved with this board; the theme follows the colour.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-bold text-white/80 hover:bg-white/20"
              >
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
