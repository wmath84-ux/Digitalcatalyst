// src/work/WorkQuadHeader.tsx
//
// WORK MODE'S ONE HEADER LINE (768px up) — the shell chrome the plus deck needs
// (owner, 2026-10-16: "work mode mein bhi same split-screen behaviour … same
// navigation behaviour").
//
// Why the deck needs a shell header at all: in the deck every block renders its
// page HEADLESS (the Course Player's own rule — its four blocks carry no
// per-block header), so exactly one header has to carry the things the page
// headers used to carry: leaving Work, which page this is, the navigation when
// it lives up here, the Work-view settings and the light/dark toggle. It is a
// real header in the layout's flow, never a floating overlay over a page —
// which is why it lives in this file and not in WorkApp (see
// tests/workModePhase2Contract.test.mjs).
//
// Below 768px this component is never mounted: WorkApp keeps today's
// per-page headers untouched on a phone.

import { ArrowLeft, Moon, Settings2, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkTheme } from "./storage/workPrefs";
import { workPageRecord, type WorkPageId } from "./workPages";
import { WORK_ACCENT_WASH } from "./pages/WorkPageSurface";

export interface WorkQuadHeaderProps {
  /** The page the navigation last selected — shown when the nav is elsewhere. */
  page: WorkPageId;
  theme: WorkTheme;
  onExit: () => void;
  onToggleTheme: () => void;
  /** The navigation, when its stored placement is "header". */
  navSlot?: ReactNode;
  viewSettingsOpen: boolean;
  onToggleViewSettings: () => void;
}

export default function WorkQuadHeader({
  page,
  theme,
  onExit,
  onToggleTheme,
  navSlot = null,
  viewSettingsOpen,
  onToggleViewSettings,
}: WorkQuadHeaderProps) {
  const record = workPageRecord(page);
  const PageIcon = record.icon;
  const dark = theme === "dark";

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-color)] bg-[var(--surface-bg)] px-2"
      data-work-quad-header
      data-work-header-area={page}
    >
      <button
        type="button"
        onClick={onExit}
        aria-label="Leave Work mode and open Home"
        title="Home"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
        data-work-exit=""
      >
        <ArrowLeft size={16} aria-hidden="true" />
      </button>
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ color: record.color, background: WORK_ACCENT_WASH[page] }}
        aria-hidden="true"
      >
        <PageIcon size={15} />
      </span>
      {navSlot ? (
        <div className="flex min-w-0 flex-1 items-center" data-work-quad-nav-slot="header">
          {navSlot}
        </div>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight text-[var(--text-primary)]">
          {record.heading}
        </h1>
      )}
      <button
        type="button"
        data-work-view-toggle
        aria-haspopup="dialog"
        aria-expanded={viewSettingsOpen ? "true" : "false"}
        aria-label="Work view settings"
        title="Work view — zoom aur dividers"
        onClick={onToggleViewSettings}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
      >
        <Settings2 size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={`Switch to ${dark ? "light" : "dark"} Work theme`}
        aria-pressed={dark}
        title={`${dark ? "Light" : "Dark"} theme`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-bg)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
        data-work-theme-toggle=""
      >
        {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      </button>
    </header>
  );
}
