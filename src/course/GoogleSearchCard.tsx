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
import { Activity, CheckCircle2, Eye, EyeOff, Loader2, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import GoogleGlyph from "./GoogleGlyph";
import {
  clearGoogleSearchConfig,
  diagnoseGoogleSearch,
  googleSearchConfig,
  googleSearchOwnerConfigured,
  masterGoogleSearchAvailable,
  resetGoogleSearchPathMemory,
  saveGoogleSearchConfig,
  setGoogleSearchSource,
  subscribeGoogleSearchConfig,
  testGoogleSearchConfig,
  type GoogleSearchDiagnosis,
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
  "ip-blocked": "text-amber-700",
  permission: "text-amber-700",
  "proxy-unavailable": "text-slate-600",
  network: "text-rose-700",
  unknown: "text-rose-700",
};

/** Where a value came from, in the learner's own words. */
const SLOT_WORDS: Record<string, string> = {
  account: "aapke account ki slot (isi browser me save)",
  device: "is browser ki device-wide slot",
  build: "BUILD me baked school/owner ki key (VITE_GOOGLE_SEARCH_API_KEY)",
  none: "kahin se nahi",
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
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<GoogleSearchDiagnosis | null>(null);

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
    setDiagnosis(null);
    setResult({ ok: true, code: null, message: "Configuration save ho gayi — Google search ab chalu hai." });
    toast({ title: "Google search connected", variant: "success" });
    onChanged?.(true);
  }, [apiKey, cx, uid, onChanged]);

  /**
   * The honest check: WHICH key is in effect, from WHICH slot, and what Google
   * answers to that key on BOTH paths — the browser's own call and the same
   * call through the app's server. A refusal that only happens in the browser
   * is a key restriction; a refusal on both paths is the key/engine itself.
   * That distinction is the whole fix for "restriction None kar diya, phir bhi
   * wahi error".
   */
  const runDiagnose = useCallback(async () => {
    setDiagnosing(true);
    try {
      // Start from a clean slate: a key the browser path was refused for is
      // remembered, and a diagnosis must measure both paths afresh.
      resetGoogleSearchPathMemory();
      const report = await diagnoseGoogleSearch(uid, undefined, apiKey.trim(), cx.trim());
      setDiagnosis(report);
      if (report.usable) toast({ title: "Google search chal sakta hai", variant: "success" });
    } finally {
      setDiagnosing(false);
    }
  }, [apiKey, cx, uid]);

  const runRemove = useCallback(() => {
    clearGoogleSearchConfig(uid);
    setApiKey("");
    setCx("");
    setResult(null);
    setDiagnosis(null);
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
              onChange={(event) => { setApiKey(event.target.value); setResult(null); setDiagnosis(null); }}
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
            onChange={(event) => { setCx(event.target.value); setResult(null); setDiagnosis(null); }}
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
          onClick={() => void runDiagnose()}
          disabled={busy || diagnosing}
          data-google-search-diagnose
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[11.5px] font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {diagnosing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          Diagnose karo
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

      {diagnosis ? (
        <div
          className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          data-google-search-diagnosis
          data-google-search-diagnosis-usable={diagnosis.usable ? "yes" : "no"}
        >
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500" data-google-search-keyinfo>
            Abhi search is key se chalti hai:{" "}
            <span className="font-mono text-[11px] text-slate-900">{diagnosis.config.fingerprint || "—"}</span>{" "}
            <span className="font-semibold normal-case text-slate-500">
              · {diagnosis.config.origin === "master" ? "school/owner ki" : "aapki"} · {SLOT_WORDS[diagnosis.config.slot] || diagnosis.config.slot}
              {diagnosis.config.handover
                ? ` · handover: ${diagnosis.config.handover.fingerprint}`
                : ""}
            </span>
          </p>
          <p
            className={`mt-1.5 text-[11.5px] font-bold leading-5 ${diagnosis.usable ? "text-emerald-700" : "text-rose-700"}`}
            data-google-search-verdict
          >
            {diagnosis.verdict}
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {([["direct", diagnosis.direct], ["server", diagnosis.server]] as const).map(([label, probe]) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                data-google-search-probe={label}
                data-google-search-probe-ok={probe.ok ? "yes" : "no"}
              >
                <p className="text-[10.5px] font-black uppercase tracking-wide text-slate-500">
                  {label === "direct" ? "Browser se seedha Google" : "App ke server ke through"}{" "}
                  <span className={probe.ok ? "text-emerald-600" : "text-rose-600"}>
                    {probe.ok ? "✓ chalu" : `✗ ${probe.code || "fail"}`}
                  </span>
                  {probe.ms ? <span className="font-semibold text-slate-400"> · {probe.ms}ms</span> : null}
                </p>
                {!probe.ok && probe.googleMessage ? (
                  <p className="mt-1 break-words text-[10.5px] font-medium leading-4 text-slate-600" data-google-search-google-message>
                    Google ka apna message{probe.googleStatus ? ` (HTTP ${probe.googleStatus}${probe.googleReason ? ` · ${probe.googleReason}` : ""})` : ""}: “{probe.googleMessage}”
                  </p>
                ) : null}
                {!probe.ok && !probe.googleMessage ? (
                  <p className="mt-1 text-[10.5px] font-medium leading-4 text-slate-600">{probe.message}</p>
                ) : null}
              </div>
            ))}
          </div>
          {diagnosis.steps.length ? (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] font-medium leading-5 text-slate-600" data-google-search-steps>
              {diagnosis.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          <p className="mt-2 text-[10.5px] font-medium leading-4 text-slate-500">
            Server path ka matlab: request app ke apne server se Google jaati hai, isliye browser ka origin/referer beech me nahi aata —
            key par “Websites” restriction ho ya na ho, search chalti rehti hai (APK, PWA, localhost, preview domain — sab par).
          </p>
        </div>
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
            → <strong>Create credentials → API key</strong>. Key copy karein. Restriction me{" "}
            <strong>None</strong> sabse aasan hai (APK / PWA / localhost / preview domain — sab chal jaate hain);{" "}
            <strong>Websites</strong> chunna ho to har origin add karein (jaise{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10.5px]">https://eduvora.shop/*</code>). Save ke baad Google ko{" "}
            <strong>1–5 minute</strong> lagte hain — turant test karne par purana 403 hi aayega. Agar restriction theek karne ke baad bhi error aaye to{" "}
            <strong>“Diagnose karo”</strong> dabaiye: wo batata hai ki kaunsi key (aapki ya build ki) fail ho rahi hai aur Google ka apna message kya hai.
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
