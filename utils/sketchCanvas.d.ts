// utils/sketchCanvas.d.ts
//
// Types for the Course Player Sketch canvas-colour model
// (utils/sketchCanvas.js). The runtime is plain JS so Node's test runner can
// import it directly; the React side (src/course/SketchCanvasControls.tsx,
// src/course/SketchPanel.tsx) consumes these declarations.

/** The two themes Excalidraw's `appState.theme` uses. */
export type SketchCanvasTheme = "light" | "dark";

/** One one-click canvas colour. `color` is what the learner SEES. */
export interface SketchCanvasPreset {
  id: string;
  label: string;
  color: string;
}

/** A board's canvas, read back out of an Excalidraw `appState`. */
export interface SketchCanvasState {
  theme: SketchCanvasTheme;
  /** The value Excalidraw stores (what the dark filter is applied to). */
  sceneColor: string;
  /** The colour the learner actually sees. */
  rendered: string;
}

/** What the learner's last choice left on this device. */
export interface SketchCanvasPreference {
  color: string;
  theme: SketchCanvasTheme;
  updatedAt: number;
}

/** The storage this model reads/writes (localStorage in the app, a stub in tests). */
export interface SketchCanvasStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SKETCH_THEME_LIGHT: "light";
export const SKETCH_THEME_DARK: "dark";
export const SKETCH_DARK_FILTER_INVERT_PERCENT: number;
export const SKETCH_DARK_FILTER_HUE_ROTATE_DEGREES: number;
export const SKETCH_CANVAS_DEFAULT: { color: string; theme: SketchCanvasTheme };
export const SKETCH_CANVAS_PRESETS: SketchCanvasPreset[];
export const SKETCH_CANVAS_PREF_KEY: string;

export function sketchCanvasPrefKey(uid?: string | null): string;
export function normalizeSketchColor(value: unknown): string | null;
export function sketchColorChannels(value: unknown): { r: number; g: number; b: number } | null;
export function sketchRgbToHex(r: number, g: number, b: number): string;
export function sketchColorLuminance(value: unknown): number;
export function sketchThemeForColor(value: unknown): SketchCanvasTheme;
export function sketchColorUnderDarkFilter(value: unknown): string | null;
export function sketchSceneCanvasColor(value: unknown, theme?: SketchCanvasTheme): string | null;
export function sketchRenderedCanvasColor(
  sceneColor: unknown,
  theme?: SketchCanvasTheme,
): string | null;
export function sketchCanvasFromAppState(appState: unknown): SketchCanvasState | null;
export function sketchCanvasAppState(
  value: unknown,
): { theme: SketchCanvasTheme; viewBackgroundColor: string } | null;
export function readSketchCanvasPreference(
  uid?: string | null,
  storage?: SketchCanvasStorage | null,
): SketchCanvasPreference | null;
export function writeSketchCanvasPreference(
  uid: string | null | undefined,
  value: unknown,
  storage?: SketchCanvasStorage | null,
): SketchCanvasPreference | null;
