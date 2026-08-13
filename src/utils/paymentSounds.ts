// src/utils/paymentSounds.ts
//
// Paytm-style payment-success feedback: a short, bright ascending chime
// plus a subtle haptic buzz, played entirely with Web Audio — no audio
// asset to download, so it works offline once the app shell is loaded.
//
// Browser autoplay policies only allow audio after a user gesture, so the
// flow is two-step:
//   1. `preparePaymentSound()` runs *inside the Pay-button click handler*
//      — the gesture unlocks (creates + resumes) the shared AudioContext.
//   2. `playPaymentSuccessChime()` fires the moment the server verifies
//      the payment. By then the context is already running, so the chime
//      plays instantly — even on iOS, where a context created without a
//      gesture would stay suspended forever.

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

/**
 * Call from a user-gesture handler (the Pay button) so the browser
 * unlocks audio before verification completes seconds later.
 */
export const preparePaymentSound = (): void => {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
};

interface ToneSpec {
  /** Hz. */
  frequency: number;
  /** Offset in seconds from the chime start. */
  startOffset: number;
  /** Seconds the note rings (exponential decay). */
  duration: number;
  type: OscillatorType;
  /** Peak gain (0–1). */
  peak: number;
}

// Bright rising triad with a sparkle tick — the Paytm "payment received"
// feel: quick, celebratory, done in under a second.
const CHIME: ToneSpec[] = [
  { frequency: 1975.53, startOffset: 0.02, duration: 0.12, type: "triangle", peak: 0.05 }, // sparkle tick
  { frequency: 987.77, startOffset: 0.0, duration: 0.4, type: "sine", peak: 0.22 }, // B5
  { frequency: 1318.51, startOffset: 0.1, duration: 0.45, type: "sine", peak: 0.2 }, // E6
  { frequency: 1567.98, startOffset: 0.2, duration: 0.6, type: "sine", peak: 0.18 }, // G6, rings out
];

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

const startChime = (ctx: AudioContext): void => {
  const baseTime = ctx.currentTime + 0.02;
  for (const spec of CHIME) scheduleTone(ctx, baseTime, spec);
};

/**
 * Play the success chime + haptic buzz. Best-effort everywhere: if the
 * context was never unlocked (no gesture), the resume attempt may be
 * rejected and the chime silently skipped — the UI already shows success.
 */
export const playPaymentSuccessChime = (): void => {
  const ctx = getContext();
  if (ctx) {
    if (ctx.state === "suspended") {
      void ctx
        .resume()
        .then(() => startChime(ctx))
        .catch(() => undefined);
    } else {
      startChime(ctx);
    }
  }
  // Paytm-style confirmation buzz — supported on Android, absent on iOS.
  try {
    window?.navigator?.vibrate?.([40, 60, 80]);
  } catch {
    // Vibration unsupported — the chime carries the feedback alone.
  }
};
