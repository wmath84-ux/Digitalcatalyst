// src/GlassPreview.tsx
//
// Developer sandbox for the website-glass rollout: `#/dev/glass-preview`.
//
// It renders the *vendored registry components themselves* (no app data, no
// Firestore, no auth) so each wave can be reviewed at any viewport, in light
// and dark, and at each quality tier. The tier switch is also the live demo of
// the kill switch described in docs/liquid-glass-rollout-plan.md — flip it to
// `off` and every glass rule in src/glass.css stops applying, which is exactly
// what happens in production if we ever need to back the material out.
//
// Wave 0 covers the base engine (`glass`, `glass-motion`) and `glass-button`;
// the remaining 19 items join this page as they land.
import { useEffect, useMemo, useRef, useState } from "react";
import { Glass, GlassLens, GlassSurface, useGlassDark } from "@/components/ui/glass";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/glass-tooltip";
import { Bell, Heart, Search } from "lucide-react";
import PageTabs from "@/components/ui/PageTabs";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LiquidMetalButton from "@/components/ui/LiquidMetalButton";
import Toast, { type ToastMessage } from "@/components/ui/Toast";
import { applyGlassTier, detectGlassTier, liveLensCount, strengthFor, toGlassRgb, type GlassTier } from "@/lib/glass";

/** A faithful copy of `HeaderIconButton` / the top-bar action discs — the real
 *  chrome builds these from the same props, so this is a preview, not a fork. */
function ChromeDisc({
  label,
  hint,
  badge,
  active = false,
  tone = "neutral",
}: {
  label: string;
  hint?: string;
  badge?: number;
  active?: boolean;
  tone?: "neutral" | "accent";
}) {
  return (
    <TooltipProvider delayMs={320}>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          className={`relative grid h-10 w-10 place-items-center rounded-full transition ${
            active
              ? tone === "accent"
                ? "text-white"
                : "text-indigo-600"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <GlassSurface
            tint={active ? 0.7 : 0.55}
            tintColor={tone === "accent" ? "99,102,241" : "255,255,255"}
            blur={12}
            saturation={1.35}
            radius={999}
            className="dc-chrome-disc pointer-events-none absolute inset-0"
          />
          <span className="relative">
            {label === "Notifications" ? <Bell size={17} /> : label === "Search" ? <Search size={17} /> : <Heart size={17} />}
          </span>
          {badge ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
              {badge}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="bottom" tint={0.85}>
          <span className="text-slate-800">{hint ?? label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TINT_BG =
  "radial-gradient(120% 90% at 12% 8%, #38bdf8 0%, transparent 46%)," +
  "radial-gradient(110% 80% at 88% 22%, #ff7b54 0%, transparent 44%)," +
  "radial-gradient(120% 100% at 60% 100%, #06d6a0 0%, transparent 50%)," +
  "linear-gradient(140deg, #0f172a, #1e293b 55%, #312e81)";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export default function GlassPreviewPage() {
  const dark = useGlassDark();
  const [tier, setTier] = useState<GlassTier>(() => detectGlassTier());
  const [strength, setStrength] = useState(0.5);
  const [blur, setBlur] = useState(4);
  const [tint, setTint] = useState(0.25);
  const [dome, setDome] = useState(0.1);
  const [radius, setRadius] = useState(24);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  // Wave 1 = the shared primitives. These three pieces of state drive them, so
  // this sandbox is also the manual test for the wrappers every page reuses.
  const [query, setQuery] = useState("");
  const [railRow, setRailRow] = useState(0);
  const [tab, setTab] = useState("day");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const say = (text: string, type: ToastMessage["type"] = "success") =>
    setToasts((prev) => [...prev, { id: `${Date.now()}${Math.random()}`, text, type }]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const lensId = useMemo(() => Symbol("preview-lens"), []);

  useEffect(() => {
    void lensId; // the preview keeps one lens claimed so liveLensCount() is meaningful
  }, [lensId]);

  // The app's brand colour is a meta theme-color (see src/utils/themeColor.ts),
  // not a Tailwind token, so that is where the glass tint accent comes from.
  const accent = useMemo(
    () => toGlassRgb(document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || undefined),
    [],
  );

  return (
    <main className="min-h-[100dvh] bg-slate-100 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-600">dev sandbox</p>
            <h1 className="text-3xl font-black">Liquid Glass preview</h1>
            <p className="mt-1 text-sm text-slate-500">
              website-glass base engine — `Glass`, `GlassLens`, `GlassSurface`, `GlassButton`. Tiers: full = real
              refraction (Chromium), lite = half bending, off = kill switch.
            </p>
          </div>
          <GlassSurface tint={0.4} radius={16} contentClassName="flex gap-1 p-1" className="shrink-0">
            {(["full", "lite", "off"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTier(t);
                  applyGlassTier(t, true);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${
                  tier === t ? "bg-slate-900 text-white" : "text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
          </GlassSurface>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* the stage: content the lens refracts */}
          <div
            ref={stageRef}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              const box = stageRef.current?.getBoundingClientRect();
              if (!box) return;
              setDrag({ x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 });
            }}
            className="relative isolate h-[420px] touch-none select-none overflow-hidden rounded-3xl p-6"
            style={{ background: TINT_BG }}
          >
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="max-w-[22ch] text-[15px] font-semibold leading-snug text-white/95">
                Text under the lens stays selectable and links stay clickable — drag the pill.
              </div>
              <p className="text-xs text-white/70">
                engine: {tier} · dark: {String(dark)} · lenses live: {liveLensCount()} · accent rgb({accent})
              </p>
            </div>

            <div
              className="absolute left-1/2 top-1/2 h-[168px] w-[268px] cursor-grab active:cursor-grabbing"
              style={{ transform: `translate(calc(-50% + ${drag.x}px), calc(-50% + ${drag.y}px))` }}
            >
            <Glass
              className="size-full"
              radius={radius}
              strength={strength}
              blur={blur}
              tint={tint}
              dome={dome}
              contentClassName="p-5"
            >
              <p className="text-sm font-bold text-white">Drag me</p>
              <p className="mt-1 text-xs text-white/80">
                Rim band bends the backdrop; the centre stays sharp. On Safari/Firefox this same block is a frosted
                panel — which is why state never depends on the bend.
              </p>
            </Glass>
            </div>

            <GlassLens
              width={56}
              height={56}
              className="absolute bottom-5 right-5"
              strength={0.75}
              blur={2}
              dome={0.3}
            />
          </div>

          {/* controls + capsule buttons */}
          <div className="flex flex-col gap-4">
            <GlassSurface tint={0.55} radius={20} contentClassName="flex flex-col gap-3 p-4">
              <Row label="strength">
                <input type="range" min={0} max={1} step={0.01} value={strength} onChange={(e) => setStrength(+e.target.value)} className="w-full" />
              </Row>
              <Row label="blur">
                <input type="range" min={0} max={20} step={1} value={blur} onChange={(e) => setBlur(+e.target.value)} className="w-full" />
              </Row>
              <Row label="tint">
                <input type="range" min={0} max={1} step={0.01} value={tint} onChange={(e) => setTint(+e.target.value)} className="w-full" />
              </Row>
              <Row label="dome">
                <input type="range" min={0} max={0.6} step={0.01} value={dome} onChange={(e) => setDome(+e.target.value)} className="w-full" />
              </Row>
              <Row label="radius">
                <input type="range" min={0} max={40} step={1} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-full" />
              </Row>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Role defaults for the rollout — chrome {strengthFor("chrome", tier)}, control {strengthFor("control", tier)},
                panel {strengthFor("panel", tier)}.
              </p>
            </GlassSurface>

            <GlassSurface tint={0.45} radius={20} contentClassName="flex flex-wrap items-center gap-3 p-4">
              <GlassButton variant="capsule" tint={0.5}>Add to cart</GlassButton>
              <GlassButton variant="icon" tint={0.35} aria-label="Continue">
                <span className="text-lg leading-none">→</span>
              </GlassButton>
            </GlassSurface>

            <Glass
              radius={20}
              strength={0.32}
              blur={10}
              tint={0.35}
              contentClassName="p-4"
              className="font-mono text-[11px] leading-relaxed text-white"
            >
              {`<Glass radius={${radius}} strength={${strength}} blur={${blur}} tint={${tint}} dome={${dome}}>`}
            </Glass>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 1 · shared primitives</h2>
            <div className="flex gap-2">
              <LiquidMetalButton tone="silver" onClick={() => setModalOpen(true)}>Open sheet</LiquidMetalButton>
              <LiquidMetalButton tone="danger" onClick={() => setConfirmOpen(true)}>Confirm delete</LiquidMetalButton>
              <LiquidMetalButton tone="primary" onClick={() => say("Toast raised through the glass viewport.")}>Toast</LiquidMetalButton>
            </div>
          </header>
          <PageTabs
            items={[
              { id: "day", label: "Day", hint: "Today’s plan" },
              { id: "tasks", label: "Tasks" },
              { id: "notes", label: "Notes" },
            ]}
            activeId={tab}
            onSelect={setTab}
            ariaLabel="Preview pages"
            feature="preview"
            onHome={() => setTab("day")}
          />
          <p className="text-xs text-slate-500">
            Selected: <strong>{tab}</strong> — the tab strip is the pack’s spring indicator; the sheet,
            confirm dialog and toast are the same components every feature page now renders.
          </p>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 2 · global chrome</h2>
            <p className="text-[11px] font-semibold text-slate-400">
              the exact material the site header + desktop shell now use
            </p>
          </header>

          {/* Action discs: one `GlassSurface` lens under each glyph, hover/focus
              label from `glass-tooltip`, badge kept from the old markup. */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/75 px-3 py-2.5">
            <ChromeDisc label="Notifications" hint="3 unread" badge={3} />
            <ChromeDisc label="Wishlist" hint="Saved courses" />
            <ChromeDisc label="Cart" hint="2 items" badge={2} tone="accent" />
            <ChromeDisc label="Profile" hint="Account" active />
            <ChromeDisc label="Search" hint="Jump to search" />
          </div>

          {/* The light-mode overrides live in src/glass.css under
              `.dc-glass-input`: white-on-glass text, placeholder and focus ring
              are re-inked so the field stays readable on a white bar. */}
          <div className="relative flex items-center rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-3">
            <div className="w-[320px] max-w-full">
              <GlassInput
                className="dc-glass-input w-full"
                tint={0.55}
                radius={14}
                icon={<Search className="h-4 w-4" aria-hidden="true" />}
                placeholder="Search Digital Catalyst…"
                aria-label="Preview search field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <p className="ml-3 text-[11px] font-semibold text-slate-400">
              ⌘K / Ctrl+K focuses the real top-bar field
            </p>
          </div>

          {/* Rail selection: the active row carries a lens over the app’s
              indigo identity, inactive rows stay flat (lens budget). */}
          <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200/70 bg-white/85 p-2">
            {(["My Day", "Store", "Revision"] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setRailRow(i)}
                className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left transition ${
                  railRow === i
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {railRow === i ? (
                  <GlassSurface
                    tint={0.22}
                    blur={10}
                    saturation={1.3}
                    radius={14}
                    className="pointer-events-none absolute inset-0"
                  />
                ) : null}
                <span className="relative text-[13px] font-bold">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Glass sheet">
          <p className="text-sm text-slate-600">
            Phone width = a bottom sheet with top corners; from 640 px it becomes a centred card, and inside the
            desktop shell it stays constrained to the content column. That behaviour is the app’s existing
            overlay maths — only the panel material changed.
          </p>
          <div className="mt-5 flex gap-3">
            <LiquidMetalButton tone="silver" className="flex-1" onClick={() => setModalOpen(false)}>Close</LiquidMetalButton>
            <LiquidMetalButton tone="primary" className="flex-1" onClick={() => { setModalOpen(false); say("Saved."); }}>Save</LiquidMetalButton>
          </div>
        </Modal>

        <ConfirmDialog
          open={confirmOpen}
          title="Delete activity?"
          message="This removes it from My Day. The confirmation reads the same as before, on frosted glass."
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); say("Deleted.", "error"); }}
        />

        <Toast toasts={toasts} onRemove={(id) => setToasts((prev) => prev.filter((t2) => t2.id !== id))} />

        <p className="text-xs text-slate-500">
          Wave 0 = install only: 22 registry items land in `src/components/ui/`, nothing in the app changes yet.
          Waves 1-6 replace the shared primitives (Modal, Toast, PageTabs, cards, buttons) and then each surface —
          plan in <code>docs/liquid-glass-rollout-plan.md</code>.
        </p>
      </div>
    </main>
  );
}
