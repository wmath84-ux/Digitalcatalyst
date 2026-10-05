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
  feature: "notes" | "mindMap" | "brain";
}

export default function MasterSelfControl({
  mode,
  onChange,
  masterCount,
  selfCount,
  ariaLabel,
  feature,
}: MasterSelfControlProps) {
  const tile = (selected: boolean) =>
    `rounded-lg px-3 py-2 text-xs font-black tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
      selected ? "bg-[var(--dc-flat-ink)] text-[var(--dc-flat-board)] shadow-sm" : "text-[var(--dc-flat-ink-sub)] hover:text-[var(--dc-flat-ink)]"
    }`;

  return (
    <div
      className="inline-flex shrink-0 rounded-xl p-1"
      style={{
        background: "var(--dc-flat-box)",
        boxShadow: "inset 0 0 0 1px var(--dc-flat-row-line)",
      }}
      role="tablist"
      aria-label={ariaLabel}
      data-master-self-control={feature}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "master"}
        data-course-note-collection="master"
        onClick={() => onChange("master")}
        className={tile(mode === "master")}
      >
        MASTER{" "}
        {typeof masterCount === "number" ? (
          <span className="ml-1 text-[10px] tabular-nums opacity-80">{masterCount}</span>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "self"}
        data-course-note-collection="self"
        onClick={() => onChange("self")}
        className={tile(mode === "self")}
      >
        SELF{" "}
        {typeof selfCount === "number" ? (
          <span className="ml-1 text-[10px] tabular-nums opacity-80">{selfCount}</span>
        ) : null}
      </button>
    </div>
  );
}
