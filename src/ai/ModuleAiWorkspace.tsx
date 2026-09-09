// src/ai/ModuleAiWorkspace.tsx
//
// The AI Study Engine surface for ONE personal module (or one resource inside
// it). It is a single overlay with a small, deliberate action set:
//
//   Ask  ·  Study  ·  Practice      (primary)
//   Summary · Flashcards · Weak topics · Study plan · What the AI can read
//                                   (secondary menu — not a button dashboard)
//
// Everything is scoped to the module the learner opened: the server re-derives
// the owner from the ID token, reads only that module's resources, and never
// mixes in official course content or another module's material.
//
// Mobile: the overlay is positioned inside the VisualViewport (the app's
// existing keyboard architecture — see `useVisualViewportBox`), the message /
// card lists scroll independently, the composer and the step bar are `shrink-0`
// with safe-area padding, and no keyboard height is ever hardcoded.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenText, FileWarning, Layers, Lightbulb, ListChecks, MessageSquare, MoreHorizontal,
  Sparkles, Target, Trash2,
} from "lucide-react";
import { cn } from "../utils/cn";
import { toast } from "../components/ui/glass-toast";
import { AiActionButton, AiOverlay, AiOverlayHeader, AiPill } from "./components";
import { useModuleAi } from "./useModuleAi";
import { collectModuleNotes } from "./aiNotes";
import AiChatView from "./AiChatView";
import AiSummaryView from "./AiSummaryView";
import AiQuestionsView from "./AiQuestionsView";
import AiFlashcardsView from "./AiFlashcardsView";
import AiWeakTopicsView from "./AiWeakTopicsView";
import AiStudyPlanView from "./AiStudyPlanView";
import AiStudyModeView from "./AiStudyModeView";
import AiSourcesView from "./AiSourcesView";
import { trackAiEvent } from "../utils/featureAnalytics";
import type { PersonalAiNoteInput } from "./types";

export type ModuleAiView = "ask" | "study" | "practice" | "summary" | "flashcards" | "weak" | "plan" | "sources";

export interface ModuleAiWorkspaceProps {
  open: boolean;
  onClose: () => void;
  uid: string | null;
  /** Public module id (null for the Saved-for-Later bucket). */
  moduleId?: string | null;
  /** Internal storage parent id — always present, also used for saved resources. */
  storageModuleId?: string | null;
  moduleTitle?: string;
  productId?: string | null;
  /** Scope the whole workspace to ONE resource ("Ask AI about this"). */
  resourceId?: string | null;
  resourceTitle?: string;
  initialView?: ModuleAiView;
  initialQuestion?: string;
  /** Switch a resource-scoped workspace back to the whole module. */
  onExpandToModule?: () => void;
  onOpenResource?: (resourceId: string) => void;
  onSavedNote?: () => void;
}

const NAV: { id: ModuleAiView; label: string; icon: typeof MessageSquare }[] = [
  { id: "ask", label: "Ask", icon: MessageSquare },
  { id: "study", label: "Study", icon: Lightbulb },
  { id: "practice", label: "Practice", icon: ListChecks },
];

const MORE: { id: ModuleAiView; label: string; hint: string; icon: typeof BookOpenText }[] = [
  { id: "summary", label: "Summary", hint: "Key concepts, definitions, formulas", icon: BookOpenText },
  { id: "flashcards", label: "Flashcards", hint: "Front / back revision cards", icon: Layers },
  { id: "weak", label: "Weak topics", hint: "Evidence from your own answers", icon: Target },
  { id: "plan", label: "Study plan", hint: "A practical day-by-day plan", icon: ListChecks },
  { id: "sources", label: "What the AI can read", hint: "Availability per resource", icon: FileWarning },
];

const openUpgrade = () => {
  trackAiEvent("upgrade_clicked", { surface: "module_ai" });
  window.location.hash = "#/subscription";
};
const openAiSettings = () => { window.location.hash = "#/revision/ai-settings"; };

export default function ModuleAiWorkspace({
  open, onClose, uid, moduleId, storageModuleId, moduleTitle, productId,
  resourceId, resourceTitle, initialView = "ask", initialQuestion,
  onExpandToModule, onOpenResource, onSavedNote,
}: ModuleAiWorkspaceProps) {
  const [view, setView] = useState<ModuleAiView>(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [questionSeed, setQuestionSeed] = useState<string | undefined>(initialQuestion);
  const [notes, setNotes] = useState<PersonalAiNoteInput[]>([]);

  useEffect(() => { setView(initialView); setMenuOpen(false); setQuestionSeed(initialQuestion); }, [initialView, initialQuestion, moduleId, resourceId, open]);

  // The learner's own notes for this module join the grounding corpus. Read
  // them when the workspace opens (and after an AI note is saved).
  const notesKey = `${uid}|${moduleId}|${storageModuleId}|${open}`;
  useEffect(() => {
    if (!open || !uid) { setNotes([]); return; }
    const collected = collectModuleNotes({
      uid,
      productId,
      moduleId: String(moduleId || storageModuleId || ""),
      resourceIds: [],
    });
    setNotes(collected);
  }, [notesKey, moduleId, open, productId, storageModuleId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const ai = useModuleAi({
    uid: open ? uid : null,
    active: open,
    moduleId: moduleId || null,
    storageModuleId: storageModuleId || null,
    resourceId: resourceId || null,
    notes,
  });

  const scope = ai.snapshot?.scope;
  const title = scope?.title || resourceTitle || moduleTitle || "My module";
  const provenance = scope?.provenance
    || (resourceTitle ? `My Module → ${moduleTitle || ""} → ${resourceTitle}` : `My Module → ${moduleTitle || ""}`);

  const askAbout = useCallback((question: string) => {
    setQuestionSeed(question);
    setView("ask");
  }, []);

  const summariseResource = useCallback((targetResourceId: string, targetName: string) => {
    toast({ title: `Summarizing “${targetName}”`, description: "Opening the resource summary…", variant: "info" });
    onOpenResource?.(targetResourceId);
  }, [onOpenResource]);

  const header = useMemo(() => (
    <AiOverlayHeader
      title={resourceId && resourceTitle ? resourceTitle : title}
      provenance={provenance}
      coverage={ai.snapshot?.coverage}
      onClose={onClose}
      right={
        <div className="flex items-center gap-1.5">
          {scope?.resourceId && onExpandToModule ? (
            <button type="button" onClick={onExpandToModule} className="min-h-9 rounded-full bg-white/[0.06] px-3 text-[10px] font-black text-white/70 ring-1 ring-white/10">
              Ask the whole module
            </button>
          ) : null}
          {ai.snapshot?.ai.planName ? <AiPill tone={ai.snapshot.ai.hasAccess ? "emerald" : "amber"}>{ai.snapshot.ai.planName}</AiPill> : null}
        </div>
      }
    />
  ), [ai.snapshot?.ai.hasAccess, ai.snapshot?.ai.planName, ai.snapshot?.coverage, onExpandToModule, onClose, provenance, resourceId, resourceTitle, scope?.resourceId, title]);

  return (
    <AiOverlay open={open} onClose={onClose} label={`AI study workspace for ${title}`}>
      {header}

      <nav className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-2 sm:px-5" data-module-ai-nav="" aria-label="AI study actions">
        {NAV.map((item) => (
          <AiActionButton key={item.id} label={item.label} icon={item.icon} tone={view === item.id ? "primary" : "default"}
            active={view === item.id} onClick={() => setView(item.id)} dataAttrs={{ [`data-module-ai-nav-${item.id}`]: "" }} />
        ))}
        <div className="relative ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-label="More AI actions"
            className={cn("grid h-11 w-11 place-items-center rounded-2xl ring-1 transition",
              menuOpen ? "bg-violet-500/20 text-violet-100 ring-violet-400/30" : "bg-white/[0.05] text-white/65 ring-white/10")}
            data-module-ai-more=""
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-3xl border border-white/12 bg-[#101020]/98 p-2 shadow-2xl backdrop-blur-xl" role="menu" data-module-ai-more-menu="">
                <p className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">More AI actions</p>
                {MORE.map((item) => (
                  <button key={item.id} type="button" role="menuitem" onClick={() => { setView(item.id); setMenuOpen(false); }}
                    className={cn("flex w-full min-h-12 items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition",
                      view === item.id ? "bg-violet-500/20 text-violet-100" : "text-white/75 hover:bg-white/[0.06]")}>
                    <item.icon size={15} className="shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-black">{item.label}</span>
                      <span className="block truncate text-[10px] font-medium text-white/40">{item.hint}</span>
                    </span>
                  </button>
                ))}
                {ai.messages.length ? (
                  <>
                    <div className="my-1 mx-2 h-px bg-white/10" aria-hidden="true" />
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void ai.clearThread(); }}
                      className="flex w-full min-h-11 items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left text-rose-200 transition hover:bg-rose-500/10">
                      <Trash2 size={14} className="shrink-0" />
                      <span className="text-[12px] font-black">Clear this conversation</span>
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </nav>

      {view === "ask" ? (
        <AiChatView
          ai={ai}
          uid={uid || ""}
          productId={productId}
          moduleId={String(moduleId || storageModuleId || "")}
          resourceTitle={resourceTitle}
          initialQuestion={questionSeed}
          onOpenUpgrade={openUpgrade}
          onConfigureAi={openAiSettings}
          onSavedNote={() => { onSavedNote?.(); }}
          composerBottomClass="pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        />
      ) : null}

      {view === "study" ? (
        <AiStudyModeView ai={ai} onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings} onAsk={askAbout} onWeakTopics={() => setView("weak")} />
      ) : null}

      {view === "practice" ? (
        <AiQuestionsView ai={ai} onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings} onOpenWeakTopics={() => setView("weak")} />
      ) : null}

      {view === "summary" ? (
        <AiSummaryView ai={ai} uid={uid || ""} productId={productId} moduleId={String(moduleId || storageModuleId || "")}
          resourceTitle={resourceTitle} onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings}
          onSavedNote={() => { onSavedNote?.(); }} onSummarizeResource={summariseResource} />
      ) : null}

      {view === "flashcards" ? <AiFlashcardsView ai={ai} onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings} /> : null}

      {view === "weak" ? <AiWeakTopicsView ai={ai} onPractice={() => setView("practice")} onAsk={askAbout} onStudyMode={() => setView("study")} /> : null}

      {view === "plan" ? (
        <AiStudyPlanView ai={ai} uid={uid || ""} productId={productId} moduleId={String(moduleId || storageModuleId || "")}
          onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings} onSavedNote={() => { onSavedNote?.(); }} />
      ) : null}

      {view === "sources" ? <AiSourcesView ai={ai} onOpenUpgrade={openUpgrade} onConfigureAi={openAiSettings} /> : null}

      <p className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[9px] font-bold uppercase tracking-[0.14em] text-white/25">
        <Sparkles size={11} /> Digitalcatalyst AI · only your material · only what it could read
      </p>
    </AiOverlay>
  );
}
