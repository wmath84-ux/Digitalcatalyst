// src/course/YouTubeKeyCard.tsx
//
// "APNI YouTube API KEY JODO" — the bring-your-own-key card.
//
// The Music library can search YouTube only with a Data API v3 key. That key
// is the learner's OWN: it lives in this browser's localStorage, it is sent
// straight from the browser to Google, and the quota it burns is the
// learner's. The school (the app owner) never pays for a search, and the
// owner's key stays a fallback for anyone who has not connected one.
//
// The card does four things, and nothing else:
//   · shows whether a key is connected (and which one, without revealing it);
//   · TESTS a key before it is saved, and names the real reason when it
//     fails (wrong key · the API is not enabled in that project · the daily
//     quota is gone · the referrer restriction did not match · no network);
//   · saves it, or removes it;
//   · says WHERE to get a key, in four steps, with the console link.
//
// The key is never shown in full once it is stored, never logged, and never
// sent to the app's own server.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import {
  clearYouTubeKey,
  masterYouTubeKeyAvailable,
  MUSIC_YOUTUBE_KEY_STORAGE,
  ownYouTubeKey,
  ownYouTubeKeySlot,
  saveYouTubeKey,
  setYouTubeKeySource,
  subscribeYouTubeKey,
  testYouTubeKey,
  type YouTubeKeyErrorCode,
} from "./musicSearch";
import KeySourceSwitch from "./KeySourceSwitch";

export type YouTubeKeyCardProps = {
  /** The signed-in learner — their key is stored per account. */
  uid?: string | null;
  /** Called after a save / a removal, so the host can re-read the key. */
  onChanged?: (connected: boolean) => void;
  className?: string;
};

/** The console link a learner needs, and the API they must switch on. */
export const YOUTUBE_API_CONSOLE_URL =
  "https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=";
export const YOUTUBE_API_CREDENTIALS_URL =
  "https://console.cloud.google.com/apis/credentials?project=";

/** "AIza…abcd" — enough to recognise a key, never enough to use it. */
const maskKey = (key: string): string => {
  const clean = String(key || "").trim();
  if (!clean) return "";
  if (clean.length <= 10) return `${clean.slice(0, 3)}…`;
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
};

/** The tone each failure deserves. */
const ERROR_TONE: Record<YouTubeKeyErrorCode, string> = {
  "no-key": "text-slate-600",
  "invalid-key": "text-rose-700",
  "api-disabled": "text-amber-700",
  quota: "text-amber-700",
  referrer: "text-amber-700",
  network: "text-rose-700",
  unknown: "text-rose-700",
};

export default function YouTubeKeyCard({ uid = null, onChanged, className = "" }: YouTubeKeyCardProps) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code: YouTubeKeyErrorCode | null; message: string } | null>(null);
  const [connected, setConnected] = useState(() => Boolean(ownYouTubeKey(uid)));

  /** Re-read the stored key whenever it changes — here or in another tab. */
  const refresh = useCallback(() => {
    setConnected(Boolean(ownYouTubeKey(uid)));
  }, [uid]);

  useEffect(() => {
    refresh();
    return subscribeYouTubeKey(refresh);
  }, [refresh]);

  const masked = useMemo(() => maskKey(ownYouTubeKey(uid)), [uid, connected]);
  /** Is the key in effect THIS account's, or this device's (the owner's)? */
  const onAccount = useMemo(
    () => ownYouTubeKeySlot(uid) !== MUSIC_YOUTUBE_KEY_STORAGE,
    [uid, connected],
  );

  const runTest = useCallback(async () => {
    const key = value.trim() || ownYouTubeKey(uid);
    if (!key) {
      setResult({ ok: false, code: "no-key", message: "Pehle key paste karo." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const outcome = await testYouTubeKey(key);
      setResult(outcome);
    } finally {
      setBusy(false);
    }
  }, [value, uid]);

  const runSave = useCallback(() => {
    const key = value.trim();
    if (!key) {
      setResult({ ok: false, code: "no-key", message: "Pehle key paste karo." });
      return;
    }
    const stored = saveYouTubeKey(key, uid);
    if (!stored) {
      setResult({
        ok: false,
        code: "unknown",
        message: "Browser ne key save nahi ki — private mode ya storage block ho sakta hai.",
      });
      return;
    }
    setValue("");
    setReveal(false);
    setConnected(true);
    setResult({ ok: true, code: null, message: "Key save ho gayi — ab YouTube search app ke andar chalega." });
    toast({ title: "YouTube API key connected", variant: "success" });
    onChanged?.(true);
  }, [value, uid, onChanged]);

  const runRemove = useCallback(() => {
    clearYouTubeKey(uid);
    setValue("");
    setResult(null);
    setConnected(false);
    toast({ title: "YouTube API key hata di", variant: "info" });
    onChanged?.(false);
  }, [uid, onChanged]);

  return (
    <section
      data-you-tube-key-card
      data-you-tube-key-state={connected ? "connected" : "missing"}
      className={`rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          <KeyRound size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black tracking-tight text-slate-950">YouTube search ki apni API key</p>
          <p className="mt-0.5 text-[11.5px] font-medium leading-5 text-slate-500">
            {connected
              ? `Key lagi hai (${masked})${onAccount ? " — aapke account ki" : " — is device ki"}. Ye key sirf aapke device ke browser me save hai, har user ka apna quota use hota hai.`
              : "YouTube ke andar search karne ke liye apni YouTube Data API v3 key jodo. Key sirf aapke device me save hogi."}
          </p>
        </div>
        {connected ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
            <CheckCircle2 size={12} aria-hidden="true" /> Connected
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(event) => { setValue(event.target.value); setResult(null); }}
            placeholder={connected ? `Sahi key badalni hai? (${masked})` : "AIza…"}
            aria-label="YouTube Data API key"
            data-you-tube-key-input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 pr-9 text-[12.5px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
          />
          <button
            type="button"
            onClick={() => setReveal((current) => !current)}
            aria-label={reveal ? "Key chhupa do" : "Key dikhao"}
            title={reveal ? "Key chhupa do" : "Key dikhao"}
            data-you-tube-key-reveal
            className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={busy}
          data-you-tube-key-test
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[11.5px] font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Test karo
        </button>
        <button
          type="button"
          onClick={runSave}
          disabled={busy}
          data-you-tube-key-save
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[11.5px] font-black text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Save karo
        </button>
        {connected ? (
          <button
            type="button"
            onClick={runRemove}
            data-you-tube-key-remove
            aria-label="Key hata do"
            title="Key hata do"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      {result ? (
        <p
          role="status"
          data-you-tube-key-result
          data-you-tube-key-result-code={result.code ?? "ok"}
          className={`mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] font-semibold leading-5 ${
            result.ok ? "text-emerald-700" : ERROR_TONE[result.code ?? "unknown"]
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <KeySourceSwitch
        engine="youtube"
        uid={uid}
        masterAvailable={masterYouTubeKeyAvailable()}
        onChoose={(source) => setYouTubeKeySource(source, uid)}
        label="YouTube search ki API key"
      />

      <details className="mt-3" data-you-tube-key-help>
        <summary className="cursor-pointer text-[11.5px] font-black text-slate-700">
          Key kaise banayein? (4 steps)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] font-medium leading-5 text-slate-600">
          <li>
            Google Cloud Console kholein → ek project chunein (ya naya bana lein).
          </li>
          <li>
            <a
              className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2"
              href={YOUTUBE_API_CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube Data API v3
              <ExternalLink size={11} className="inline" aria-hidden="true" />
            </a>{" "}
            kholein aur <strong>Enable</strong> karein. (Billing ki zaroorat nahi — free quota milta hai.)
          </li>
          <li>
            <a
              className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2"
              href={YOUTUBE_API_CREDENTIALS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Credentials
              <ExternalLink size={11} className="inline" aria-hidden="true" />
            </a>{" "}
            → <strong>Create credentials → API key</strong>. Key copy karein.
          </li>
          <li>
            Key ko do restrictions do: <strong>API restriction</strong> → sirf{" "}
            <em>YouTube Data API v3</em>, aur <strong>Application restriction</strong> →{" "}
            <em>Websites</em> → app ki site ka address (jaise{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">https://eduvora.shop/*</code>).
          </li>
        </ol>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium leading-5 text-slate-500">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          Aapki key sirf aapke browser me rehti hai — humein kahin bhejti nahi jati. Request seedha Google
          ke paas jaati hai, isliye apni hi key use karein.
        </p>
      </details>
    </section>
  );
}
