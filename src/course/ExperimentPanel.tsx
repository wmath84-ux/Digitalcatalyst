// src/course/ExperimentPanel.tsx
//
// The Course Player's Experiment page — “Live Experiment”, in the card
// language the Brain page already uses: a MASTER/SELF filter, the list the
// filter selects, and the ONE create affordance.
//
//   · MASTER — the course's own 2D experiments (the admin's `interactive`
//     resources), opened in the normal viewer stack. A locked module's
//     experiment carries its lock instead of opening.
//   · SELF   — the learner's OWN experiments, read from “My experiments” on
//     the Study Library shelf through the player's live library listener
//     (`selfExperimentsFromCourses`, src/utils/selfExperiments.ts), so one
//     created here is on every device and editable in the library.
//
// The “+” exists ONLY while SELF is the open filter (the Brain page's rule,
// owner brief 2026-10-07): MASTER experiments are the teacher's, not the
// learner's to extend. It opens a small dropdown first — the ways in, plus the
// four starter templates one tap away — and each way in opens the composer
// (src/course/ExperimentComposer.tsx), which is the Study Library's own builder:
// AI prompt with Copy CMD, paste / upload / template, the live preview, and
// Create that saves the experiment to the library immediately.

import { useEffect, useState } from "react";
import { FlaskConical, Hammer, LockKeyhole, Plus, Sparkles } from "lucide-react";
import MasterSelfControl from "./MasterSelfControl";
import ExperimentComposer from "./ExperimentComposer";
import { useMasterSelfPreference } from "./playerPreferences";
import { EXPERIMENT_TEMPLATES, templateBytes } from "../personal-library/experimentTemplates";
import type { CourseFile } from "../types/course";

/** One experiment the page lists — MASTER (course) or SELF (library). */
export interface PlayerExperiment {
  id: string;
  title: string;
  /** The module it belongs to, shown as the row's second line. */
  moduleTitle: string;
  /** Ready for the player's viewer stack (`selectFile` / `selectPersonalFile`). */
  file: CourseFile;
  /** A paid/unauthorised module's experiment — listed, not openable. */
  locked?: boolean;
}

export interface ExperimentPanelProps {
  /** The learner's own experiments for THIS course (tagged with its scope). */
  selfExperiments: PlayerExperiment[];
  /** The course's own experiments, in curriculum order. */
  masterExperiments: PlayerExperiment[];
  /** Open an experiment in the viewer stack (the player owns which path). */
  onOpen: (experiment: PlayerExperiment, source: "master" | "self") => void;
  /**
   * Saves an experiment the learner built in the composer (the “+” in SELF
   * mode) and resolves once the library write has finished. Omitted → no “+”,
   * and SELF stays read-only.
   */
  onCreateSelfExperiment?: (input: { name: string; html: string; url?: string }) => Promise<{ ok: boolean; message?: string }>;
  /** Seeds the composer's name field (module being watched, else the course). */
  selfExperimentSeed?: { name?: string };
  uid?: string | null;
}

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

function ExperimentCard({
  experiment,
  source,
  onOpen,
}: {
  experiment: PlayerExperiment;
  source: "master" | "self";
  onOpen: (experiment: PlayerExperiment, source: "master" | "self") => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!experiment.locked) onOpen(experiment, source);
      }}
      disabled={experiment.locked}
      data-experiment-card={experiment.id}
      {...(source === "self" ? { "data-experiment-self-card": "" } : { "data-experiment-master-card": "" })}
      className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-[var(--dc-flat-row)] p-4 text-left transition hover:border-white/20 hover:bg-[var(--dc-flat-row-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{ background: "rgba(255,107,245,0.16)", color: "#FF6BF5" }}
      >
        <FlaskConical size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-[var(--dc-flat-ink)]">{experiment.title}</span>
          {experiment.locked ? <LockKeyhole size={13} className="shrink-0 text-amber-300" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--dc-flat-ink-sub)]">
          {experiment.moduleTitle || "Live Experiment"} · 2D experiment
        </span>
      </span>
      <span
        className="shrink-0 self-center rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide"
        data-experiment-source={source}
        style={
          source === "self"
            ? { background: "rgba(255,107,245,0.16)", color: "#FF9CF9" }
            : { background: "var(--dc-flat-row-hover)", color: "var(--dc-flat-ink-sub)" }
        }
      >
        {source === "self" ? "SELF" : "MASTER"}
      </span>
    </button>
  );
}

export default function ExperimentPanel({
  selfExperiments,
  masterExperiments,
  onOpen,
  onCreateSelfExperiment,
  selfExperimentSeed,
  uid,
}: ExperimentPanelProps) {
  const masterSelfCtl = useMasterSelfPreference("experiment", uid ?? null, "master");
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  /** A starter template's HTML, when the learner picked one in the menu. */
  const [seedHtml, setSeedHtml] = useState("");

  // The “+” belongs to SELF mode: switching back to MASTER closes the menu and
  // the composer, so a half-made experiment never floats over a list it cannot
  // appear in.
  useEffect(() => {
    if (masterSelfCtl.mode !== "self") {
      setMenuOpen(false);
      setComposerOpen(false);
      setSeedHtml("");
    }
  }, [masterSelfCtl.mode]);

  const openComposer = (html = "") => {
    setSeedHtml(html);
    setMenuOpen(false);
    setComposerOpen(true);
  };

  const selfMode = masterSelfCtl.mode === "self";

  return (
    <div
      className="relative flex h-full min-h-0 flex-col px-3 py-3"
      data-course-experiment-panel=""
      data-course-theme-surface="dark"
      data-experiment-screen="library"
    >
      {/* MASTER / SELF segmented control — the same contract as Notes, Mind Map
          and Brain. MASTER = the course's experiments from the course tree.
          SELF = the learner's own, made here or in the Study Library. */}
      <div className="flex items-center justify-between gap-2 pb-2" data-experiment-collection="">
        <p className="text-[11px] font-black uppercase tracking-wide text-white/50">Live experiments</p>
        <div className="flex items-center gap-2">
          {/* The “+” — the owner brief asks for it ON this page (2026-10-07:
              “experiment page per plus icon add karo jis per click karne per
              drop down badhiya sa dikhe”), so unlike the Brain page's it is
              always here. Made experiments are the learner's OWN, so tapping
              it from MASTER first opens the SELF filter — the list behind the
              dropdown is then exactly where the new experiment will land. */}
          {onCreateSelfExperiment ? (
            <button
              type="button"
              onClick={() => {
                masterSelfCtl.setMode("self");
                setMenuOpen((open) => !open);
              }}
              aria-label="Create your own experiment"
              aria-expanded={menuOpen}
              title="Create your own experiment"
              data-experiment-self-add=""
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white ring-1 ring-white/20 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <Plus size={16} />
            </button>
          ) : null}
          <MasterSelfControl
            feature="experiment"
            ariaLabel="Experiment collection"
            mode={masterSelfCtl.mode}
            onChange={masterSelfCtl.setMode}
            masterCount={masterExperiments.length}
            selfCount={selfExperiments.length}
          />
        </div>
      </div>

      {/* The dropdown: a clean little sheet under the “+”. */}
      {menuOpen ? (
        <>
          <div className="absolute inset-0 z-20" data-experiment-self-menu-backdrop="" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            aria-label="Create your own experiment"
            data-experiment-self-menu=""
            className="absolute right-3 z-30 w-[19rem] rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur"
            style={{ top: 52 }}
          >
            <p className="px-2 pb-1 pt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Create your own
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => openComposer()}
              data-experiment-self-menu-item="scratch"
              className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/[0.07]"
            >
              <Sparkles size={14} className="mt-0.5 shrink-0 text-violet-300" />
              <span className="min-w-0">
                <span className="block text-[12px] font-black text-white">Ask an AI for it</span>
                <span className="block text-[10px] font-semibold leading-4 text-slate-400">
                  Copy the CMD, paste the HTML it replies with — or write the code yourself.
                </span>
              </span>
            </button>
            <p className="px-2 pb-1 pt-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Or start from a template
            </p>
            {EXPERIMENT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                role="menuitem"
                onClick={() => openComposer(template.html)}
                title={template.summary}
                data-experiment-self-menu-item={`template:${template.id}`}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/[0.07]"
              >
                <Hammer size={13} className="shrink-0 text-cyan-300" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-black text-slate-100">{template.label}</span>
                <span className="shrink-0 text-[10px] font-bold text-slate-500">{kilobytes(templateBytes(template))}</span>
              </button>
            ))}
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold text-slate-500">
              Saved in My Study Library → “My experiments”.
            </p>
          </div>
        </>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-1">
        {/* In SELF mode the learner's own experiments replace the course list. */}
        {selfMode ? (
          selfExperiments.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[var(--dc-flat-row)] p-6 text-center" data-experiment-empty="" data-experiment-self-empty="">
              <span
                className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: "rgba(255,107,245,0.16)", color: "#FF6BF5" }}
              >
                <FlaskConical size={26} />
              </span>
              <p className="text-sm font-black text-[var(--dc-flat-ink)]">Your Experiments</p>
              <p className="mx-auto mt-1 max-w-[22rem] text-[11px] font-semibold leading-relaxed text-[var(--dc-flat-ink-sub)]">
                {onCreateSelfExperiment
                  ? "Tap + in the header to create your own 2D experiment — an AI writes the code, you paste it, preview it and Create. It is saved to My Study Library and plays right here."
                  : "Create experiments in your Study Library and they will appear here."}
              </p>
            </div>
          ) : (
            selfExperiments.map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} source="self" onOpen={onOpen} />
            ))
          )
        ) : masterExperiments.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[var(--dc-flat-row)] p-6 text-center" data-experiment-empty="" data-experiment-master-empty="">
            <span
              className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: "rgba(255,107,245,0.16)", color: "#FF6BF5" }}
            >
              <FlaskConical size={26} />
            </span>
            <p className="text-sm font-black text-[var(--dc-flat-ink)]">Live Experiment</p>
            <p className="mx-auto mt-1 max-w-[22rem] text-[11px] font-semibold leading-relaxed text-[var(--dc-flat-ink-sub)]">
              No experiments in this course yet. Switch to SELF and tap + to build your own — the same
              builder as My Study Library.
            </p>
          </div>
        ) : (
          masterExperiments.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} source="master" onOpen={onOpen} />
          ))
        )}
      </div>

      {composerOpen && onCreateSelfExperiment ? (
        <ExperimentComposer
          defaultName={selfExperimentSeed?.name || "My experiment"}
          initialHtml={seedHtml}
          onClose={() => {
            setComposerOpen(false);
            setSeedHtml("");
          }}
          onCreate={onCreateSelfExperiment}
        />
      ) : null}
    </div>
  );
}
