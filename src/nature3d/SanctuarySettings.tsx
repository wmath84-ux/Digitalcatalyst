// src/nature3d/SanctuarySettings.tsx
//
// Full-page GAME settings for the Sanctuary. The tray's gear opens this
// overlay — laid out like a pause-menu:
//
//   · LEFT  — the selected page's settings
//   · RIGHT — a vertical tray with three tabs: Light, Scene and Dock
//
// DOCK (added 2026-09-29, owner brief: "sanctuary dock ke liye ek advance
// option setting mein rakhna"): the dock's own behaviour, away from the look
// of the world. The first row is DRAG SCROLL AUTO-HIDE — the bottom line's
// hold-and-drag gesture (drag left/right along the line, the dock reveals
// under the finger, the button the finger lifts on is the one that clicks,
// the dock hides again the moment the finger lifts). On by default — the
// same gesture the home footer and every course dock already speak — and
// switchable for anyone whose comfort is the older peek behaviour.

import type { ComponentType } from "react";
import {
  Clock, LogOut, Maximize2, Minimize2, Moon, RotateCw, Rows3, Settings,
  Snowflake, Sparkles, Sun, Sunrise, Sunset, Trees, Wind, X,
  MoveHorizontal, PanelBottom,
} from "lucide-react";
import type { DaylightMode } from "./engine/daylight";

export type SettingsPage = "light" | "scene" | "dock";

const DAYLIGHT_MODES: Array<{
  key: DaylightMode;
  label: string;
  hint: string;
  Icon: typeof Sun;
}> = [
  { key: "auto", label: "Auto", hint: "Follows your clock", Icon: Clock },
  { key: "morning", label: "Morning", hint: "08:00 light", Icon: Sunrise },
  { key: "midday", label: "Midday", hint: "Hard noon sun", Icon: Sun },
  { key: "evening", label: "Evening", hint: "Warm last light", Icon: Sunset },
  { key: "night", label: "Night", hint: "22:00 · stars & moon", Icon: Moon },
];

interface SanctuarySettingsProps {
  open: boolean;
  page: SettingsPage;
  onPage: (page: SettingsPage) => void;
  onClose: () => void;
  daylight: DaylightMode;
  clockHour: number;
  onDaylight: (mode: DaylightMode) => void;
  iceAge: boolean;
  onIceAge: () => void;
  animeSky: boolean;
  onAnimeSky: () => void;
  windLabel: string;
  onWind: () => void;
  autoOrbit: boolean;
  onOrbit: () => void;
  dockAutoHide: boolean;
  onDockAutoHide: () => void;
  immersive: boolean;
  onFullscreen: () => void;
  onHideTray: () => void;
  onExit: () => void;
}

const PAGE_META: Record<SettingsPage, { title: string; index: string }> = {
  light: { title: "Light", index: "01" },
  scene: { title: "Scene", index: "02" },
  dock: { title: "Dock", index: "03" },
};

export default function SanctuarySettings({
  open, page, onPage, onClose,
  daylight, clockHour, onDaylight,
  iceAge, onIceAge, animeSky, onAnimeSky,
  windLabel, onWind, autoOrbit, onOrbit,
  dockAutoHide, onDockAutoHide,
  immersive, onFullscreen, onHideTray, onExit,
}: SanctuarySettingsProps) {
  if (!open) return null;

  const clockHourLabel = (h: number) => {
    const wrapped = ((h % 24) + 24) % 24;
    return (
      `${String(Math.floor(wrapped)).padStart(2, "0")}:` +
      `${String(Math.floor((wrapped % 1) * 60)).padStart(2, "0")}`
    );
  };

  const meta = PAGE_META[page];

  return (
    <div
      data-sanctuary-settings
      className="absolute inset-0 z-50 flex bg-[#070b12]/92 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Sanctuary settings"
    >
      {/* ── LEFT: the active page ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-3">
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/[0.06] text-white/80 transition hover:bg-white/12"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300/80">
              Sanctuary
            </p>
            <h1 className="text-[17px] font-black tracking-tight">{meta.title}</h1>
          </div>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[10px] font-bold text-white/45 sm:inline">
            {meta.index} / 03
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {page === "light" ? (
            <section data-settings-page="light" className="mx-auto max-w-2xl">
              <p className="mb-4 text-[12px] font-medium leading-5 text-white/50">
                Pick the hour. Auto follows the real clock — the sun travels on its own,
                dusk melts into a starlit night, and the morning haze burns off with the sunrise.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {DAYLIGHT_MODES.map(({ key, label, hint, Icon }) => {
                  const active = daylight === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onDaylight(key)}
                      title={key === "auto" ? "Follow the real time of day" : `Light the sanctuary as ${label.toLowerCase()}`}
                      className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-amber-300/70 bg-gradient-to-br from-amber-400/25 to-orange-500/10 shadow-[0_0_28px_rgba(251,191,36,0.28)]"
                          : "border-white/12 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]"
                      }`}
                    >
                      <Icon className={`h-7 w-7 ${active ? "text-amber-200" : "text-white/55"}`} />
                      <p className="mt-3 text-[15px] font-black tracking-tight">{label}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-white/45">{hint}</p>
                      {active ? (
                        <span className="absolute right-3 top-3 rounded-full bg-amber-300/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-950">
                          Active
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {daylight === "auto" ? (
                <p className="mt-4 font-mono text-[12px] font-bold text-amber-200/85">
                  {clockHourLabel(clockHour)} · following your clock
                </p>
              ) : null}
            </section>
          ) : page === "scene" ? (
            <section data-settings-page="scene" className="mx-auto max-w-2xl space-y-2">
              <p className="mb-3 text-[12px] font-medium leading-5 text-white/50">
                Weather, sky and camera — the look of the world.
              </p>
              <SceneRow
                Icon={Snowflake}
                label="Ice Age"
                ariaLabel="Ice Age"
                pressed={iceAge}
                right={iceAge ? "On" : "Off"}
                active={iceAge}
                onClick={onIceAge}
              />
              <SceneRow
                Icon={Sparkles}
                label="Anime sky"
                pressed={animeSky}
                right={animeSky ? "On" : "Off"}
                active={animeSky}
                onClick={onAnimeSky}
              />
              <SceneRow
                Icon={Wind}
                label="Wind strength"
                right={windLabel}
                onClick={onWind}
              />
              <SceneRow
                Icon={RotateCw}
                label="Auto 360° orbit"
                pressed={autoOrbit}
                right={autoOrbit ? "On" : "Off"}
                active={autoOrbit}
                onClick={onOrbit}
              />
              <SceneRow
                Icon={immersive ? Minimize2 : Maximize2}
                label={immersive ? "Exit fullscreen" : "Fullscreen"}
                pressed={immersive}
                active={immersive}
                onClick={onFullscreen}
              />
            </section>
          ) : (
            <section data-settings-page="dock" className="mx-auto max-w-2xl">
              <p className="mb-1 text-[12px] font-medium leading-5 text-white/50">
                Advanced — how the bottom dock behaves.
              </p>
              <div className="mt-3 space-y-2">
                <SceneRow
                  Icon={MoveHorizontal}
                  label="Drag scroll auto-hide"
                  pressed={dockAutoHide}
                  right={dockAutoHide ? "On" : "Off"}
                  active={dockAutoHide}
                  onClick={onDockAutoHide}
                />
                <p className="px-1 pb-1 text-[11px] font-medium leading-5 text-white/40">
                  Hold the bottom line and drag left / right — the dock reveals under your
                  finger, the button you lift on is the one that clicks, and the dock hides
                  again the moment your finger comes up. Turn it off to keep the dock open
                  until you close it yourself.
                </p>
                <SceneRow
                  Icon={PanelBottom}
                  label="Bottom dock"
                  right="Hide"
                  onClick={onHideTray}
                />
              </div>
            </section>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onExit}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-[12px] font-black text-rose-200 transition hover:bg-rose-500/20"
          >
            <LogOut className="h-4 w-4" />
            Back to Digital Catalyst
          </button>
        </footer>
      </div>

      {/* ── RIGHT: vertical page tray — Light, Scene, Dock ────────────── */}
      <aside
        data-settings-rail
        className="flex w-[4.25rem] shrink-0 flex-col items-center gap-2 border-l border-white/10 bg-black/35 py-4"
      >
        <span className="mb-1 grid h-9 w-9 place-items-center rounded-lg border border-amber-300/30 bg-amber-400/15 text-amber-200">
          <Settings className="h-4 w-4" />
        </span>
        <RailTab
          label="Light"
          Icon={Sun}
          active={page === "light"}
          onClick={() => onPage("light")}
        />
        <RailTab
          label="Scene"
          Icon={Trees}
          active={page === "scene"}
          onClick={() => onPage("scene")}
        />
        <RailTab
          label="Dock"
          Icon={Rows3}
          active={page === "dock"}
          onClick={() => onPage("dock")}
        />
      </aside>
    </div>
  );
}

function RailTab({
  label, Icon, active, onClick,
}: {
  label: string;
  Icon: typeof Sun;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`relative flex h-[4.6rem] w-14 flex-col items-center justify-center gap-1 rounded-xl border text-[9px] font-black uppercase tracking-[0.12em] transition ${
        active
          ? "border-amber-300/60 bg-amber-400/20 text-white shadow-[0_0_18px_rgba(251,191,36,0.25)]"
          : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/85"
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-amber-300" />
      ) : null}
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function SceneRow({
  Icon, label, ariaLabel, right, active, pressed, onClick,
}: {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  ariaLabel?: string;
  right?: string;
  active?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        active
          ? "border-emerald-300/50 bg-emerald-400/15 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
        active ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/70"
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-black">{label}</span>
      {right ? (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          right === "On"
            ? "bg-emerald-400/25 text-emerald-200"
            : "bg-white/10 text-white/50"
        }`}>
          {right}
        </span>
      ) : null}
    </button>
  );
}
