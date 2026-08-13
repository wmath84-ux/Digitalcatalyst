// src/utils/sfx.ts
//
// Lightweight UI sound effects, built entirely with Web Audio — no audio
// assets to download, so every effect works offline once the app shell is
// loaded. Each effect is short, quiet and distinct, so the app feels more
// polished and "alive" without ever being noisy or jarring.
//
// Design rules:
//   * Best-effort everywhere — if audio is blocked (autoplay policy, no
//     AudioContext, muted device) the effect is silently skipped; the UI
//     already communicates the outcome.
//   * Low peak gains (0.04–0.22) and fast exponential releases = no clicks.
//   * Effects are only triggered from user gestures or immediately after an
//     action the user just performed, so they respect browser autoplay rules.
//   * The shared AudioContext is the same one the payment chime uses, so
//     paying once "unlocks" audio for the rest of the session.

let audioContext: AudioContext | null = null;

type LegacyAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

const getContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext ?? (window as LegacyAudioWindow).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioContext = new Ctor();
  } catch {
    return null;
  }
  return audioContext;
};

interface ToneSpec {
  /** Hz. */
  frequency: number;
  /** Offset in seconds from the effect start. */
  startOffset: number;
  /** Seconds the note rings (exponential decay). */
  duration: number;
  type: OscillatorType;
  /** Peak gain (0–1). */
  peak: number;
}

const scheduleTone = (ctx: AudioContext, baseTime: number, spec: ToneSpec): void => {
  const startAt = baseTime + spec.startOffset;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = spec.type;
  oscillator.frequency.setValueAtTime(spec.frequency, startAt);
  // Fast attack, exponential release — no clicks at the note edges.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(spec.peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + spec.duration + 0.05);
};

const playTones = (tones: ToneSpec[]): void => {
  const ctx = getContext();
  if (!ctx) return;
  const run = () => {
    const baseTime = ctx.currentTime + 0.01;
    for (const spec of tones) scheduleTone(ctx, baseTime, spec);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => undefined);
  } else {
    run();
  }
};

// ---------------------------------------------------------------------------
// Effect definitions
// ---------------------------------------------------------------------------

/** Soft "success" — a short, bright ascending two-note lift. */
const SUCCESS_TONES: ToneSpec[] = [
  { frequency: 659.25, startOffset: 0, duration: 0.16, type: "sine", peak: 0.14 }, // E5
  { frequency: 987.77, startOffset: 0.07, duration: 0.22, type: "sine", peak: 0.12 }, // B5
];

/** Gentle "error" — a muted low double-tap that reads as "not allowed". */
const ERROR_TONES: ToneSpec[] = [
  { frequency: 220.0, startOffset: 0, duration: 0.12, type: "triangle", peak: 0.12 }, // A3
  { frequency: 196.0, startOffset: 0.09, duration: 0.14, type: "triangle", peak: 0.1 }, // G3
];

/** Quick "add" pop — a single bright blip for adding items. */
const ADD_TONES: ToneSpec[] = [
  { frequency: 880.0, startOffset: 0, duration: 0.09, type: "triangle", peak: 0.12 }, // A5
  { frequency: 1318.51, startOffset: 0.04, duration: 0.1, type: "sine", peak: 0.08 }, // E6
];

/** Quick "remove" — a short downward blip for removing/deleting. */
const REMOVE_TONES: ToneSpec[] = [
  { frequency: 587.33, startOffset: 0, duration: 0.09, type: "triangle", peak: 0.12 }, // D5
  { frequency: 440.0, startOffset: 0.05, duration: 0.1, type: "triangle", peak: 0.1 }, // A4
];

/** Satisfying "complete" — a warm two-note ding (task done, course file done). */
const COMPLETE_TONES: ToneSpec[] = [
  { frequency: 783.99, startOffset: 0, duration: 0.14, type: "sine", peak: 0.16 }, // G5
  { frequency: 1174.66, startOffset: 0.08, duration: 0.28, type: "sine", peak: 0.13 }, // D6
];

/** Subtle "toggle" — a barely-there tick for switches/checkbox changes. */
const TOGGLE_TONES: ToneSpec[] = [
  { frequency: 1046.5, startOffset: 0, duration: 0.05, type: "square", peak: 0.04 }, // C6
];

/** Tiny "copy" tick — confirms copy-to-clipboard. */
const COPY_TONES: ToneSpec[] = [
  { frequency: 1567.98, startOffset: 0, duration: 0.05, type: "triangle", peak: 0.07 }, // G6
  { frequency: 2093.0, startOffset: 0.03, duration: 0.06, type: "sine", peak: 0.05 }, // C7
];

/** Soft "notification" bell — two-note chime for incoming alerts. */
const NOTIFICATION_TONES: ToneSpec[] = [
  { frequency: 987.77, startOffset: 0, duration: 0.18, type: "sine", peak: 0.12 }, // B5
  { frequency: 1318.51, startOffset: 0.1, duration: 0.3, type: "sine", peak: 0.1 }, // E6
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const playSfxSuccess = (): void => playTones(SUCCESS_TONES);
export const playSfxError = (): void => playTones(ERROR_TONES);
export const playSfxAdd = (): void => playTones(ADD_TONES);
export const playSfxRemove = (): void => playTones(REMOVE_TONES);
export const playSfxComplete = (): void => playTones(COMPLETE_TONES);
export const playSfxToggle = (): void => playTones(TOGGLE_TONES);
export const playSfxCopy = (): void => playTones(COPY_TONES);
export const playSfxNotification = (): void => playTones(NOTIFICATION_TONES);

/** Unlock the shared AudioContext from within a user-gesture handler so a
 * follow-up effect (e.g. after an async save) is guaranteed to play. */
export const prepareSfx = (): void => {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
};
