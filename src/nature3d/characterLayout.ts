// The Sanctuary character HUD remembers itself — where every button sits, how
// big it is and how see-through it is.
//
// The brief (2026-10-01, owner): "setting mein ek customise layout ka button
// add karo jis per click karne per sabhi buttons ka size transparency aur
// placement screen per vah state Kiya Ja sake aur vahi dikhe usi jagah button
// Jaise pubg mein hota Hai" — a layout editor like PUBG's: open it from
// Settings, drag a button, change its size and transparency, save, and the
// HUD comes back exactly like that. Every character button is included,
// including the FPP/TPP camera switch.
//
// Placement is stored as a percentage of the stage, never pixels, so the same
// layout survives a rotation, a resize and a different device.

/** Every control the layout owns. */
export type HudControlId =
  | "start"
  | "overview"
  | "camera"
  | "reset"
  | "mouse"
  | "help"
  | "move"
  | "look"
  | "jump"
  | "run"
  | "crouch"
  | "cover";

export interface HudPlacement {
  /** Centre of the control, as a percentage of the stage width. */
  x: number;
  /** Centre of the control, as a percentage of the stage height. */
  y: number;
  /** Multiplies the control's own base size. */
  scale: number;
  /** Button opacity, 1 = solid. */
  opacity: number;
}

export type HudLayout = Record<HudControlId, HudPlacement>;

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.7;
export const OPACITY_MIN = 0.25;

export const HUD_CONTROL_IDS: readonly HudControlId[] = [
  "start", "overview", "camera", "reset", "mouse", "help",
  "move", "look", "jump", "run", "crouch", "cover",
];

/** What the editor calls each control. */
export const HUD_CONTROL_LABELS: Record<HudControlId, string> = {
  start: "Explore on foot",
  overview: "Overview",
  camera: "FPP / TPP camera",
  reset: "Reset",
  mouse: "Mouse capture",
  help: "Help",
  move: "Move stick",
  look: "Look stick",
  jump: "Jump",
  run: "Run",
  crouch: "Crouch",
  cover: "Cover",
};

/**
 * The factory layout. Thumb reach first, the way a shooter HUD is laid out:
 * move stick bottom-left, look stick bottom-right, the action cluster on the
 * right where the right thumb already is, and the mode buttons along the top.
 */
export const DEFAULT_HUD_LAYOUT: HudLayout = Object.freeze({
  start: { x: 50, y: 88, scale: 1, opacity: 1 },
  overview: { x: 6, y: 9, scale: 1, opacity: 1 },
  camera: { x: 15, y: 9, scale: 1, opacity: 1 },
  reset: { x: 24, y: 9, scale: 1, opacity: 1 },
  mouse: { x: 33, y: 9, scale: 1, opacity: 1 },
  help: { x: 42, y: 9, scale: 1, opacity: 1 },
  move: { x: 13, y: 72, scale: 1, opacity: 1 },
  look: { x: 87, y: 72, scale: 1, opacity: 1 },
  jump: { x: 71, y: 79, scale: 1, opacity: 1 },
  run: { x: 68, y: 58, scale: 1, opacity: 1 },
  crouch: { x: 58, y: 84, scale: 1, opacity: 1 },
  cover: { x: 57, y: 62, scale: 1, opacity: 1 },
}) as HudLayout;

const STORAGE_KEY = "sanctuary.characterLayout.v1";

const clamp = (value: number, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Keep a placement inside the stage and inside the size/opacity limits. */
export function clampPlacement(placement: HudPlacement): HudPlacement {
  return {
    x: clamp(placement.x, 0, 100, 50),
    y: clamp(placement.y, 0, 100, 50),
    scale: clamp(placement.scale, SCALE_MIN, SCALE_MAX, 1),
    opacity: clamp(placement.opacity, OPACITY_MIN, 1, 1),
  };
}

export function defaultHudLayout(): HudLayout {
  return Object.fromEntries(
    HUD_CONTROL_IDS.map(id => [id, { ...DEFAULT_HUD_LAYOUT[id] }]),
  ) as HudLayout;
}

/** Read the saved layout, dropping anything that is missing, moved or broken. */
export function loadHudLayout(): HudLayout {
  const layout = defaultHudLayout();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return layout;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return layout;
    for (const id of HUD_CONTROL_IDS) {
      const stored = (parsed as Record<string, unknown>)[id];
      if (!stored || typeof stored !== "object") continue;
      const candidate = stored as Record<string, unknown>;
      layout[id] = clampPlacement({
        x: typeof candidate.x === "number" ? candidate.x : layout[id].x,
        y: typeof candidate.y === "number" ? candidate.y : layout[id].y,
        scale: typeof candidate.scale === "number" ? candidate.scale : layout[id].scale,
        opacity: typeof candidate.opacity === "number" ? candidate.opacity : layout[id].opacity,
      });
    }
  } catch {
    /* A corrupt or unavailable store just means the factory layout. */
  }
  return layout;
}

export function saveHudLayout(layout: HudLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* Private browsing / quota: the layout simply will not persist. */
  }
}

export function clearHudLayout(): HudLayout {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to clear. */
  }
  return defaultHudLayout();
}
