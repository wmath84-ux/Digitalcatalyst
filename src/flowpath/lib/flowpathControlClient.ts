// src/flowpath/lib/flowpathControlClient.ts
//
// Thin fetch wrapper around /api/flowpath/control. Every mutation
// in the FlowPath UI (create / update / delete / complete / bulk /
// broadcast / list / audit) goes through this client, which:
//
//   • Adds the Firebase Auth id token so the server multiplexer
//     can authenticate the caller (and reject non-admins from
//     admin-only actions like bulk create + broadcast + audit).
//   • Surfaces the server's stable error codes (PLAN_REQUIRED,
//     TEST_BANK_FULL, MYDAY_DAILY_FREE_USED, ...) so the UI can
//     show specific recovery hints instead of a generic toast.
//   • Rejects after a 25s timeout so a stuck server never freezes
//     the dashboard.
//
// The server URL is fixed: /api/flowpath/control. Vercel rewrites
// this path to /api/referral-leaderboard (see vercel.json) which
// dispatches on the `action` body field. The Hobby plan 12-function
// cap is preserved.

import { auth } from "../../../firebase";

export type FlowPathControlResult<T> = (T & { ok: true }) | ({ ok: false; error: string; code?: string });

const ENDPOINT = "/api/flowpath/control";
const TIMEOUT_MS = 25_000;

const getIdToken = async (): Promise<string | null> => {
  try {
    if (!auth?.currentUser) return null;
    return await auth.currentUser.getIdToken(true);
  } catch {
    return null;
  }
};

export async function flowpathControl<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<FlowPathControlResult<T>> {
  const token = await getIdToken();
  if (!token) {
    return { ok: false, error: "Not signed in.", code: "AUTH_REQUIRED" } as FlowPathControlResult<T>;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!res.ok) {
      const body = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};
      return {
        ok: false,
        status: res.status,
        error: String(body.error || `Request failed (${res.status}).`),
        code: String(body.code || "REQUEST_FAILED"),
      } as unknown as FlowPathControlResult<T>;
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "Empty response.", code: "EMPTY_RESPONSE" } as FlowPathControlResult<T>;
    }
    return { ...(parsed as object), ok: true } as FlowPathControlResult<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timed out. Check your connection and try again.", code: "TIMEOUT" } as FlowPathControlResult<T>;
    }
    return { ok: false, error: err instanceof Error ? err.message : "Network error.", code: "NETWORK_ERROR" } as FlowPathControlResult<T>;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers — small typed wrappers for each action so the hooks and   */
/*  components never have to spell out the body shape.                */
/* ------------------------------------------------------------------ */

export const flowpathList = (uid: string, limit = 250) =>
  flowpathControl<{ items: unknown[] }>({ action: "flowpath.list", uid, limit });

export const flowpathAudit = (limit = 50) =>
  flowpathControl<{ entries: Array<Record<string, unknown>> }>({ action: "flowpath.audit", limit });

export const flowpathCreate = (uid: string, activity: Record<string, unknown>) =>
  flowpathControl<{ activity: Record<string, unknown> }>({ action: "flowpath.create", uid, activity });

export const flowpathUpdate = (uid: string, id: string, patch: Record<string, unknown>) =>
  flowpathControl<{ activity: Record<string, unknown> }>({ action: "flowpath.update", uid, id, ...patch });

export const flowpathDelete = (uid: string, id: string) =>
  flowpathControl({ action: "flowpath.delete", uid, id });

export const flowpathComplete = (uid: string, id: string) =>
  flowpathControl<{ activity: Record<string, unknown> }>({ action: "flowpath.complete", uid, id });

export const flowpathBulk = (uid: string, items: Array<Record<string, unknown>>, batchId?: string) =>
  flowpathControl<{ batchId?: string; results: Array<{ ok: boolean; activity?: Record<string, unknown>; error?: string }> }>({
    action: "flowpath.bulk",
    uid,
    items,
    batchId,
  });

export const flowpathBroadcast = (input: { title: string; body: string; url?: string }) =>
  flowpathControl<{ web: { sent: number; devices: number }; fcm: { sent: number; devices: number } }>({
    action: "flowpath.broadcast",
    ...input,
  });
