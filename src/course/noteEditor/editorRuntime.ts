// src/course/noteEditor/editorRuntime.ts
//
// THE RUNTIME FLOOR OF THE EDITOR ENGINE.
//
// The app promises Chrome 96+ (`browserslist`) and the Android shell's minSdk is
// 23 — and Chrome / WebView 106 was the last release that shipped to Android 6
// (Chromium's own deprecation notice), so such a phone is stuck below Chrome 107.
// The editor's engine (BlockNote on TipTap 3) is written for current browsers and
// calls two ES2023 array methods without a feature check:
//
//   · Array.prototype.findLast    Chrome 97   in TipTap's dispatch of EVERY
//                                             transaction — every keystroke;
//   · Array.prototype.toReversed  Chrome 110  when a selection is serialised for
//                                             copy, cut and drag.
//
// Measured in Chromium with each one removed and nothing installed here (see
// tests/noteEditorBrowser.test.mjs): without findLast a TypeError is thrown on
// every keystroke, the "/" menu never opens and copy puts nothing on the
// clipboard — the typed text still lands, so the failure is silent: the learner
// just finds that "/" does nothing. Without toReversed copy comes out empty (cut
// and drag go through the same serialiser).
//
// So each is installed here, ONLY WHEN IT IS ABSENT (a no-op on every current
// WebView), with the native's own property attributes (writable, configurable,
// not enumerable — a `for…in` over an array must never see it) and its
// semantics: generic over array-likes, a TypeError for a null receiver or a
// missing callback, a dense copy from `toReversed`. `findLastIndex` is the other
// half of the Chrome 97 pair (BlockNote's own menu-grouping helper uses it).
//
// Called by the editor factory only, so these few hundred bytes ship with the
// lazy editor chunk and the rest of the player is untouched. No imports.

type Callback = (value: unknown, index: number, source: unknown) => unknown;
type ArrayLikeObject = { length?: unknown; [index: number]: unknown };

/** ToObject: the native methods are generic, and a null / undefined receiver throws. */
function toObject(receiver: unknown, method: string): ArrayLikeObject {
  if (receiver === null || receiver === undefined) {
    throw new TypeError(`Array.prototype.${method} called on null or undefined`);
  }
  return Object(receiver) as ArrayLikeObject;
}

/** ToLength: NaN and negatives are 0, anything huge is clamped to 2^53 − 1. */
function toLength(value: unknown): number {
  const whole = Math.trunc(Number(value)) || 0;
  return whole > 0 ? Math.min(whole, Number.MAX_SAFE_INTEGER) : 0;
}

function requireCallback(callback: unknown): Callback {
  if (typeof callback !== "function") throw new TypeError("The callback is not a function");
  return callback as Callback;
}

// `...rest` keeps the declared `length` at 1, as the natives have it; `rest[0]` is `thisArg`.
function findLast(this: unknown, callback: Callback, ...rest: unknown[]): unknown {
  const source = toObject(this, "findLast");
  const length = toLength(source.length);
  const test = requireCallback(callback);
  for (let index = length - 1; index >= 0; index--) {
    const value = source[index];
    if (test.call(rest[0], value, index, source)) return value;
  }
  return undefined;
}

function findLastIndex(this: unknown, callback: Callback, ...rest: unknown[]): number {
  const source = toObject(this, "findLastIndex");
  const length = toLength(source.length);
  const test = requireCallback(callback);
  for (let index = length - 1; index >= 0; index--) {
    if (test.call(rest[0], source[index], index, source)) return index;
  }
  return -1;
}

function toReversed(this: unknown): unknown[] {
  const source = toObject(this, "toReversed");
  const length = toLength(source.length);
  const copy = new Array<unknown>(length); // a RangeError past 2^32 − 1, as the native
  for (let index = 0; index < length; index++) copy[index] = source[length - index - 1];
  return copy;
}

const SHIMS: ReadonlyArray<readonly [name: string, implementation: unknown]> = [
  ["findLast", findLast],
  ["findLastIndex", findLastIndex],
  ["toReversed", toReversed],
];

/**
 * Installs whichever of the methods above the runtime lacks on `target` (the real
 * `Array.prototype` unless a test passes its own) and returns the names it had to
 * add — an empty list on any current WebView. Idempotent, and never replaces a
 * native.
 */
export function installRuntimeCompat(target: object = Array.prototype): string[] {
  const added: string[] = [];
  for (const [name, implementation] of SHIMS) {
    if (typeof (target as Record<string, unknown>)[name] === "function") continue;
    Object.defineProperty(target, name, { value: implementation, writable: true, configurable: true, enumerable: false });
    added.push(name);
  }
  return added;
}
