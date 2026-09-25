// src/nature3d/SanctuarySettings.tsx
//
// THE FULL-SCREEN SETTINGS PANEL.
//
// The bottom tray's fifth button used to open a ⋮ dropdown; it is now a gear
// that opens THIS — one full-screen sheet, laid out the way a battle-royale
// settings screen is laid out (the design language the owner asked for):
//
//   • a dark charcoal plate with a single orange accent and nothing else,
//   • a tab strip across the top for the categories (Graphics / Light /
//     Boards / Views), the active tab underlined in orange,
//   • inside a tab, grouped rows: LABEL on the left, the control on the
//     right — toggles, segmented pickers, sliders, and 2×2 cards for the
//     graphics presets,
//   • read-only rows for the live device numbers (tier, resolution, fps),
//   • and a pinned action bar at the bottom: RESET DEFAULTS + CLOSE.
//
// It is a React island over an imperative engine: the engine owns the scene,
// this file owns the chrome. Every control here calls a real engine method —
// nothing in this panel is decoration, because a settings row that changes
// only React state is a lie the learner pays for.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Cpu,
  Gauge,
  Monitor,
  RotateCw,
  Rows3,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { Sanctuary, ViewPreset } from "./engine/scene";
import { QUALITY_PROFILES, type QualityProfile } from "./engine/quality";
import type { DaylightMode } from "./engine/daylight";

const WIND_STEPS = [
  { label: "Calm", mult: 0.45 },
  { label: "Breeze", mult: 1 },
  { label: "Gusty", mult: 2.2 },
];

/** The four graphics styles, in the preset vocabulary of the genre. */
const PROFILES: QualityProfile[] = ["smooth", "balanced", "hd", "hdr"];

const FRAME_CAPS = [30, 60, 0] as const;

const BOARD_SCALES = [
  { value: 1, label: "1×" },
  { value: 1.5, label: "1.5×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
];

type TabKey = "graphics" | "light" | "boards" | "views";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "graphics", label: "Graphics" },
  { key: "light", label: "Light" },
  { key: "boards", label: "Boards" },
  { key: "views", label: "Views" },
];

/** One picker entry — the page owns these lists, the panel only draws them. */
export interface SettingsOption<T extends string = ViewPreset> {
  key: T;
  label: string;
  Icon: LucideIcon;
}

export interface SanctuarySettingsProps {
  open: boolean;
  onClose: () => void;
  engine: Sanctuary | null;
  boardViews: Array<SettingsOption>;
  presets: Array<SettingsOption>;
  daylightModes: Array<{ key: DaylightMode; label: string }>;
  /** Live stats from the engine's onStats callback (fps / tier / draws). */
  stats: { fps: number; tier: string; pixelRatio: number; draws: number } | null;
  daylight: DaylightMode;
  onDaylight: (mode: DaylightMode) => void;
  clockHour: number;
  iceAge: boolean;
  onIceAge: (on: boolean) => void;
  windIdx: number;
  onWindStep: (idx: number) => void;
  autoOrbit: boolean;
  onAutoOrbit: (on: boolean) => void;
  activeBoard: ViewPreset | null;
  onBoard: (preset: ViewPreset) => void;
  onView: (preset: ViewPreset) => void;
  boardScale: number;
  onBoardScale: (scale: number) => void;
  immersive: boolean;
  onFullscreen: () => void;
  onHideTray: () => void;
  onExit: () => void;
}

export default function SanctuarySettings(props: SanctuarySettingsProps) {
  const {
    open, onClose, engine, stats,
    boardViews, presets, daylightModes,
    daylight, onDaylight, clockHour,
    iceAge, onIceAge,
    windIdx, onWindStep,
    autoOrbit, onAutoOrbit,
    activeBoard, onBoard, onView,
    boardScale, onBoardScale,
    immersive, onFullscreen, onHideTray, onExit,
  } = props;

  const [tab, setTab] = useState<TabKey>("graphics");
  // The engine owns these four; they are read once when the sheet opens so the
  // panel shows what is ACTUALLY running (a selected style that does not match
  // the renderer is the classic settings-screen lie).
  const [profile, setProfile] = useState<QualityProfile>("balanced");
  const [frameCap, setFrameCap] = useState(0);
  const [shadows, setShadows] = useState(true);
  const [shadowsAvailable, setShadowsAvailable] = useState(true);
  const [brightness, setBrightness] = useState(1);

  useEffect(() => {
    if (!open || !engine) return;
    setProfile(engine.getQualityProfile());
    setFrameCap(engine.getFrameCap());
    setShadows(engine.getShadows());
    setShadowsAvailable(engine.shadowsAvailable);
    setBrightness(engine.getBrightness());
  }, [open, engine]);

  // Esc closes the sheet — the one key every settings screen honours.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const applyProfile = useCallback((next: QualityProfile) => {
    setProfile(next);
    engine?.setQualityProfile(next);
  }, [engine]);

  const applyFrameCap = useCallback((next: number) => {
    setFrameCap(next);
    engine?.setFrameCap(next);
  }, [engine]);

  const applyShadows = useCallback((next: boolean) => {
    setShadows(next);
    engine?.setShadows(next);
  }, [engine]);

  const applyBrightness = useCallback((next: number) => {
    setBrightness(next);
    engine?.setBrightness(next);
  }, [engine]);

  const resetDefaults = useCallback(() => {
    applyProfile(engine?.getDefaultProfile() ?? "balanced");
    applyFrameCap(0);
    applyShadows(true);
    applyBrightness(1);
    onDaylight("auto");
    onIceAge(false);
    onWindStep(1);
    onAutoOrbit(false);
  }, [applyProfile, applyFrameCap, applyShadows, applyBrightness, onDaylight, onIceAge, onWindStep, onAutoOrbit, engine]);

  const deviceRows = useMemo(() => ([
    { label: "Quality tier", value: stats?.tier ?? "—" },
    { label: "Render resolution", value: stats ? `${(stats.pixelRatio).toFixed(2)}×` : "—" },
    { label: "Frame rate", value: stats ? `${Math.round(stats.fps)} fps` : "—" },
    { label: "Draw calls", value: stats ? String(stats.draws) : "—" },
  ]), [stats]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[100] flex flex-col bg-[#0e1116] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Sanctuary settings"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#12161d] px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="grid h-9 w-9 place-items-center rounded-sm border border-white/15 bg-white/[0.04] text-white/80 transition hover:border-[#ff8a1f]/60 hover:text-[#ff8a1f]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Settings</h2>
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
            Morning Nature Sanctuary
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-[#ff8a1f]/40 bg-[#ff8a1f]/12 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#ffb066]">
          <Cpu className="h-3 w-3" />
          {stats?.tier ?? "—"}
        </span>
      </header>

      {/* ── Tab strip ───────────────────────────────────────────────── */}
      <nav className="flex gap-0 overflow-x-auto border-b border-white/10 bg-[#12161d] px-2 sm:px-5" role="tablist">
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`relative shrink-0 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] transition sm:px-4 ${
                active ? "text-[#ff8a1f]" : "text-white/45 hover:text-white/80"
              }`}
            >
              {label}
              <span
                className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-sm ${active ? "bg-[#ff8a1f]" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </nav>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {tab === "graphics" ? (
          <div className="mx-auto max-w-3xl space-y-6">
            <Group title="Graphics style" hint="Resolution the renderer may climb to">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROFILES.map((key) => {
                  const p = QUALITY_PROFILES[key];
                  const active = profile === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyProfile(key)}
                      aria-pressed={active}
                      className={`rounded-sm border px-3 py-3 text-left transition ${
                        active
                          ? "border-[#ff8a1f] bg-[#ff8a1f]/15 shadow-[0_0_18px_rgba(255,138,31,0.18)]"
                          : "border-white/12 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      <span className={`block text-[12px] font-black uppercase tracking-[0.12em] ${active ? "text-[#ffb066]" : "text-white/85"}`}>
                        {p.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide text-white/40">
                        {p.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Group>

            <Group title="Frame rate" hint="How often the scene is drawn">
              <Segmented
                options={FRAME_CAPS.map((c) => ({ value: c, label: c === 0 ? "Unlimited" : `${c} fps` }))}
                value={frameCap}
                onChange={applyFrameCap}
              />
            </Group>

            <Group title="Shadows" hint={shadowsAvailable ? "Recompiles shaders when changed" : "Not available on this device"}>
              <Toggle
                on={shadows && shadowsAvailable}
                disabled={!shadowsAvailable}
                onChange={applyShadows}
                label="Shadows"
              />
            </Group>

            <Group title="Auto 360° orbit" hint="Slowly turn the camera when idle">
              <Toggle on={autoOrbit} onChange={onAutoOrbit} label="Auto orbit" />
            </Group>

            <Group title="Device" hint="Live measurements from the engine">
              <div className="divide-y divide-white/5 rounded-sm border border-white/10 bg-white/[0.02]">
                {deviceRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">{row.label}</span>
                    <span className="font-mono text-[11px] font-bold text-white/85">{row.value}</span>
                  </div>
                ))}
              </div>
            </Group>
          </div>
        ) : null}

        {tab === "light" ? (
          <div className="mx-auto max-w-3xl space-y-6">
            <Group title="Time of day" hint="Auto follows your device clock">
              <Segmented
                options={daylightModes.map((m) => ({ value: m.key, label: m.label }))}
                value={daylight}
                onChange={onDaylight}
              />
              {daylight === "auto" ? (
                <p className="mt-2 px-1 font-mono text-[10px] font-bold text-[#ffb066]">
                  {String(Math.floor(clockHour)).padStart(2, "0")}:
                  {String(Math.floor((clockHour % 1) * 60)).padStart(2, "0")} · following your clock
                </p>
              ) : null}
            </Group>

            <Group title="Brightness" hint={`${Math.round(brightness * 100)}% of the daylight grade`}>
              <div className="flex items-center gap-3">
                <Sun className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  type="range"
                  min={0.75}
                  max={1.25}
                  step={0.05}
                  value={brightness}
                  onChange={(e) => applyBrightness(Number(e.target.value))}
                  aria-label="Brightness"
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#ff8a1f]"
                />
                <span className="w-12 shrink-0 text-right font-mono text-[11px] font-bold text-white/85">
                  {Math.round(brightness * 100)}%
                </span>
              </div>
            </Group>

            <Group title="Ice Age" hint="Frozen world · drifting snow · frosted boards">
              <Toggle on={iceAge} onChange={onIceAge} label="Ice Age" />
            </Group>

            <Group title="Wind strength" hint="How hard the grass and canopies move">
              <Segmented
                options={WIND_STEPS.map((w, i) => ({ value: i, label: w.label }))}
                value={windIdx}
                onChange={onWindStep}
              />
            </Group>
          </div>
        ) : null}

        {tab === "boards" ? (
          <div className="mx-auto max-w-3xl space-y-6">
            <Group title="Study boards" hint="Desk shows all three · flying to a board never restarts its video">
              <div className="grid gap-2 sm:grid-cols-3">
                {boardViews.map(({ key, label, Icon }) => {
                  const active = activeBoard === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onBoard(key);
                        onClose();
                      }}
                      className={`flex items-center gap-2.5 rounded-sm border px-3 py-3 text-left transition ${
                        active
                          ? "border-[#ff8a1f] bg-[#ff8a1f]/15"
                          : "border-white/12 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#ffb066]" : "text-white/50"}`} />
                      <span className={`text-[12px] font-black uppercase tracking-[0.12em] ${active ? "text-[#ffb066]" : "text-white/85"}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Group>

            <Group title="Board size" hint="The camera re-frames to fit the new size">
              <Segmented
                options={BOARD_SCALES.map((s) => ({ value: s.value, label: s.label }))}
                value={boardScale}
                onChange={onBoardScale}
              />
            </Group>

          </div>
        ) : null}

        {tab === "views" ? (
          <div className="mx-auto max-w-3xl space-y-6">
            <Group title="Viewpoints" hint="Fly the camera around the island">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {presets.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onView(key);
                      onClose();
                    }}
                    className="flex items-center gap-2 rounded-sm border border-white/12 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-[#ff8a1f]/50"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-white/45" />
                    <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/80">{label}</span>
                  </button>
                ))}
              </div>
            </Group>

            <Group title="Display" hint="Chrome and orientation">
              <div className="divide-y divide-white/5 rounded-sm border border-white/10 bg-white/[0.02]">
                <SheetRow
                  Icon={Monitor}
                  label="Full screen"
                  right={immersive ? "On" : "Off"}
                  onClick={() => {
                    onFullscreen();
                    onClose();
                  }}
                />
                <SheetRow
                  Icon={Rows3}
                  label="Bottom tray"
                  right="Hide"
                  onClick={() => {
                    onHideTray();
                    onClose();
                  }}
                />
              </div>
            </Group>

            <Group title="Session" hint="Leaving the sanctuary">
              <div className="rounded-sm border border-white/10 bg-white/[0.02]">
                <SheetRow Icon={Sparkles} label="Back to Digital Catalyst" danger onClick={onExit} />
              </div>
            </Group>
          </div>
        ) : null}
      </div>

      {/* ── Pinned action bar ───────────────────────────────────────── */}
      <footer className="flex items-center gap-2 border-t border-white/10 bg-[#12161d] px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={resetDefaults}
          className="flex items-center gap-2 rounded-sm border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Reset defaults
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex items-center gap-2 rounded-sm bg-[#ff8a1f] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#1a1206] transition hover:bg-[#ffa04d]"
        >
          <Gauge className="h-3.5 w-3.5" />
          Close
        </button>
      </footer>
    </div>
  );
}

/* ── Presentational building blocks ─────────────────────────────────── */

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-0.5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffb066]">{title}</h3>
        {hint ? <span className="truncate text-[9px] font-bold uppercase tracking-wide text-white/30">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`min-w-[4.5rem] rounded-sm border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${
              active
                ? "border-[#ff8a1f] bg-[#ff8a1f] text-[#1a1206]"
                : "border-white/12 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  disabled = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center justify-between rounded-sm border px-3 py-3 transition ${
        disabled
          ? "cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50"
          : "border-white/12 bg-white/[0.03] hover:border-white/25"
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{label}</span>
      <span
        className={`relative h-5 w-10 shrink-0 rounded-full transition ${on ? "bg-[#ff8a1f]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function SheetRow({
  Icon,
  label,
  right,
  onClick,
  danger = false,
}: {
  Icon: LucideIcon;
  label: string;
  right?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-3 text-left transition ${
        danger ? "hover:bg-red-500/10" : "hover:bg-white/[0.04]"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${danger ? "text-red-300" : "text-white/45"}`} />
      <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${danger ? "text-red-200" : "text-white/80"}`}>
        {label}
      </span>
      {right ? (
        <span className="ml-auto font-mono text-[10px] font-bold uppercase text-white/40">{right}</span>
      ) : null}
    </button>
  );
}


/* ── Wind helper re-exported for the page's tray button ─────────────── */

export function windMultiplier(idx: number): number {
  return WIND_STEPS[idx]?.mult ?? 1;
}

export { WIND_STEPS };
