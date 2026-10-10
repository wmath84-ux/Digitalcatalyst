// src/components/WebClipperCard.tsx
//
// "Web Clipper" — the app side of the Chrome/Firefox extension.
//
// WHERE THIS LIVES AND WHY: the clipper needs a place to show a pairing code,
// list the connected browsers and revoke one. That place must NOT be inside the
// My Day route: `#/my-day` is the Joplin workspace and its chrome belongs to
// Joplin (no Digitalcatalyst toolbar layered over it). The usage/limits page is
// the existing surface for "what this account can do and where it is used", so
// the card sits next to the My Day allowance card it belongs to.
//
// SECURITY SHAPE (mirrors docs/joplin-myday-architecture.md §Web Clipper):
//   · the code shown here is single-use and expires in 10 minutes;
//   · the extension receives a scoped token, never a Firebase session;
//   · the token is stored hashed server-side, is listable here without its
//     secret, and can be revoked (or rotated) at any time.

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Puzzle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { ProfileCard } from "../profile/ProfileCard";
import { GlassButton } from "./ui/glass-button";

type ClipperToken = {
  tokenId: string;
  label: string;
  scopes: string[];
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
  status: string;
};

type PairingCode = { code: string; expiresAt: number };

const request = async (action: string, body: Record<string, unknown> = {}) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again to manage the Web Clipper.");
  const response = await apiFetch("/api/joplin/clipper", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.error || `The server refused that request (${response.status}).`));
  }
  return payload;
};

const formatWhen = (value: number) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
};

export default function WebClipperCard({ minimal = false }: { minimal?: boolean } = {}) {
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [tokens, setTokens] = useState<ClipperToken[]>([]);
  const [busy, setBusy] = useState<"idle" | "code" | "load" | "revoke">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setBusy((current) => (current === "idle" ? "load" : current));
    try {
      const payload = await request("joplin.clipper.status");
      setTokens(Array.isArray(payload.tokens) ? (payload.tokens as ClipperToken[]) : []);
      setLoaded(true);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the connected browsers.");
    } finally {
      setBusy("idle");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generateCode = useCallback(async () => {
    setBusy("code");
    setNotice("");
    try {
      const payload = await request("joplin.clipper.pair.start", { label: "Browser extension" });
      setCode({ code: String(payload.code || ""), expiresAt: Number(payload.expiresAt) || 0 });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a pairing code.");
    } finally {
      setBusy("idle");
    }
  }, []);

  const revoke = useCallback(async (tokenId: string) => {
    setBusy("revoke");
    try {
      await request("joplin.clipper.revoke", { tokenId });
      setNotice("That browser can no longer clip into your workspace.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke that browser.");
    } finally {
      setBusy("idle");
    }
  }, [refresh]);

  const revokeAll = useCallback(async () => {
    setBusy("revoke");
    try {
      await request("joplin.clipper.revoke", { all: true });
      setNotice("Every connected browser was disconnected.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke the browsers.");
    } finally {
      setBusy("idle");
    }
  }, [refresh]);

  const copy = useCallback(() => {
    if (!code?.code) return;
    void navigator.clipboard?.writeText(code.code).then(
      () => setNotice("Pairing code copied."),
      () => setNotice("Copy the code manually — the clipboard is blocked here."),
    );
  }, [code]);

  if (minimal) return (
    <section data-web-clipper-card className="dc-usage-clipper" aria-live="polite">
      <p className="dc-account-note">Save web pages as My Day notes. Pairing codes are single-use; browser access can be revoked.</p>
      <div className="dc-usage-actions"><button type="button" onClick={() => void generateCode()} disabled={busy !== "idle"} className="dc-account-text-action">{busy === "code" ? "Generating…" : code && code.expiresAt > now ? "New pairing code" : "Pair a browser"}</button><button type="button" onClick={() => void refresh()} disabled={busy !== "idle"} className="dc-account-text-action">Refresh connections</button></div>
      {code ? <div data-web-clipper-code className="dc-usage-pairing-code"><code>{code.code}</code><button type="button" aria-label="Copy pairing code" onClick={copy} disabled={code.expiresAt <= now} className="dc-account-text-action">Copy</button><p className="dc-account-note">{code.expiresAt <= now ? "Expired. Generate a new pairing code." : `Single use · Expires ${formatWhen(code.expiresAt)}`}</p></div> : null}
      {error ? <p role="alert" className="dc-account-error">{loaded ? "Last verified connections shown. " : ""}{error}</p> : null}
      {notice ? <p role="status" className="dc-account-note">{notice}</p> : null}
      {!loaded && !error ? <p role="status" className="dc-account-note">Loading browser connections…</p> : loaded ? <div data-web-clipper-tokens>{tokens.length ? <ul>{tokens.map((token) => <li key={token.tokenId} className="dc-usage-browser-row"><div><strong>{token.label || "Browser extension"}</strong><p className="dc-account-note">{token.status === "active" && token.expiresAt <= now ? "Expired" : token.status} · Last used {formatWhen(token.lastUsedAt)} · Expires {formatWhen(token.expiresAt)}</p></div><button type="button" onClick={() => void revoke(token.tokenId)} disabled={busy !== "idle"} aria-label={`Disconnect ${token.label || "this browser"}`} className="dc-account-text-action">Disconnect</button></li>)}</ul> : <p className="dc-account-note">No connected browsers.</p>}{tokens.some((token) => token.status === "active" && token.expiresAt > now) ? <button type="button" onClick={() => void revokeAll()} disabled={busy !== "idle"} className="dc-account-text-action">Disconnect all browsers</button> : null}</div> : null}
    </section>
  );
  return (
    <ProfileCard contentClassName="p-4 sm:p-5">
      <div data-web-clipper-card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35">
            <Puzzle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="dc-profile-card-title">Web Clipper</h2>
            <p className="dc-profile-card-meta mt-1">
              Clip a page into the <span className="font-semibold">Web Clippings</span> notebook of your My Day
              workspace. Clipped pages are normal notes — searchable, taggable and scheduled like any other.
            </p>
          </div>
        </div>

        {code ? (
          <div className="dc-profile-subpanel flex flex-col gap-2 p-3" data-web-clipper-code>
            <span className="dc-profile-card-meta">Type this code into the extension</span>
            <div className="flex items-center gap-2">
              <span className="dc-profile-card-title text-2xl tracking-[0.3em]">{code.code}</span>
              <button
                type="button"
                onClick={copy}
                className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Copy pairing code"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <span className="dc-profile-card-meta flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              Single use · expires {formatWhen(code.expiresAt)}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <GlassButton type="button" variant="capsule" onClick={generateCode} disabled={busy === "code"}>
              {busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Puzzle className="h-4 w-4" />}
              Pair a browser
            </GlassButton>
            <GlassButton type="button" variant="capsule" onClick={() => void refresh()} disabled={busy === "load"}>
              {busy === "load" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </GlassButton>
          </div>
        )}

        <div className="flex flex-col gap-2" data-web-clipper-tokens>
          {tokens.length === 0 ? (
            <p className="dc-profile-card-meta">No browser is connected yet.</p>
          ) : (
            tokens.map((token) => (
              <div key={token.tokenId} className="dc-profile-subpanel flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <span className="dc-profile-card-title block truncate">{token.label || "Browser extension"}</span>
                  <span className="dc-profile-card-meta block">
                    {token.status === "active" ? "Active" : token.status} · last used {formatWhen(token.lastUsedAt)} ·
                    expires {formatWhen(token.expiresAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(token.tokenId)}
                  disabled={busy === "revoke"}
                  className="rounded-xl p-2 text-rose-200 transition hover:bg-rose-500/15"
                  aria-label={`Disconnect ${token.label || "this browser"}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
          {tokens.some((token) => token.status === "active") ? (
            <button
              type="button"
              onClick={() => void revokeAll()}
              disabled={busy === "revoke"}
              className="dc-profile-card-meta self-start underline transition hover:text-white"
            >
              Disconnect every browser
            </button>
          ) : null}
        </div>

        {notice ? <p className="dc-profile-card-meta text-emerald-200">{notice}</p> : null}
        {error ? <p className="dc-profile-card-meta text-rose-200">{error}</p> : null}

        <p className="dc-profile-card-meta">
          The extension never receives your password, your Firebase session or a refresh token — only a revocable
          <span className="font-semibold"> clip:write </span>
          token that can add a page to Web Clippings and nothing else.
        </p>
      </div>
    </ProfileCard>
  );
}
