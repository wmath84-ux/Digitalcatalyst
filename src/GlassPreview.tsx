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
import { GlassAccordion, GlassAccordionContent, GlassAccordionItem, GlassAccordionTrigger } from "@/components/ui/glass-accordion";
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardFooter, GlassCardHeader, GlassCardTitle } from "@/components/ui/GlassCard";
import { GlassCheckbox } from "@/components/ui/glass-checkbox";
import { GlassDropdownContent, GlassDropdownItem, GlassDropdownLabel, GlassDropdownMenu, GlassDropdownTrigger } from "@/components/ui/glass-dropdown-menu";
import { GlassRadio, GlassRadioGroup } from "@/components/ui/glass-radio";
import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "@/components/ui/glass-select";
import { GlassSheet, GlassSheetClose, GlassSheetContent, GlassSheetDescription, GlassSheetTitle, GlassSheetTrigger } from "@/components/ui/glass-sheet";
import { GlassSwatch, GlassSwatchGroup } from "@/components/ui/glass-swatch";
import { GlassTile } from "@/components/ui/glass-tile";
import { GlassSwitch } from "@/components/ui/glass-switch";
import { GlassSlider } from "@/components/ui/glass-slider";
import { Popover, PopoverContent, PopoverItem, PopoverSeparator, PopoverTrigger } from "@/components/ui/glass-popover";
import { GlassToggleGroup, GlassToggleItem } from "@/components/ui/glass-toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/glass-tooltip";
import { Bell, Heart, Search, Trophy, UserRound } from "lucide-react";
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
  // Wave 3 · commerce controls are live here, so every one of them is a real
  // controlled component rather than a screenshot of one.
  const [commerceTab, setCommerceTab] = useState("overview");
  const [commerceSort, setCommerceSort] = useState("recommended");
  const [giftWrap, setGiftWrap] = useState(false);
  const [plan, setPlan] = useState("monthly");
  const [tile, setTile] = useState("notes");
  const [swatch, setSwatch] = useState("indigo");
  const [railRow, setRailRow] = useState(0);
  // Wave 5 · account + player: the recipe the profile/settings rows and the
  // course player now share.
  const [pushOn, setPushOn] = useState(true);
  const [bio, setBio] = useState("");
  const [seek, setSeek] = useState(38);
  const [sortDemo, setSortDemo] = useState("recommended");
  // Wave 4 · the learning-surface primitives (switch, slider, tile, popover).
  const [curveOn, setCurveOn] = useState(true);
  const [curve, setCurve] = useState(62);
  const [mode, setMode] = useState("recall");
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

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 3 · commerce</h2>
            <p className="text-[11px] font-semibold text-slate-400">press ⌘K / Ctrl+K — the palette is mounted app-wide</p>
          </header>

          <div className="grid gap-3 md:grid-cols-2">
            <GlassCard tint={0.55} contentClassName="p-0" className="overflow-hidden">
              <div className="relative aspect-[16/9] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500">
                <GlassCardHeader className="absolute bottom-0 w-full p-4">
                  <GlassCardTitle className="text-white">UX Research Sprint</GlassCardTitle>
                  <GlassCardDescription className="text-white/80">the card is `glass-card`; the media stays edge-to-edge</GlassCardDescription>
                </GlassCardHeader>
              </div>
              <div className="p-4">
                <GlassCardContent>
                  Cart and favourite cards use this same wrapper, so the store grid, `#/favorites` and `#/cart` share one surface.
                </GlassCardContent>
                <GlassCardFooter>
                  <LiquidMetalButton tone="primary" className="flex-1"><span className="text-[12px] font-bold">Add to cart</span></LiquidMetalButton>
                  <GlassDropdownMenu>
                    <GlassDropdownTrigger className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                      More
                    </GlassDropdownTrigger>
                    <GlassDropdownContent tint={0.92} className="dc-panel w-48">
                      <GlassDropdownLabel>Save for later</GlassDropdownLabel>
                      <GlassDropdownItem>Add to favourites</GlassDropdownItem>
                      <GlassDropdownItem>Share</GlassDropdownItem>
                    </GlassDropdownContent>
                  </GlassDropdownMenu>
                </GlassCardFooter>
              </div>
            </GlassCard>

            <div className="flex flex-col gap-3">
              <GlassToggleGroup className="dc-segment" tint={0.5} value={commerceTab} onValueChange={setCommerceTab} aria-label="Product sections">
                {["overview", "curriculum", "instructor"].map((id) => (
                  <GlassToggleItem key={id} value={id} className="px-3 py-2 text-xs font-semibold capitalize">{id}</GlassToggleItem>
                ))}
              </GlassToggleGroup>
              <p className="text-[11px] font-semibold text-slate-500">
                the store filter row and the product page tab strip are this control · selected: <strong>{commerceTab}</strong>
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <GlassSelect value={commerceSort} onValueChange={setCommerceSort}>
                  <GlassSelectTrigger aria-label="Sort" className="dc-glass-select h-9 w-auto min-w-[11rem] text-xs font-bold" />
                  <GlassSelectContent tint={0.9} className="dc-glass-select-pop" aria-label="Sort options">
                    {["recommended", "price-low", "top-rated"].map((id) => (
                      <GlassSelectItem key={id} value={id}>{id}</GlassSelectItem>
                    ))}
                  </GlassSelectContent>
                </GlassSelect>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <GlassCheckbox className="dc-choice" ariaLabel="Gift wrap" checked={giftWrap} onCheckedChange={setGiftWrap} />
                  Gift wrap
                </label>
              </div>

              <GlassRadioGroup value={plan} onValueChange={setPlan} aria-label="Plan" className="gap-2">
                {["monthly", "annual"].map((id) => (
                  <label key={id} className="flex items-center gap-2 text-xs font-bold capitalize text-slate-600">
                    <GlassRadio className="dc-choice" value={id} ariaLabel={id} />
                    {id}
                  </label>
                ))}
              </GlassRadioGroup>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                  {(["notes", "videos", "mocks"] as const).map((id) => (
                    <GlassTile key={id} className="dc-tile size-16 aspect-auto text-[10px] font-bold capitalize" selected={tile === id} onClick={() => setTile(id)}>
                      {id}
                    </GlassTile>
                  ))}
                </div>
                <GlassSwatchGroup value={swatch} onValueChange={setSwatch} aria-label="Accent">
                  {[["indigo", "#6366f1"], ["teal", "#14b8a6"], ["rose", "#f43f5e"]].map(([id, color]) => (
                    <GlassSwatch key={id} className="dc-swatch" color={color} value={id} title={id} size={26} />
                  ))}
                </GlassSwatchGroup>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <GlassAccordion defaultValue={["refund"]} tint={0.55} className="dc-panel text-slate-900" aria-label="Course FAQ">
              {[
                ["refund", "Refund window", "14 days, no questions — the accordion body animates with the pack's grid-rows transition."],
                ["certificate", "Certificate", "Issued per module completion and downloadable from your library."],
              ].map(([id, title, body]) => (
                <GlassAccordionItem key={id} value={id}>
                  <GlassAccordionTrigger className="text-sm font-bold text-slate-800">{title}</GlassAccordionTrigger>
                  <GlassAccordionContent className="text-slate-600">{body}</GlassAccordionContent>
                </GlassAccordionItem>
              ))}
            </GlassAccordion>

            <GlassSheet>
              <div className="flex h-full flex-col items-start justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white/60 p-4">
                <p className="text-xs font-semibold text-slate-500">Mobile filters and the coupon drawer are a sheet — portaled, Escape + scrim dismiss, body scroll lock.</p>
                <GlassSheetTrigger className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Open filters sheet</GlassSheetTrigger>
              </div>
              <GlassSheetContent side="right" tint={0.86} className="dc-panel text-slate-900">
                <GlassSheetTitle className="text-slate-900">Refine</GlassSheetTitle>
                <GlassSheetDescription className="text-slate-500">Same controls, drawer-shaped.</GlassSheetDescription>
                <div className="mt-4 flex gap-2">
                  <LiquidMetalButton tone="silver" className="w-28"><span className="text-xs font-bold">Reset</span></LiquidMetalButton>
                  <GlassSheetClose className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Done</GlassSheetClose>
                </div>
              </GlassSheetContent>
            </GlassSheet>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 4 · learning surfaces</h2>
            <p className="text-[11px] font-semibold text-slate-400">glass-switch · glass-slider · glass-tile · glass-popover</p>
          </header>

          <Row label="glass-switch">
            <GlassSwitch checked={curveOn} onCheckedChange={setCurveOn} ariaLabel="Curve override" />
            <span className="text-xs font-semibold text-slate-500">
              {curveOn ? "on" : "off"} — drag it: the thumb squashes along the travel and turns into a real lens while held.
              FlowPath's revision-curve row uses this exact component.
            </span>
          </Row>

          <Row label="glass-slider">
            <div className="w-full max-w-sm">
              <GlassSlider min={0} max={100} value={curve} onValueChange={setCurve} ariaLabel="Curve strength" />
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {curve}% · ← → adjust, PageUp/PageDown jump 10%, Home/End snap. Both FlowPath sliders
                (curve settings + activity progress) are this component now.
              </p>
            </div>
          </Row>

          <Row label="glass-tile">
            <div className="grid w-full max-w-md grid-cols-3 gap-1.5">
              {[
                { v: "recall", e: "🎯", t: "Recall", d: "Short-answer recall" },
                { v: "mcq", e: "🔤", t: "MCQ", d: "Four options" },
                { v: "mixed", e: "🧩", t: "Mixed", d: "Both, shuffled" },
              ].map((o) => (
                <GlassTile
                  key={o.v}
                  selected={mode === o.v}
                  onClick={() => setMode(o.v)}
                  className="dc-tile min-h-[72px] aspect-auto rounded-xl px-2 py-2 text-center"
                >
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-base">{o.e}</span>
                    <span className="text-[11px] font-extrabold leading-tight">{o.t}</span>
                    <span className="text-[9px] font-medium leading-tight text-slate-500">{o.d}</span>
                  </span>
                </GlassTile>
              ))}
            </div>
          </Row>

          <Row label="glass-popover">
            <Popover>
              <PopoverTrigger className="rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-white">
                Add to day
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" tint={0.8}>
                <PopoverItem className="text-slate-700 hover:bg-slate-900/5" onClick={() => { setMode("recall"); }}>
                  Revision session
                </PopoverItem>
                <PopoverItem className="text-slate-700 hover:bg-slate-900/5" onClick={() => setMode("mcq")}>
                  Practice questions
                </PopoverItem>
                <PopoverSeparator className="bg-slate-900/10" />
                <PopoverItem className="text-slate-700 hover:bg-slate-900/5" onClick={() => setMode("mixed")}>
                  Note
                </PopoverItem>
              </PopoverContent>
            </Popover>
            <p className="max-w-md text-[11px] font-semibold text-slate-500">
              Portalled and fixed-positioned, so no ancestor clips it; it re-places on scroll and closes on outside
              mousedown or Escape. The item ink is overridden for the light page (the pack ships dark-first). My Day's
              Create menu keeps its pinned drop-up geometry instead of this.
            </p>
          </Row>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 5 · account &amp; player</h2>
            <p className="text-[11px] font-semibold text-slate-400">the exact recipes profile, settings, search and #/course/:id use</p>
          </header>

          <Row label="preference row">
            <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                <Bell className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-bold text-slate-900">Push notifications</span>
              <GlassSwitch checked={pushOn} onCheckedChange={setPushOn} ariaLabel="Push notifications" className="dc-switch shrink-0" />
            </div>
          </Row>

          <Row label="form field">
            <div className="w-full max-w-sm">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">Bio</span>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 240))}
                placeholder="Tell learners about yourself"
                className="dc-field w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                `glass-input` is the pack’s search pill (radius 9999, no textarea twin), so profile fields take the
                same frost as a `.dc-field` class instead of the wrong anatomy.
              </p>
            </div>
          </Row>

          <Row label="listbox">
            <GlassSelect value={sortDemo} onValueChange={setSortDemo}>
              <GlassSelectTrigger aria-label="Sort results" className="dc-glass-select h-9 min-w-[11rem] text-xs font-bold" />
              <GlassSelectContent tint={0.9} className="dc-glass-select-pop" aria-label="Sort options">
                {["recommended", "newest", "price-low", "rating"].map((v) => (
                  <GlassSelectItem key={v} value={v}>{v}</GlassSelectItem>
                ))}
              </GlassSelectContent>
            </GlassSelect>
            <p className="max-w-xs text-[11px] font-semibold text-slate-500">
              Every remaining native select outside admin — FlowPath’s editor, the model picker, search sort, the
              renewal preview — renders this listbox now.
            </p>
          </Row>

          <Row label="seek bar">
            <div className="w-full max-w-sm rounded-2xl bg-slate-950 p-3">
              <GlassSlider min={0} max={180} value={seek} onValueChange={setSeek} ariaLabel="Audio seek" className="dc-slider-on-dark dc-slider-violet w-full" />
              <p className="mt-1 text-[10px] font-bold tabular-nums text-white/60">
                {Math.floor(seek / 60)}:{String(seek % 60).padStart(2, "0")} / 3:00 — the course player’s audio transport
              </p>
            </div>
          </Row>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Wave 6 · hero pills &amp; checkout</h2>
            <p className="text-[11px] font-semibold text-slate-400">identity stays, the gloss is added on top</p>
          </header>

          <Row label="home pills">
            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-700 px-3 py-2.5">
              {(["trophy", "user", "bell", "heart"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Hero ${k}`}
                  className="dc-home-pill grid h-9 w-9 place-items-center rounded-xl border border-white/35 bg-white/16 text-white backdrop-blur-md transition hover:bg-white/24 active:scale-90"
                >
                  {k === "trophy" ? <Trophy className="h-4 w-4" /> : k === "user" ? <UserRound className="h-4 w-4" /> : k === "bell" ? <Bell className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                </button>
              ))}
            </div>
            <p className="max-w-xs text-[11px] font-semibold text-slate-500">
              `#/home` used to hand-paint these four pills (the same border + fill + shadow typed out four times).
              `.dc-home-pill` carries the rim and the top highlight instead, so the pack keeps its press behaviour
              and the hero keeps its depth.
            </p>
          </Row>

          <Row label="pay CTA">
            <div className="w-full max-w-sm">
              <button
                type="button"
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-lg transition active:scale-[0.98]"
              >
                <GlassSurface tint={0.7} radius={16} className="pointer-events-none absolute inset-0" />
                <span className="relative z-10 flex items-center gap-2">Pay securely — &#8377;1,499</span>
              </button>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Checkout's money button keeps its solid emerald — the frost sits *behind* the label, never under it.
                The amount card above it gets a rim only (`.dc-quote`) for the same reason.
              </p>
            </div>
          </Row>

          <Row label="flowpath light">
            <div className="w-full max-w-sm rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <GlassSlider min={0} max={100} value={curve} onValueChange={setCurve} ariaLabel="Curve strength (light canvas)" className="w-full" />
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Wave 6 removed `dc-slider-on-dark` from FlowPath: `useTheme` already writes `data-theme` on
                `&lt;html&gt;`, so the slider follows the theme the user picked — this is the same control on a light
                canvas, which the forced rule used to break.
              </p>
            </div>
          </Row>
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
