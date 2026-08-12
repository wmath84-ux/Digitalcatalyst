// src/checkout/types.ts
//
// Canonical, immutable types for the checkout pipeline. These types are
// the single source of truth for the React checkout context, the
// sessionStorage round-trip, and the Part 4 `ServerPriceQuote` shape.
//
// The intent is that NOTHING in the app mutates a shared mutable checkout
// singleton. The previous flow used a module-level `product` / `user`
// pair and `Object.assign` to "update" it; that is gone. The new flow
// builds a fresh `CheckoutContextValue` on every render of the provider
// and treats the underlying sessionStorage record as a validated,
// versioned snapshot.

import type { CheckoutSelection, ServerPriceQuote } from "../types/commerce";

/** Canonical buyer identity as it appears in the checkout context. */
export interface CheckoutBuyer {
  uid: string;
  name: string;
  email: string;
  mobile: string | null;
  emailVerified: boolean;
  /** True when the Firebase ID token has been verified by the server. */
  tokenVerified: boolean;
  coins: number;
}

/** Tags the source route that opened the checkout so we can go back. */
export interface CheckoutReturnRoute {
  hash: string;
  label?: string | null;
}

/** Network / quote load state. */
export type CheckoutQuoteStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "refreshing";

/** The whole pipeline status, combining selection + quote + ui. */
export type CheckoutPipelineStatus =
  | "empty"             // no selection stored, no quote
  | "loading"           // session restored, quote being fetched
  | "ready"             // selection + verified quote
  | "needs_refresh"     // quote expired, refresh button shown
  | "invalid"           // selection rejected by server (400/404/403)
  | "error";            // network/server error

/**
 * The immutable, single-source-of-truth context value. Every render of
 * the provider returns a fresh value object; consumers compare fields
 * with React's standard referential equality rules.
 */
export interface CheckoutContextValue {
  /** Unique id for the current checkout session. */
  sessionId: string;
  /** Canonical selection. Always present when status is `ready`. */
  selection: CheckoutSelection | null;
  /** Server-verified price quote (Part 4). Always present when status is `ready`. */
  quote: ServerPriceQuote | null;
  /** Buyer identity. Null only when the user is signed out. */
  buyer: CheckoutBuyer | null;
  /** Where to navigate when the user backs out of checkout. */
  returnRoute: CheckoutReturnRoute;
  /** Current pipeline status. */
  status: CheckoutPipelineStatus;
  /** Per-step UI status (independent from the quote network state). */
  quoteStatus: CheckoutQuoteStatus;
  /** Last error message (user-safe). Cleared on every successful refresh. */
  errorMessage: string | null;
  /** Last error code (machine-readable). */
  errorCode: string | null;
  /** Optional idempotency key carried over from the PDP CTA. */
  idempotencyKey: string | null;
  /** Timestamp the context was built (useful for diagnostics). */
  builtAt: number;
  /** Refresh the quote from the server (resets the 15-minute TTL). */
  refresh: () => Promise<void>;
  /**
   * Part 7 — apply a coupon code. Updates the canonical selection's
   * `couponCode`, re-fetches the server-side quote, and surfaces
   * the discount on the next render. Returns the human-readable
   * error message when the coupon is refused.
   */
  applyCoupon: (code: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Part 7 — remove a previously-applied coupon. Re-fetches the
   * server-side quote without a coupon code so the cashPayable
   * reflects the pre-coupon total.
   */
  removeCoupon: () => Promise<void>;
  /**
   * Part 7 — UI status for the coupon input. `idle` is the
   * default; `applying` while the round-trip is in flight; `error`
   * when the server refused the code. Cleared on the next
   * successful quote load.
   */
  couponStatus: "idle" | "applying" | "error";
  /**
   * Part 7 — last coupon error message (user-safe). Cleared on the
   * next successful quote load.
   */
  couponErrorMessage: string | null;
  /**
   * Part 7 — the coupon code the user typed in the input (the raw
   * user input, not the normalised code the server uses). The
   * context holds this so the input retains its value while the
   * server round-trip is in flight.
   */
  couponInput: string;
  /** Set the raw coupon input value (the input is controlled). */
  setCouponInput: (value: string) => void;
  /** Re-issue the same selection (after a successful payment). */
  reload: () => void;
  /** Navigate back to the source page. */
  goBack: () => void;
  /** Clear the stored session and reset the context. */
  cancel: () => void;
}

/**
 * The sessionStorage record shape. Bumping `schemaVersion` is the safe
 * way to invalidate older payloads; consumers should drop the record
 * when the version doesn't match.
 */
export interface CheckoutSessionRecordV1 {
  schemaVersion: 1;
  savedAt: number;
  selection: CheckoutSelection;
  quote: ServerPriceQuote | null;
  buyer: CheckoutBuyer;
  returnRoute: CheckoutReturnRoute;
  idempotencyKey: string | null;
}

/** The schema version the app currently writes. */
export const CHECKOUT_SESSION_SCHEMA_VERSION = 1 as const;

/** The sessionStorage key the provider reads + writes. */
export const CHECKOUT_SESSION_STORAGE_KEY = "checkoutSession.v1";

/** Helper: a CheckoutBuyer derived purely from the auth user object. */
export const buyerFromAuthUser = (input: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  mobile?: string | null;
  coins?: number;
  emailVerified?: boolean;
}): CheckoutBuyer => ({
  uid: String(input.uid || ""),
  name: String(input.displayName || input.email || ""),
  email: String(input.email || ""),
  mobile: input.mobile ? String(input.mobile) : null,
  emailVerified: Boolean(input.emailVerified),
  tokenVerified: Boolean(input.uid),
  coins: Number(input.coins || 0),
});
