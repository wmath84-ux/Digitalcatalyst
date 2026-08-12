// src/checkout/CheckoutContext.tsx
//
// React context for the checkout pipeline. Replaces the mutable
// `src/data/checkoutData.ts` singleton + `Object.assign` flow that
// previously leaked state across pages.
//
// Responsibilities:
//   1. Read the validated session record from sessionStorage on mount.
//   2. Fetch a server-authoritative `ServerPriceQuote` for the selection
//      (Part 4 endpoint at `/api/quotes/create`).
//   3. Expose an immutable, typed `CheckoutContextValue` to the rest of
//      the app — `CheckoutApp`, `OrderSummary`, `PaymentGateway`,
//      `VerificationSuccess`, etc.
//   4. Support `refresh()` (re-fetch the quote) and `cancel()` (clear
//      the stored record and return to the source page).
//   5. Persist the verified record on every successful quote load so
//      the user can refresh the page or open a new tab and resume
//      their checkout.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildCheckoutSessionRecord,
  clearFromSessionStorage,
  readFromSessionStorage,
  writeToSessionStorage,
} from "../../utils/checkoutSession";
import { auth } from "../../firebase";
import type { ServerPriceQuote } from "../types/commerce";
import {
  type CheckoutBuyer,
  type CheckoutContextValue,
  type CheckoutPipelineStatus,
  type CheckoutQuoteStatus,
  type CheckoutReturnRoute,
  buyerFromAuthUser,
} from "./types";

const DEFAULT_RETURN_ROUTE: CheckoutReturnRoute = { hash: "#/store" };

const createSessionId = () => `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildEmptyValue = (overrides: Partial<CheckoutContextValue> = {}): CheckoutContextValue => ({
  sessionId: createSessionId(),
  selection: null,
  quote: null,
  buyer: null,
  returnRoute: DEFAULT_RETURN_ROUTE,
  status: "empty",
  quoteStatus: "idle",
  errorMessage: null,
  errorCode: null,
  idempotencyKey: null,
  builtAt: Date.now(),
  refresh: async () => undefined,
  applyCoupon: async () => ({ ok: false, reason: "No active checkout." }),
  removeCoupon: async () => undefined,
  couponStatus: "idle",
  couponErrorMessage: null,
  couponInput: "",
  setCouponInput: () => undefined,
  reload: () => undefined,
  goBack: () => undefined,
  cancel: () => undefined,
  ...overrides,
});

const CheckoutContext = createContext<CheckoutContextValue | undefined>(undefined);

export const useCheckout = (): CheckoutContextValue => {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error("useCheckout must be used within a <CheckoutProvider>");
  return context;
};

interface CheckoutProviderProps {
  children: ReactNode;
  /** Override the storage backend (used in tests). Defaults to `window.sessionStorage`. */
  storage?: Storage | null;
  /** Override the fetch backend (used in tests). Defaults to `globalThis.fetch`. */
  fetcher?: typeof fetch;
  /**
   * Optional override for the auth token fetcher. Defaults to
   * `auth.currentUser?.getIdToken(true)`.
   */
  getIdToken?: () => Promise<string | null>;
}

const normalizeError = (error: unknown): { code: string; message: string } => {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    return { code: code || "unknown", message: error.message };
  }
  return { code: "unknown", message: "Could not load price quote." };
};

/**
 * Build an enriched `Error` carrying a `code` (and optional HTTP `status`).
 * Uses direct property assignment on a fresh `Error` instance — never
 * `Object.assign` — to keep the public surface explicit and to play well
 * with the `Object.assign` lint rule in `tests/checkoutMobileWidths`.
 */
const makeError = (message: string, code: string, status?: number): Error => {
  const err = new Error(message) as Error & { code: string; status?: number };
  err.code = code;
  if (typeof status === "number") {
    err.status = status;
  }
  return err;
};

export function CheckoutProvider({
  children,
  storage,
  fetcher,
  getIdToken,
}: CheckoutProviderProps) {
  const storageRef = useRef<Storage | null>(storage ?? (typeof window !== "undefined" ? window.sessionStorage : null));
  const fetcherRef = useRef<typeof fetch>(fetcher ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined));
  const getIdTokenRef = useRef<() => Promise<string | null>>(
    getIdToken ?? (async () => {
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken(true);
    }),
  );

  // -----------------------------------------------------------------------
  // State — every render of the provider returns a fresh value object.
  // -----------------------------------------------------------------------
  const [sessionId] = useState<string>(() => createSessionId());
  const [selection, setSelection] = useState<CheckoutContextValue["selection"]>(null);
  const [quote, setQuote] = useState<ServerPriceQuote | null>(null);
  const [buyer, setBuyer] = useState<CheckoutBuyer | null>(null);
  const [returnRoute, setReturnRoute] = useState<CheckoutReturnRoute>(DEFAULT_RETURN_ROUTE);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckoutPipelineStatus>("empty");
  const [quoteStatus, setQuoteStatus] = useState<CheckoutQuoteStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [builtAt, setBuiltAt] = useState<number>(Date.now());
  // Part 7 — coupon state. The input is a controlled string, the
  // status tracks the round-trip, and the error message is
  // surfaced so the UI can show a targeted message under the
  // input.
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "error">("idle");
  const [couponErrorMessage, setCouponErrorMessage] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState<string>("");

  // Holds the in-flight fetch controller so refresh() can cancel the
  // previous request when the user clicks refresh again.
  const abortRef = useRef<AbortController | null>(null);
  // True when the current fetch is a refresh (vs. the initial load).
  const refreshModeRef = useRef<boolean>(false);
  // Holds the in-flight refresh promise so callers can await it.
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // -----------------------------------------------------------------------
  // Core fetcher
  // -----------------------------------------------------------------------
  const fetchQuote = useCallback(async (record: {
    selection: NonNullable<CheckoutContextValue["selection"]>;
    buyer: CheckoutBuyer;
    returnRoute: CheckoutReturnRoute;
    idempotencyKey: string | null;
  }) => {
    const fetchImpl = fetcherRef.current;
    const idTokenImpl = getIdTokenRef.current;
    if (typeof fetchImpl !== "function") {
      throw makeError("Network is unavailable.", "network_unavailable");
    }
    const token = await idTokenImpl();
    if (!token) {
      throw makeError("Your session expired. Please log in again.", "auth_required");
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const body: Record<string, unknown> = { selection: record.selection };
    if (record.idempotencyKey) body.idempotencyKey = record.idempotencyKey;
    const response = await fetchImpl("/api/quotes/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload: { ok?: boolean; quote?: ServerPriceQuote; error?: string } = {};
    try {
      payload = await response.json();
    } catch {
      // ignore: server may have returned empty body
    }
    if (!response.ok || !payload.ok || !payload.quote) {
      const code = response.status === 401 ? "auth_required" : response.status === 404 ? "not_found" : response.status === 403 ? "forbidden" : "server_error";
      throw makeError(payload.error || `Server returned ${response.status}.`, code, response.status);
    }
    return payload.quote;
  }, []);

  // -----------------------------------------------------------------------
  // Public actions — declared first so the memoised value can reference
  // them. They are stable via `useCallback`.
  // -----------------------------------------------------------------------
  const goBack = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.hash = returnRoute.hash || DEFAULT_RETURN_ROUTE.hash;
  }, [returnRoute.hash]);

  const cancel = useCallback(() => {
    if (storageRef.current) clearFromSessionStorage();
    setSelection(null);
    setQuote(null);
    setIdempotencyKey(null);
    setStatus("empty");
    setQuoteStatus("idle");
    setErrorMessage(null);
    setErrorCode(null);
    setBuiltAt(Date.now());
    // Part 7 — clear coupon state too.
    setCouponStatus("idle");
    setCouponErrorMessage(null);
    setCouponInput("");
    if (typeof window !== "undefined") {
      window.location.hash = returnRoute.hash || DEFAULT_RETURN_ROUTE.hash;
    }
  }, [returnRoute.hash]);

  // -----------------------------------------------------------------
  // Part 7 — apply a coupon. Updates the selection's `couponCode`,
  // re-fetches the server-side quote, and surfaces the new
  // `couponDiscount` on the returned quote. Idempotent: re-applying
  // the same code triggers a refresh, not a duplicate server write.
  // -----------------------------------------------------------------
  const applyCoupon = useCallback(
    async (rawCode: string) => {
      if (!selection || !buyer) {
        return { ok: false as const, reason: "No active checkout to apply a coupon to." };
      }
      const code = String(rawCode || "").trim();
      if (!code) {
        return { ok: false as const, reason: "Enter a coupon code." };
      }
      setCouponStatus("applying");
      setCouponErrorMessage(null);
      setCouponInput(code);
      // Build the new selection with the coupon code. We do NOT
      // mutate the existing selection — the pure-immutable rule.
      const nextSelection = { ...selection, couponCode: code };
      setSelection(nextSelection);
      setStatus("loading");
      setQuoteStatus("refreshing");
      try {
        const next = await fetchQuote({
          selection: nextSelection,
          buyer,
          returnRoute,
          idempotencyKey,
        });
        setQuote(next);
        setQuoteStatus("ready");
        setStatus("ready");
        if (storageRef.current) {
          writeToSessionStorage(
            buildCheckoutSessionRecord({
              selection: nextSelection,
              quote: next,
              buyer,
              returnRoute,
              idempotencyKey,
            }),
          );
        }
        setBuiltAt(Date.now());
        setCouponStatus("idle");
        setCouponErrorMessage(null);
        return { ok: true as const };
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          setCouponStatus("idle");
          return { ok: false as const, reason: "Request was cancelled." };
        }
        const { message } = normalizeError(error);
        setCouponStatus("error");
        setCouponErrorMessage(message);
        setStatus("needs_refresh");
        setQuoteStatus("ready");
        // Roll back the optimistic selection update so the next
        // render reflects the pre-coupon state.
        setSelection(selection);
        return { ok: false as const, reason: message };
      }
    },
    [selection, buyer, returnRoute, idempotencyKey, fetchQuote],
  );

  // -----------------------------------------------------------------
  // Part 7 — remove the coupon. Re-fetches the server-side quote
  // without a couponCode so the cashPayable reflects the
  // pre-coupon total.
  // -----------------------------------------------------------------
  const removeCoupon = useCallback(async () => {
    if (!selection || !buyer) return;
    if (!selection.couponCode) {
      setCouponInput("");
      return;
    }
    setCouponStatus("applying");
    setCouponErrorMessage(null);
    setCouponInput("");
    const nextSelection = { ...selection, couponCode: null };
    setSelection(nextSelection);
    setStatus("loading");
    setQuoteStatus("refreshing");
    try {
      const next = await fetchQuote({
        selection: nextSelection,
        buyer,
        returnRoute,
        idempotencyKey,
      });
      setQuote(next);
      setQuoteStatus("ready");
      setStatus("ready");
      if (storageRef.current) {
        writeToSessionStorage(
          buildCheckoutSessionRecord({
            selection: nextSelection,
            quote: next,
            buyer,
            returnRoute,
            idempotencyKey,
          }),
        );
      }
      setBuiltAt(Date.now());
      setCouponStatus("idle");
      setCouponErrorMessage(null);
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      const { message } = normalizeError(error);
      setCouponStatus("error");
      setCouponErrorMessage(message);
      setSelection(selection);
    }
  }, [selection, buyer, returnRoute, idempotencyKey, fetchQuote]);

  const refresh = useCallback(async () => {
    if (!selection || !buyer) {
      return;
    }
    refreshModeRef.current = true;
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }
    setQuoteStatus("refreshing");
    setErrorMessage(null);
    setErrorCode(null);
    const promise = (async () => {
      try {
        const next = await fetchQuote({
          selection,
          buyer,
          returnRoute,
          idempotencyKey,
        });
        setQuote(next);
        setQuoteStatus("ready");
        setStatus("ready");
        // Persist the refreshed record so a page reload resumes the new quote.
        if (storageRef.current) {
          writeToSessionStorage(
            buildCheckoutSessionRecord({
              selection,
              quote: next,
              buyer,
              returnRoute,
              idempotencyKey,
            }),
          );
        }
        setBuiltAt(Date.now());
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }
        const { code, message } = normalizeError(error);
        setErrorCode(code);
        setErrorMessage(message);
        setQuoteStatus("error");
        // If the server explicitly rejected the selection (400/404/403) we
        // need a safe recovery path — the user can't keep retrying the
        // same invalid selection.
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 404 || status === 403) {
          setStatus("invalid");
        } else {
          setStatus("needs_refresh");
        }
      } finally {
        refreshModeRef.current = false;
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = promise;
    return promise;
  }, [selection, buyer, returnRoute, idempotencyKey, fetchQuote]);

  const reload = useCallback(() => {
    // Re-issue the same selection (after a successful payment, the
    // PDP CTA can call this with a new idempotency key). For now this
    // is a no-op wrapper around `refresh` — the action surface is
    // kept distinct so callers can document their intent.
    void refresh();
  }, [refresh]);

  // -----------------------------------------------------------------------
  // Initial load — read the stored record, derive the buyer, and fetch
  // the quote. Runs once on mount.
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const stored = storageRef.current ? readFromSessionStorage() : null;
      if (!stored) {
        if (!cancelled) {
          setStatus("empty");
          setQuoteStatus("idle");
        }
        return;
      }
      const authUser = typeof auth !== "undefined" ? auth.currentUser : null;
      const derivedBuyer: CheckoutBuyer = stored.buyer.uid
        ? stored.buyer
        : (authUser
          ? buyerFromAuthUser({
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName,
              emailVerified: authUser.emailVerified,
            })
          : stored.buyer);
      if (cancelled) return;
      setSelection(stored.selection);
      setBuyer(derivedBuyer);
      setReturnRoute(stored.returnRoute || DEFAULT_RETURN_ROUTE);
      setIdempotencyKey(stored.idempotencyKey);
      // If the stored quote is still active and unexpired, surface it
      // immediately and skip the network round-trip.
      if (stored.quote && stored.quote.status === "active" && stored.quote.expiresAt > Date.now()) {
        setQuote(stored.quote);
        setQuoteStatus("ready");
        setStatus("ready");
        setBuiltAt(Date.now());
        return;
      }
      // Else fetch a fresh quote.
      setStatus("loading");
      setQuoteStatus("loading");
      try {
        const next = await fetchQuote({
          selection: stored.selection,
          buyer: derivedBuyer,
          returnRoute: stored.returnRoute || DEFAULT_RETURN_ROUTE,
          idempotencyKey: stored.idempotencyKey,
        });
        if (cancelled) return;
        setQuote(next);
        setQuoteStatus("ready");
        setStatus("ready");
        if (storageRef.current) {
          writeToSessionStorage(
            buildCheckoutSessionRecord({
              selection: stored.selection,
              quote: next,
              buyer: derivedBuyer,
              returnRoute: stored.returnRoute || DEFAULT_RETURN_ROUTE,
              idempotencyKey: stored.idempotencyKey,
            }),
          );
        }
        setBuiltAt(Date.now());
      } catch (error) {
        if (cancelled) return;
        if ((error as { name?: string }).name === "AbortError") return;
        const { code, message } = normalizeError(error);
        setErrorCode(code);
        setErrorMessage(message);
        setQuoteStatus("error");
        const status = (error as { status?: number }).status;
        setStatus(status === 400 || status === 404 || status === 403 ? "invalid" : "needs_refresh");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchQuote]);

  // Cleanup any in-flight fetch on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // -----------------------------------------------------------------------
  // Memoised value — re-computed only when something actually changes.
  // -----------------------------------------------------------------------
  const value = useMemo<CheckoutContextValue>(
    () =>
      buildEmptyValue({
        sessionId,
        selection,
        quote,
        buyer,
        returnRoute,
        status,
        quoteStatus,
        errorMessage,
        errorCode,
        idempotencyKey,
        builtAt,
        refresh,
        applyCoupon,
        removeCoupon,
        couponStatus,
        couponErrorMessage,
        couponInput,
        setCouponInput,
        reload,
        goBack,
        cancel,
      }),
    [sessionId, selection, quote, buyer, returnRoute, status, quoteStatus, errorMessage, errorCode, idempotencyKey, builtAt, refresh, applyCoupon, removeCoupon, couponStatus, couponErrorMessage, couponInput, reload, goBack, cancel],
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}
