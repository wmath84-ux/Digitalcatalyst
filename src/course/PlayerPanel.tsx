// src/course/PlayerPanel.tsx
//
// The Course Player's PLAYER panel — what the old player header plus the
// ⚙ Player settings popover used to be, rebuilt as ONE complete list that
// lives in the footer dock's "Player" tab (owner's direction: no header at
// all; the learner taps the Player button in the footer navigation and
// EVERYTHING is there).
//
// Four sections, top to bottom, all updating live:
//
//   1. COURSE — the website logo (tap = back to Purchases, hold = open Home,
//      the same useHomeHold contract the old header had), the course title
//      and the subscription / preview badges.
//   2. PROGRESS — the charging-widget "Mark complete" toggle plus the
//      shimmer progress bar, exactly the controls the header used to carry.
//   3. ACTIVE FILE — the buttons the file's own viewer header provided
//      (open original, download, fullscreen, Google editor, personal copy),
//      reported live by the active ResourceViewer, so the list always
//      matches the module the learner is on.
//   4. PLAYER SETTINGS — the preference rows the ⚙ popover held (theme,
//      snowfall, desktop view, hide status bar). Split mode is the player's
//      only layout now, so its toggle is gone; the old "file bars" /
//      "player bars" hide toggles are gone too because there is no header
//      left to hide.

import { Download, ExternalLink, FileStack, FileQuestion, Maximize2, PencilLine, Eye, MonitorSmartphone, RefreshCw } from "lucide-react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { GlassButton } from "../components/ui/glass-button";
import { GlassPrefToggle } from "../components/ui/glass-pref-toggle";
import { toast } from "../components/ui/glass-toast";
import ShimmerProgress from "../components/ui/ShimmerProgress";
import { useHomeHold } from "../hooks/useHomeHold";
import ChargingCompleteButton from "./ChargingCompleteButton";
import type { CourseFileActions } from "./ResourceViewer";

// ── Preference row accents — the same colours the ⚙ popover used ──────────
const SETTING_ACCENTS: Record<string, { color: string; delay: number; divider: boolean }> = {
  theme: { color: "#FF6BF5", delay: 0.1, divider: false },
  snow: { color: "#3A86FF", delay: 0.15, divider: true },
  viewport: { color: "#06D6A0", delay: 0.15, divider: true },
  fullscreen: { color: "#B388FF", delay: 0.2, divider: true },
};

const notifySetting = (label: string, next: boolean) => {
  toast({ title: `${label} ${next ? "on" : "off"}`, variant: next ? "success" : "info", duration: 2200 });
};

// ── Action rows — the dock-style list rows, same 44px tinted plates ────────

interface PanelActionRowProps {
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  color: string;
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** External links render an anchor; everything else is a plain button. */
  href?: string;
  downloadableFileName?: string;
  onPress?: () => void;
  dataAttrs?: Record<string, string | undefined>;
}

function PanelActionRow({ icon: Icon, color, label, hint, active = false, disabled = false, busy = false, href, downloadableFileName, onPress, dataAttrs }: PanelActionRowProps) {
  const plate = (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center"
      style={{
        background: active ? `${color}30` : `${color}18`,
        border: active ? `1px solid ${color}55` : `1px solid ${color}22`,
        borderRadius: 12,
        boxShadow: active ? `0 0 16px ${color}44` : "none",
        color,
      }}
    >
      {busy ? <RefreshCw size={18} className="animate-spin" /> : <Icon size={20} />}
    </span>
  );
  const body = (
    <>
      {plate}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-white/90">{label}</span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-[var(--course-muted)]">{hint}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-[var(--course-muted)]">
        {href ? <ExternalLink size={14} /> : null}
      </span>
    </>
  );
  const className = `flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/[0.04]"}`;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={downloadableFileName}
        className={className}
        data-course-panel-row=""
        {...dataAttrs}
      >
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={className}
      data-course-panel-row=""
      {...dataAttrs}
    >
      {body}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--course-muted)]" data-course-panel-section-label="">
      {children}
    </p>
  );
}

export interface PlayerPanelProps {
  // Course identity
  logoUrl: string;
  appName: string;
  productTitle: string;
  hasActiveSubscription: boolean;
  showPreviewBadge: boolean;
  onBack: () => void;
  // Progress
  progress: number;
  isDone: boolean;
  canMarkComplete: boolean;
  onToggleComplete: () => void;
  // Active file's own actions, reported live by the active ResourceViewer.
  fileActions: CourseFileActions | null;
  // Preferences
  theme: "dark" | "light";
  onThemeChange: (next: "dark" | "light") => void;
  snowMode: boolean;
  onSnowModeChange: (next: boolean) => void;
  showViewportToggle: boolean;
  desktopView: boolean;
  onDesktopViewChange: (next: boolean) => void;
  canFullscreen: boolean;
  courseFullscreen: boolean;
  onHideStatusBarChange: (next: boolean) => void;
}

export default function PlayerPanel({
  logoUrl,
  appName,
  productTitle,
  hasActiveSubscription,
  showPreviewBadge,
  onBack,
  progress,
  isDone,
  canMarkComplete,
  onToggleComplete,
  fileActions,
  theme,
  onThemeChange,
  snowMode,
  onSnowModeChange,
  showViewportToggle,
  desktopView,
  onDesktopViewChange,
  canFullscreen,
  courseFullscreen,
  onHideStatusBarChange,
}: PlayerPanelProps) {
  // Holding the logo opens the main app (Home); a normal tap returns the
  // learner to Purchases — the exact contract the old player header had.
  const logoHold = useHomeHold(() => {
    window.location.hash = "#/home";
  });

  const settingsRow = (label: string, checked: boolean, onChange: (next: boolean) => void, attr: string) => {
    const accent = SETTING_ACCENTS[attr] ?? { color: "#3A86FF", delay: 0.1, divider: true };
    return (
      <GlassPrefToggle
        label={label}
        on={checked}
        onChange={(next) => {
          onChange(next);
          notifySetting(label, next);
        }}
        color={accent.color}
        delay={accent.delay}
        divider={accent.divider}
        light={theme === "light"}
        data-course-setting={attr}
      />
    );
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain pb-3" data-course-player-panel>
      {/* ── 1. Course identity — logo back button, title, badges ──────── */}
      <SectionLabel>Course</SectionLabel>
      <div className="flex items-center gap-3 px-3 py-1.5" data-course-panel-section="course">
        <GlassButton
          {...logoHold.handlers}
          onClick={() => {
            // A completed long-press already opened Home; don't also go to Purchases.
            if (logoHold.consumeSuppressedClick()) return;
            onBack();
          }}
          className={`shrink-0 select-none [&_.size-12]:size-10 [&_.size-12]:overflow-hidden ${logoHold.holding ? "[touch-action:none]" : ""}`}
          aria-label="Back to purchases"
          title="Back to purchases"
          data-course-back
          data-course-logo-back
        >
          <img src={logoUrl} alt={appName} className="h-10 w-10 rounded-full object-cover select-none" draggable={false} data-course-logo />
        </GlassButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black leading-tight tracking-tight" data-course-product-title>{productTitle}</p>
          {hasActiveSubscription || showPreviewBadge ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {hasActiveSubscription ? (
                <span data-course-subscription-badge="active" className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">Active subscription</span>
              ) : null}
              {showPreviewBadge ? (
                <span data-course-preview-badge className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/20">Preview mode</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 2. Progress — the charging-widget toggle + shimmer bar ────── */}
      <SectionLabel>Progress</SectionLabel>
      <div className="flex items-center gap-3 px-3 py-1.5" data-course-panel-section="progress">
        {canMarkComplete ? (
          <ChargingCompleteButton done={isDone} onToggle={onToggleComplete} size={42} />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white/90">{isDone ? "Lesson completed" : "Mark complete"}</p>
          <div className="mt-1.5 flex items-center gap-2" data-course-progress-summary>
            <ShimmerProgress
              value={progress}
              orientation="horizontal"
              thickness={6}
              className="min-w-0 flex-1"
              data-course-progress-bar=""
              data-progress-value={progress}
            />
            <span className="shrink-0 text-[9px] font-black leading-none text-[var(--course-muted)]" data-course-progress-label>{progress}%</span>
          </div>
        </div>
      </div>

      {/* ── 3. Active file — the buttons the file header used to carry ── */}
      <SectionLabel>Active file</SectionLabel>
      {fileActions ? (
        <div className="px-2" data-course-panel-section="file">
          <div className="px-2 pb-1 pt-1">
            <p className="truncate text-xs font-black text-white/90" title={fileActions.fileName}>{fileActions.fileName}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--course-muted)]" data-course-viewer-kind>{fileActions.kindLabel}</p>
          </div>
          <div className="space-y-1">
            {fileActions.externalUrl ? (
              <PanelActionRow
                icon={ExternalLink}
                color="#06D6A0"
                label={fileActions.isYouTube ? "Open in YouTube" : "Open original"}
                hint={fileActions.isYouTube ? "Use this if embedded playback is blocked" : "New tab"}
                href={fileActions.externalUrl}
                dataAttrs={{ "data-course-viewer-external": "", "aria-label": "Open preview in new tab" }}
              />
            ) : null}
            {fileActions.download.url ? (
              <PanelActionRow
                icon={Download}
                color="#3A86FF"
                label={fileActions.download.label}
                hint={fileActions.download.downloadable ? fileActions.download.fileName : "New tab"}
                href={fileActions.download.url}
                downloadableFileName={fileActions.download.downloadable ? fileActions.download.fileName : undefined}
                dataAttrs={{ "data-course-viewer-download": "" }}
              />
            ) : null}
            {fileActions.isMedia ? (
              <PanelActionRow
                icon={Maximize2}
                color="#B388FF"
                label="Fullscreen"
                hint="Fill the screen"
                onPress={fileActions.onToggleFullscreen}
                dataAttrs={{ "data-course-viewer-fullscreen": "" }}
              />
            ) : null}
            {fileActions.canEditInline ? (
              <PanelActionRow
                icon={fileActions.editMode ? Eye : PencilLine}
                color="#FF6BF5"
                label={fileActions.editMode ? "Back to preview" : "Edit in Google Docs"}
                hint={fileActions.editMode ? "Read-only preview" : "Full toolbar editor"}
                active={fileActions.editMode}
                onPress={fileActions.onToggleEditMode}
                dataAttrs={{ "data-course-viewer-edit-toggle": "", "data-doc-mode": fileActions.editMode ? "edit" : "preview" }}
              />
            ) : null}
            {fileActions.personalCopyEnabled ? (
              <PanelActionRow
                icon={FileStack}
                color="#FFBE0B"
                label={fileActions.personalCopyActive ? "Back to the master file" : "My copy"}
                hint={fileActions.personalCopyActive ? "Close your personal copy" : "Your own editable copy in Google Drive"}
                active={fileActions.personalCopyActive}
                busy={fileActions.personalCopyBusy}
                disabled={fileActions.personalCopyBusy}
                onPress={fileActions.onTogglePersonalCopy}
                dataAttrs={{ "data-course-viewer-copy-toggle": "", "data-copy-active": fileActions.personalCopyActive ? "true" : "false" }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2 text-[var(--course-muted)]" data-course-panel-section="file" data-course-panel-file-empty="">
          <FileQuestion size={18} />
          <p className="text-[11px] font-semibold">Koi file open nahi hai — Module tab se lesson choose karein.</p>
        </div>
      )}

      {/* ── 4. Player settings — every preference, one list ──────────── */}
      <SectionLabel>Player settings</SectionLabel>
      <div data-course-panel-section="settings" data-course-settings-menu data-course-theme={theme}>
        {settingsRow("Light theme", theme === "light", (next) => onThemeChange(next ? "light" : "dark"), "theme")}
        {settingsRow("Snowfall", snowMode, (next) => onSnowModeChange(next), "snow")}
        {showViewportToggle ? settingsRow("Desktop view", desktopView, (next) => onDesktopViewChange(next), "viewport") : null}
        {canFullscreen ? settingsRow("Hide status bar", courseFullscreen, (next) => onHideStatusBarChange(next), "fullscreen") : null}
        <p className="flex items-center gap-2 px-4 pb-1 pt-3 text-[10px] font-semibold text-[var(--course-muted)]">
          <MonitorSmartphone size={12} /> Split mode hamesha on hai — lesson aur study pane side by side.
        </p>
      </div>
    </div>
  );
}
