import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckoutSelection, ServerPriceQuote } from "../types/commerce";
import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import type { PromoResult } from "../subscription/components/PromoCodeInput";

import { pdpSelectionKey } from "./quoteSelection";
export { pdpSelectionKey } from "./quoteSelection";

function validQuote(value: unknown): value is ServerPriceQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as ServerPriceQuote;
  return typeof quote.quoteId === "string" && quote.currency === "INR"
    && Array.isArray(quote.verifiedLineItems)
    && [quote.regularSubtotal, quote.saleDiscount, quote.couponDiscount, quote.cashPayable, quote.minimumPayable, quote.expiresAt]
      .every((number) => Number.isFinite(number) && number >= 0)
    && quote.expiresAt > Date.now() && (!quote.status || quote.status === "active");
}

type Entry = { key: string; quote: ServerPriceQuote | null; error: string; status: "idle" | "loading" | "ready" | "error" };

/** An isolated preview quote. Does not start or overwrite a checkout session. */
export function usePdpQuote({ selection, enabled, uid, chargeable }: {
  selection: CheckoutSelection;
  enabled: boolean;
  uid: string | null;
  chargeable: boolean;
}) {
  const [coupon, setCoupon] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry>({ key: "", quote: null, error: "", status: "idle" });
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [version, setVersion] = useState(0);
  const selectionWithCoupon = { ...selection, couponCode: chargeable ? coupon : null };
  const baseKey = pdpSelectionKey({ ...selection, couponCode: null });
  const key = `${uid || "guest"}:${pdpSelectionKey(selectionWithCoupon)}`;
  const latest = useRef({ key, baseKey, uid, enabled });
  latest.current = { key, baseKey, uid, enabled };
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const request = useCallback(async (next: CheckoutSelection, signal: AbortSignal): Promise<ServerPriceQuote> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in to verify pricing and apply a coupon.");
    const response = await apiFetch("/api/quotes/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ selection: next }),
      signal,
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; quote?: unknown; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Pricing could not be verified. Please retry.");
    if (!validQuote(payload.quote)) throw new Error("The pricing service returned an invalid or expired quote. Please retry.");
    return payload.quote;
  }, []);

  const refresh = useCallback(() => {
    setEntry((current) => ({ ...current, quote: null, error: "", status: "loading" }));
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!chargeable && coupon) { setCoupon(null); setCouponError(""); }
  }, [chargeable, coupon]);

  useEffect(() => {
    if (!enabled || !uid) return;
    // Applying a coupon already obtained this exact quote; do not issue it twice.
    if (entry.key === key && entry.status === "ready" && entry.quote && entry.quote.expiresAt > Date.now()) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++generation.current;
    setEntry({ key, quote: null, error: "", status: "loading" });
    const timer = window.setTimeout(() => {
      void request(selectionWithCoupon, controller.signal).then((quote) => {
        if (id !== generation.current || latest.current.key !== key || controller.signal.aborted) return;
        setEntry({ key, quote, error: "", status: "ready" });
        setCouponError("");
      }).catch((caught) => {
        if (id !== generation.current || latest.current.key !== key || controller.signal.aborted) return;
        const error = caught instanceof Error ? caught.message : "Pricing could not be verified.";
        // A coupon can stop qualifying after the selection changes. Drop it and
        // re-quote the actual items, never show the old discount as still valid.
        if (selectionWithCoupon.couponCode) {
          setCouponError(error);
          setCoupon(null);
          setEntry({ key, quote: null, error: "", status: "loading" });
        } else setEntry({ key, quote: null, error, status: "error" });
      });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // key fully describes the order. Fresh parent objects cannot restart a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, uid, version, request]);

  const quote = enabled && entry.key === key && entry.status === "ready" ? entry.quote : null;
  const status = !enabled || !uid ? "idle" : entry.key === key ? entry.status : "loading";
  useEffect(() => {
    if (!quote) return;
    const timer = window.setTimeout(refresh, Math.min(2_147_000_000, Math.max(0, quote.expiresAt - Date.now() - 1000)));
    return () => window.clearTimeout(timer);
  }, [quote, refresh]);

  const applyCoupon = async (raw: string): Promise<PromoResult> => {
    const code = raw.trim().toUpperCase();
    if (!uid || !auth.currentUser) return { valid: false, message: "Sign in to apply a coupon." };
    if (!enabled || !chargeable) return { valid: false, message: "Choose payable items before applying a coupon." };
    if (!code) return { valid: false, message: "Enter a coupon code." };
    const scope = latest.current.baseKey;
    const account = uid;
    const next = { ...selection, couponCode: code };
    const nextKey = `${uid}:${pdpSelectionKey(next)}`;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++generation.current;
    setApplying(true);
    setCouponError("");
    try {
      const result = await request(next, controller.signal);
      if (latest.current.baseKey !== scope || latest.current.uid !== account || !latest.current.enabled || id !== generation.current) {
        return { valid: false, message: "Selection changed. Apply the code again for these items." };
      }
      if (result.couponCode !== code) throw new Error("This coupon was not applied to the selected items.");
      setCoupon(code);
      setEntry({ key: nextKey, quote: result, error: "", status: "ready" });
      return { valid: true, message: "Coupon applied." };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Coupon could not be applied.";
      if (latest.current.baseKey === scope && latest.current.uid === account) {
        setCouponError(message);
        // A failed apply must not strand a cancelled initial quote.
        setVersion((current) => current + 1);
      }
      return { valid: false, message };
    } finally { if (id === generation.current) setApplying(false); }
  };

  useEffect(() => { setApplying(false); }, [baseKey, uid]);
  const removeCoupon = () => { setCoupon(null); setCouponError(""); };
  return {
    quote, status, error: entry.key === key ? entry.error : "", couponError, applying,
    appliedCode: quote?.couponCode || null, couponIntent: chargeable ? coupon : null,
    applyCoupon, removeCoupon, refresh,
  };
}
