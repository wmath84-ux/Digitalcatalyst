"use client";

import { useState } from "react";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/utils/apiBase";
import { auth } from "../../firebase";
import { GlassButton } from "@/components/ui/glass-button";

interface GatePersonalAccessProps {
  fileId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  productId?: string | null;
  moduleId?: string | null;
}

/**
 * Gate personal access uses the owner-side sharing workflow instead of
 * learner-facing Google Drive OAuth. The learner never sees an OAuth consent screen.
 * They fill ONE email field
 * (heading "Gate personal access") in the Course Player settings and confirm
 * on submit. The request is recorded and — when a service-account / Apps Script
 * is configured — the master Drive file is copied and shared with that email
 * automatically, without ever asking for the learner's Drive permission.
 */
export default function GatePersonalAccess({ fileId, fileUrl, fileName, productId, moduleId }: GatePersonalAccessProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState(() => user?.email || "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setResult(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    const resolvedFileId = String(fileId || "").trim() || (() => {
      const url = String(fileUrl || "");
      // Handle all Google file URL patterns:
      //   docs.google.com/document/d/<id>/...
      //   docs.google.com/spreadsheets/d/<id>/...
      //   docs.google.com/presentation/d/<id>/...
      //   docs.google.com/forms/d/<id>/...  (or /d/e/<id>/...)
      //   drive.google.com/file/d/<id>/...
      //   ?id=<id>  (query param fallback)
      const m = url.match(/docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/(?:e\/)?([^/?#]+)/i)
        || url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i)
        || url.match(/[?&]id=([^&#]+)/i);
      return m ? (m[2] || m[1]) : "";
    })();
    if (!resolvedFileId) {
      setError("No file to gate — open a lesson file first.");
      return;
    }
    const confirmed = typeof window !== "undefined" ? window.confirm(`Send a personal copy to ${trimmed}?\n\nYou will receive a Drive share email. No Google Drive permission will be requested from this app.`) : true;
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Please sign in again.");
      const res = await apiFetch("/api/personal-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "gatePersonalAccess.request",
          email: trimmed,
          fileId: resolvedFileId,
          fileUrl: fileUrl || "",
          fileName: fileName || "",
          productId: productId || "",
          moduleId: moduleId || "",
        }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (body as Record<string, unknown>).ok !== true) {
        const msg = String((body as Record<string, unknown>).error || (body as Record<string, unknown>).message || `Request failed (${res.status})`);
        throw new Error(msg);
      }
      const data = (body as Record<string, unknown>).data as Record<string, unknown> | undefined;
      setResult({ ok: true, message: String(data?.message || `Request received for ${trimmed}. Check your email / Drive.` ) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-course-gate-personal-access className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white">
        <Mail size={14} className="text-cyan-200" /> Gate personal access
      </h3>
      <p className="mt-1 text-[11px] font-medium leading-relaxed text-white/60">
        Enter your email to receive a private, editable copy of this file shared to your Google account. No Google Drive permission is requested — the course operator prepares the copy for you.
        <a href="/privacy-policy.html#google-data" target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-cyan-200 underline underline-offset-2">Privacy details</a>
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="dc-field w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none"
          data-course-gate-email
        />
        <GlassButton
          variant="capsule"
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="w-full [&>span>div]:h-10 [&>span>div]:w-full [&>span>div]:font-black"
          data-course-gate-submit
        >
          <span className="inline-flex items-center gap-2">
            {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <Mail size={14} />}
            {submitting ? "Sending…" : "Submit"}
          </span>
        </GlassButton>
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-200" role="alert">
          <AlertCircle size={13} /> {error}
        </p>
      ) : null}
      {result?.ok ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200" role="status">
          <CheckCircle2 size={13} /> {result.message}
        </p>
      ) : null}

    </div>
  );
}
