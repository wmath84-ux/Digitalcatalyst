// src/course/GoogleSearchCard.tsx
//
// The GOOGLE search configuration — the Settings page's card for it.
//
// Google search needs TWO values, not one:
//
//   · an API key      — from the Google Cloud project that has the
//                        "Custom Search API" enabled;
//   · a Search Engine ID (the `cx`) — from a Programmable Search Engine.
//
// Both can come from the school (the owner's build-time values, which are the
// fallback) or from the learner themselves (stored in this browser, per
// account). The learner's own wins, so a school that leaves the owner's
// values empty is never billed for a single Google query.
//
// Like the YouTube key, the values never leave the browser: they are stored
// in this device's localStorage and sent straight from the browser to Google.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import GoogleGlyph from "./GoogleGlyph";
import {
  clearGoogleSearchConfig,
  googleSearchConfig,
  googleSearchOwnerConfigured,
  masterGoogleSearchAvailable,
  saveGoogleSearchConfig,
  setGoogleSearchSource,
  subscribeGoogleSearchConfig,
  testGoogleSearchConfig,
  type GoogleSearchErrorCode,
} from "./googleSearch";
import KeySourceSwitch from "./KeySourceSwitch";

export type GoogleSearchCardProps = {
  /** The signed-in learner — their configuration is stored per account. */
  uid?: string | null;
  onChanged?: (ready: boolean) => void;
  className?: string;
};

/** Where the two values come from. */
export const GOOGLE_SEARCH_ENGINE_URL = "https://programmablesearchengine.google.com/";
export const GOOGLE_SEARCH_API_URL = "https://console.cloud.google.com/apis/credentials";

/** "AIza…abcd" — enough to recognise a value, never enough to use it. */
const maskKey = (key: string): string => {
  const clean = String(key || "").trim();
  if (!clean) return "";
  if (clean.length <= 10) return `${clean.slice(0, 3)}…`;
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
};

/** The tone each failure deserves. */
const ERROR_TONE: Record<GoogleSearchErrorCode, string> = {
  "no-config": "text-slate-600",
  "invalid-key": "text-rose-700",
  "invalid-cx": "text-rose-700",
  "api-disabled": "text-amber-700",
  quota: "text-amber-700",
  referrer: "text-amber-700",
  network: "text-rose-700",
  unknown: "text-rose-700",
};

export default function GoogleSearchCard({ uid = null, onChanged, className = "" }: GoogleSearchCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [cx, setCx] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code: GoogleSearchErrorCode | null; message: string } | null>(null);
  const [ready, setReady] = useState(() => {
    const config = googleSearchConfig(uid);
    return Boolean(config.apiKey && config.cx);
  });
  const [fromOwner, setFromOwner] = useState(() => googleSearchOwnerConfigured(uid));

  /** Re-read the configuration whenever it changes — here or in another tab. */
  const refresh = useCallback(() => {
    const config = googleSearchConfig(uid);
    setReady(Boolean(config.apiKey && config.cx));
    setFromOwner(googleSearchOwnerConfigured(uid));
  }, [uid]);

  useEffect(() => {
    refresh();
    return subscribeGoogleSearchConfig(refresh);
  }, [refresh]);

  const masked = useMemo(() => maskKey(googleSearchConfig(uid).apiKey), [uid, ready]);

  const runTest = useCallback(async () => {
    const key = apiKey.trim() || googleSearchConfig(uid).apiKey;
    const engine = cx.trim() || googleSearchConfig(uid).cx;
    if (!key || !engine) {
      setResult({ ok: false, code: "no-config", message: "Pehle API key aur Search Engine ID dono daalo." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const outcome = await testGoogleSearchConfig(key, engine);
      setResult(outcome);
    } finally {
      setBusy(false);
    }
  }, [apiKey, cx, uid]);

  const runSave = useCallback(() => {
    const key = apiKey.trim();
    const engine = cx.trim();
    if (!key || !engine) {
      setResult({ ok: false, code: "no-config", message: "API key aur Search Engine ID dono chahiye." });
      return;
    }
    if (!saveGoogleSearchConfig(key, engine, uid)) {
      setResult({
        ok: false,
        code: "unknown",
        message: "Browser ne values save nahi ki — private mode ya storage block ho sakta hai.",
      });
      return;
    }
    setApiKey("");
    setCx("");
    setReveal(false);
    setReady(true);
    setFromOwner(false);
    setResult({ ok: true, code: null, message: "Configuration save ho gayi — Google search ab chalu hai." });
    toast({ title: "Google search connected", variant: "success" });
    onChanged?.(true);
  }, [apiKey, cx, uid, onChanged]);

  const runRemove = useCallback(() => {
    clearGoogleSearchConfig(uid);
    setApiKey("");
    setCx("");
    setResult(null);
    setReady(Boolean(googleSearchConfig(uid).apiKey && googleSearchConfig(uid).cx));
    setFromOwner(googleSearchOwnerConfigured(uid));
    toast({ title: "Google search configuration hata di", variant: "info" });
    onChanged?.(false);
  }, [uid, onChanged]);

  return (
    <section
      data-google-search-card
      data-google-search-state={ready ? "connected" : "missing"}
      className={`rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          <GoogleGlyph size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black tracking-tight text-slate-950">Google search ki configuration</p>
          <p className="mt-0.5 text-[11.5px] font-medium leading-5 text-slate-500">
            {ready
              ? `Search chalu hai${fromOwner ? " (school ki key se)" : ` (apni key se — ${masked})`}.`
              : "Course Player ke search box me Google icon dabane par web search karne ke liye API key aur Search Engine ID chahiye."}
          </p>
        </div>
        {ready ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
            <CheckCircle2 size={12} aria-hidden="true" /> Ready
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-black text-slate-700">Google API key</span>
          <span className="relative block">
            <input
              type={reveal ? "text" : "password"}
              value={apiKey}
              onChange={(event) => { setApiKey(event.target.value); setResult(null); }}
              placeholder={ready ? `Sahi key badalni hai? (${masked})` : "AIza…"}
              aria-label="Google API key"
              data-google-search-key-input
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
              data-google-search-reveal
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black text-slate-700">Search Engine ID (cx)</span>
          <input
            type="text"
            value={cx}
            onChange={(event) => { setCx(event.target.value); setResult(null); }}
            placeholder="0123456789abcdef:xxxxxxx"
            aria-label="Google Search Engine ID"
            data-google-search-cx-input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
          />
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={busy}
          data-google-search-test
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[11.5px] font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Test karo
        </button>
        <button
          type="button"
          onClick={runSave}
          disabled={busy}
          data-google-search-save
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-[11.5px] font-black text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Save karo
        </button>
        {ready ? (
          <button
            type="button"
            onClick={runRemove}
            data-google-search-remove
            aria-label="Configuration hata do"
            title="Configuration hata do"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      {result ? (
        <p
          role="status"
          data-google-search-result
          data-google-search-result-code={result.code ?? "ok"}
          className={`mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] font-semibold leading-5 ${
            result.ok ? "text-emerald-700" : ERROR_TONE[result.code ?? "unknown"]
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <KeySourceSwitch
        engine="google"
        uid={uid}
        masterAvailable={masterGoogleSearchAvailable()}
        onChoose={(source) => setGoogleSearchSource(source, uid)}
        label="Google search ki configuration"
      />

      <details className="mt-3" data-google-search-help>
        <summary className="cursor-pointer text-[11.5px] font-black text-slate-700">
          Configuration kaise banayein? (3 steps)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] font-medium leading-5 text-slate-600">
          <li>
            <a
              className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2"
              href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Custom Search API
            </a>{" "}
            kholein aur <strong>Enable</strong> karein. (Billing ki zaroorat nahi — free daily quota milta hai.)
          </li>
          <li>
            <a
              className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2"
              href={GOOGLE_SEARCH_ENGINE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Programmable Search Engine
            </a>{" "}
            banaein → <em>Search the entire web</em> → <strong>Add to the list</strong> → us engine ka{" "}
            <strong>Search Engine ID</strong> copy karein (ye <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">cx</code>{" "}
            value hai).
          </li>
          <li>
            <a
              className="font-bold text-slate-800 underline decoration-slate-300 underline-offset-2"
              href={GOOGLE_SEARCH_API_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Credentials
            </a>{" "}
            → <strong>Create credentials → API key</strong>. Key copy karein. Web ke liye{" "}
            <strong>Application restriction → Websites</strong> me origin add karein (jaise{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">https://eduvora.shop/*</code>). APK / PWA / localhost sab jagah chalana hai to restriction ko <strong>None</strong> kar do — tab har platform se search chalega.
          </li>
        </ol>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium leading-5 text-slate-500">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          Aapki key aur Search Engine ID sirf aapke browser me rehti hain — humein kahin bhejte nahi hain.
          Request seedha Google ke paas jaati hai, isliye apni hi configuration use karein.
        </p>
      </details>
    </section>
  );
}
