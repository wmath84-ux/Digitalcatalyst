// src/course/MasterSelfControl.tsx
//
// The SHARED MASTER/SELF segmented control (contract §34/§35).
//
// Notes, Mind Map and Brain each keep their OWN data source, but they all
// render this one control so the visual hierarchy, active/inactive treatment,
// spacing, responsive behaviour and accessibility pattern are identical
// everywhere. It is pure presentation + selection — persistence of WHICH mode
// is selected lives in `useMasterSelfPreference` (playerPreferences), scoped
// per feature and per user, so one feature's choice never bleeds into another.
//
// The paint reads the Course Player theme tokens (`--dc-flat-*`) so it is
// legible in both the dark default and the genuine light palette — no CSS
// colour inversion anywhere.

import type { MasterSelfMode } from "./playerPreferences";

interface MasterSelfControlProps {
  mode: MasterSelfMode;
  onChange: (mode: MasterSelfMode) => void;
  /** Counts to surface next to each label (metadata only). */
  masterCount?: number;
  selfCount?: number;
  /** Accessible group label, e.g. "Note collection". */
  ariaLabel: string;
  /** Hook for the shared contract test + per-feature CSS. */
  feature: "notes" | "mindMap" | "brain" | "experiment";
  /**
   * The two labels. The NOTES and the MIND MAP call them "Course library" and
   * "My library" (the owner, 2026-10-17) — the plain MASTER / SELF words stay
   * the default for the other features.
   */
  masterLabel?: string;
  selfLabel?: string;
  /**
   * The EXPANDED control: both halves fill the header's width, so the two
   * libraries are readable at a glance instead of a tiny centred pill.
   */
  expand?: boolean;
}

export default function MasterSelfControl({
  mode,
  onChange,
  masterCount,
  selfCount,
  ariaLabel,
  feature,
  masterLabel = "MASTER",
  selfLabel = "SELF",
  expand = false,
}: MasterSelfControlProps) {
  const tile = (selected: boolean) =>
    `rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
      expand
        ? "flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-black"
        : "px-3 py-2 text-xs font-black tracking-wide"
    } ${
      selected ? "bg-[var(--dc-flat-ink)] text-[var(--dc-flat-board)] shadow-sm" : "text-[var(--dc-flat-ink-sub)] hover:text-[var(--dc-flat-ink)]"
    }`;

  const count = (value: number | undefined) =>
    typeof value === "number" ? (
      <span className="shrink-0 text-[10px] font-black tabular-nums opacity-80">{value}</span>
    ) : null;

  return (
    <div
      className={`inline-flex shrink-0 rounded-xl p-1 ${expand ? "w-full" : ""}`}
      style={{
        background: "var(--dc-flat-box)",
        boxShadow: "inset 0 0 0 1px var(--dc-flat-row-line)",
      }}
      role="tablist"
      aria-label={ariaLabel}
      data-master-self-control={feature}
      data-master-self-expanded={expand ? "true" : undefined}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "master"}
        data-course-note-collection="master"
        onClick={() => onChange("master")}
        className={tile(mode === "master")}
      >
        <span className="truncate">{masterLabel}</span>
        {count(masterCount)}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "self"}
        data-course-note-collection="self"
        onClick={() => onChange("self")}
        className={tile(mode === "self")}
      >
        <span className="truncate">{selfLabel}</span>
        {count(selfCount)}
      </button>
    </div>
  );
}
