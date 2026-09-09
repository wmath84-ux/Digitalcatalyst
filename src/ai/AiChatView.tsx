// src/ai/AiChatView.tsx
//
// "Ask this Module" — the grounded chat surface for ONE personal module (or one
// resource inside it). Every answer renders the provenance the server resolved,
// the honest coverage line, and the resources the AI could NOT read, so the
// learner always knows how much of their material actually backed the answer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkPlus, ChevronDown, Copy, HelpCircle, Lightbulb, MessageCircleQuestion,
  RotateCcw, Send, Sparkles, TriangleAlert,
} from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import { cn } from "../utils/cn";
import {
  AiActionButton, AiBusyRow, AiCoverageLine, AiEmptyState, AiFailureBanner, AiProse,
  AiSourceChips, useStickToBottom,
} from "./components";
import { saveAiNote } from "./aiNotes";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiThreadMessage } from "./types";

const EXPLAIN_MODES: { id: "simple" | "steps" | "example" | "exam"; label: string; hint: string }[] = [
  { id: "simple", label: "Simple explanation", hint: "Plain words, no jargon" },
  { id: "steps", label: "Step by step", hint: "One small idea per step" },
  { id: "example", label: "With an example", hint: "A worked example" },
  { id: "exam", label: "Exam-style", hint: "How an examiner wants it" },
];

const STARTER_PROMPTS = [
  "What is the main concept explained in this module?",
  "Explain the most important definition here",
  "Which formulas or facts must I remember?",
  "What should I revise first?",
];

const RESOURCE_PROMPTS = [
  "What are the key ideas in this resource?",
  "Summarize this in 5 bullet points",
  "What should I remember from this?",
];

interface Props {
  ai: ModuleAiController;
  uid: string;
  productId?: string | null;
  moduleId: string;
  resourceTitle?: string;
  initialQuestion?: string;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  onSavedNote?: () => void;
  composerBottomClass?: string;
}

export default function AiChatView({
  ai, uid, productId, moduleId, resourceTitle, initialQuestion, onOpenUpgrade, onConfigureAi, onSavedNote, composerBottomClass,
}: Props) {
  const [draft, setDraft] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [explainFor, setExplainFor] = useState<string | null>(null);
  const [explainMode, setExplainMode] = useState<"simple" | "steps" | "example" | "exam">("simple");
  const [sentOnce, setSentOnce] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const askedRef = useRef(false);
  const coarsePointer = useMemo(() => {
    try { return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
  }, []);
  const messages = ai.messages;
  const stick = useStickToBottom<HTMLDivElement>(`${messages.length}:${pendingQuestion}:${ai.answer?.at || 0}`);

  // Auto-grow the composer without ever letting it eat the message list.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(140, Math.max(44, node.scrollHeight))}px`;
  }, [draft]);

  const send = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || ai.busy) return;
    setPendingQuestion(trimmed);
    setDraft("");
    setSentOnce(true);
    const result = await ai.ask(trimmed);
    setPendingQuestion(null);
    if (result && !result.grounded) {
      toast({ title: "Answered from limited material", description: "The readable content didn't fully cover this question.", variant: "info" });
    }
  }, [ai]);

  // "Ask AI about this" from the resource viewer arrives with a pre-filled
  // question; fire it exactly once per open.
  useEffect(() => {
    if (!initialQuestion || askedRef.current || ai.phase !== "ready" || ai.busy) return;
    askedRef.current = true;
    void send(initialQuestion);
  }, [ai.busy, ai.phase, initialQuestion, send]);

  useEffect(() => { askedRef.current = false; }, [moduleId, ai.snapshot?.scope.resourceId]);

  const gate = useMemo(() => {
    if (ai.phase !== "ready") return null;
    const info = ai.snapshot?.ai;
    if (!info) return null;
    if (!info.hasAccess) {
      return {
        title: "AI study needs an active plan",
        message: info.blockedReason || "Your plan's AI allowance isn't active. Renew or upgrade to ask your modules questions.",
        primaryLabel: "View subscription plans",
        onPrimary: onOpenUpgrade,
        tone: "amber" as const,
      };
    }
    if (!info.configured) {
      return {
        title: "No AI is connected yet",
        message: "Connect your own AI provider (Gemini, OpenAI, Claude, Groq or any OpenAI-compatible API), or ask your institute to publish the shared AI. Your module content is only ever sent to the provider you choose.",
        primaryLabel: "Configure AI",
        onPrimary: onConfigureAi,
        tone: "violet" as const,
      };
    }
    if (!ai.hasReadableContent) {
      return {
        title: "Nothing readable in this module yet",
        message: "I can see your resources, but I couldn't read any content to ground an answer in. Add a description to a resource, save a note, or open a readable file (a PDF, or a Google Doc shared with 'anyone with the link').",
        primaryLabel: undefined,
        onPrimary: undefined,
        tone: "amber" as const,
      };
    }
    return null;
  }, [ai.hasReadableContent, ai.phase, ai.snapshot?.ai, onConfigureAi, onOpenUpgrade]);

  const prompts = resourceTitle ? RESOURCE_PROMPTS : STARTER_PROMPTS;
  const unreadable = ai.snapshot?.unreadable || [];
  const busyAsk = ai.busy?.kind === "ask";

  const saveAsNote = (message: PersonalAiThreadMessage) => {
    const saved = saveAiNote({
      uid,
      productId,
      moduleId,
      resourceId: message.resourceId,
      title: ai.snapshot?.scope.title || "My module",
      body: message.text,
      kind: "answer",
    });
    if (saved) {
      toast({ title: "Saved to your notes", description: "Marked as AI-generated — your own notes were not changed.", variant: "success" });
      onSavedNote?.();
    } else {
      toast({ title: "Nothing to save", variant: "info" });
    }
  };

  const dontUnderstand = async (message: PersonalAiThreadMessage) => {
    const topic = message.sources[0]?.label || message.text.slice(0, 60) || "This topic";
    await ai.recordEvidence("dont_understand", topic, message.resourceId);
    toast({ title: "Noted as a weak topic", description: `Keep going — “${topic}” will show up in Weak Topics.`, variant: "info" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-module-ai-chat="">
      <div ref={stick.ref} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4" data-module-ai-messages="">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <AiFailureBanner failure={ai.failure} onRetry={() => void ai.reload()} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

          {ai.phase === "loading" && !messages.length ? <AiBusyRow label="Reading your module" /> : null}
          {ai.phase === "error" && !messages.length ? (
            <AiEmptyState
              icon={TriangleAlert}
              title="The AI workspace couldn't open"
              message={ai.failure?.message || "Something went wrong while reading this module."}
              action={<AiActionButton label="Try again" icon={RotateCcw} tone="primary" onClick={() => void ai.reload()} />}
            />
          ) : null}

          {ai.phase === "ready" && !messages.length && !gate ? (
            <div className="space-y-3" data-module-ai-intro="">
              <div className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.07] p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-violet-200">
                  <Sparkles size={14} /> {resourceTitle ? "Ask about this resource" : "Your AI tutor for this module"}
                </p>
                <p className="mt-2 text-[13px] font-medium leading-6 text-white/75">
                  {resourceTitle
                    ? `Questions here are scoped to “${resourceTitle}” first. I only use content I could actually read from it.`
                    : "Ask anything about the material in this module. I answer only from what I could actually read, and I show you exactly which resource each part came from."}
                </p>
                {ai.coverageSentence ? <AiCoverageLine coverage={ai.snapshot!.coverage} className="mt-2.5" /> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    disabled={Boolean(ai.busy)}
                    className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-left text-xs font-bold text-white/75 transition hover:bg-white/[0.08] disabled:opacity-45"
                  >
                    <MessageCircleQuestion size={14} className="shrink-0 text-violet-300" />
                    <span className="min-w-0 flex-1">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {gate ? (
            <AiEmptyState icon={gate.tone === "amber" ? TriangleAlert : Sparkles} title={gate.title} message={gate.message}
              action={gate.primaryLabel && gate.onPrimary
                ? <AiActionButton label={gate.primaryLabel} tone="primary" onClick={gate.onPrimary} />
                : undefined} />
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                "rounded-3xl border p-3.5 sm:p-4",
                message.role === "user" ? "border-white/10 bg-white/[0.05] sm:ml-10" : "border-violet-400/15 bg-violet-500/[0.06]",
              )}
              data-ai-message={message.role}
            >
              <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
                {message.role === "user" ? "You" : resourceTitle ? `AI · ${resourceTitle}` : "AI tutor"}
              </p>
              {message.role === "assistant" ? <AiProse text={message.text} /> : <p className="whitespace-pre-wrap break-words text-[13px] font-medium leading-[1.65] text-white/85">{message.text}</p>}
              {message.role === "assistant" && !message.grounded ? (
                <p className="mt-2.5 flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] font-bold leading-4 text-amber-100">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  <span>This wasn't covered by the readable content in this module, so treat it as a pointer rather than a fact from your material.</span>
                </p>
              ) : null}
              {message.role === "assistant" && message.sources.length ? (
                <AiSourceChips className="mt-3" sources={message.sources.map((source) => ({
                  unitId: source.unitId, scope: "resource" as const, resourceId: null, label: source.label,
                  provenance: source.provenance, kind: "", originKind: "personal",
                }))} />
              ) : null}
              {message.role === "assistant" ? (
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/[0.07] pt-2.5">
                  <div className="relative">
                    <AiActionButton
                      label="Explain again"
                      icon={Lightbulb}
                      tone="ghost"
                      busy={Boolean(ai.busy?.kind === "explain")}
                      onClick={() => { setExplainFor(explainFor === message.id ? null : message.id); setExplainMode("simple"); }}
                      dataAttrs={{ "data-ai-explain-again": message.id }}
                    />
                    {explainFor === message.id ? (
                      <div className="absolute left-0 top-full z-20 mt-1.5 w-60 rounded-2xl border border-white/12 bg-[#101020]/98 p-2 shadow-2xl backdrop-blur-xl" data-ai-explain-menu="">
                        <p className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/35">Explain it differently</p>
                        {EXPLAIN_MODES.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => {
                              setExplainMode(mode.id);
                              setExplainFor(null);
                              const lastUser = [...messages].reverse().find((row) => row.role === "user");
                              void ai.explainAgain({
                                question: lastUser?.text || message.text.slice(0, 200),
                                answer: message.text,
                                mode: mode.id,
                              }).then((result) => {
                                if (result) toast({ title: `Explained · ${mode.label}`, variant: "success" });
                              });
                            }}
                            className={cn(
                              "flex w-full min-h-11 items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition",
                              explainMode === mode.id ? "bg-violet-500/20 text-violet-100" : "text-white/70 hover:bg-white/[0.06]",
                            )}
                          >
                            <span className="min-w-0"><span className="block truncate text-[11px] font-black">{mode.label}</span><span className="block truncate text-[10px] font-medium text-white/40">{mode.hint}</span></span>
                            <ChevronDown size={13} className="shrink-0 rotate-[-90deg] text-white/25" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <AiActionButton label="I don't understand" icon={HelpCircle} tone="ghost" onClick={() => void dontUnderstand(message)} dataAttrs={{ "data-ai-dont-understand": message.id }} />
                  <AiActionButton label="Save as note" icon={BookmarkPlus} tone="ghost" onClick={() => saveAsNote(message)} dataAttrs={{ "data-ai-save-note": message.id }} />
                  <AiActionButton
                    label="Copy"
                    icon={Copy}
                    tone="ghost"
                    onClick={() => {
                      try { void navigator.clipboard?.writeText(message.text); toast({ title: "Answer copied", variant: "success" }); }
                      catch { toast({ title: "Copying isn't available here", variant: "error" }); }
                    }}
                  />
                </div>
              ) : null}
            </article>
          ))}

          {pendingQuestion ? (
            <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-3.5 sm:ml-10 sm:p-4" data-ai-message="pending-user">
              <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">You</p>
              <p className="whitespace-pre-wrap break-words text-[13px] font-medium leading-[1.65] text-white/85">{pendingQuestion}</p>
            </article>
          ) : null}
          {busyAsk ? <AiBusyRow label={ai.busy?.label || "Thinking"} /> : null}

          {ai.explanation ? (
            <article className="rounded-3xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3.5 sm:p-4" data-ai-explanation="">
              <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">
                <Lightbulb size={12} /> Explained again · {EXPLAIN_MODES.find((mode) => mode.id === explainMode)?.label || "Simple"}
              </p>
              <AiProse text={ai.explanation.explanation} />
              {ai.explanation.keyPoint ? (
                <p className="mt-2.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-bold leading-4 text-white/75">
                  Remember: {ai.explanation.keyPoint}
                </p>
              ) : null}
              {!ai.explanation.grounded ? (
                <p className="mt-2 text-[11px] font-bold leading-4 text-amber-200">This concept isn't really covered by the readable content here.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1 border-t border-white/[0.07] pt-2.5">
                {EXPLAIN_MODES.map((mode) => (
                  <AiActionButton
                    key={mode.id}
                    label={mode.label}
                    tone="ghost"
                    active={explainMode === mode.id}
                    busy={Boolean(ai.busy?.kind === "explain")}
                    onClick={() => {
                      setExplainMode(mode.id);
                      const lastUser = [...messages].reverse().find((row) => row.role === "user");
                      void ai.explainAgain({ question: lastUser?.text || "", answer: ai.answer?.answer, mode: mode.id });
                    }}
                  />
                ))}
                <AiActionButton
                  label="Save as note"
                  icon={BookmarkPlus}
                  tone="ghost"
                  onClick={() => {
                    const saved = saveAiNote({ uid, productId, moduleId, resourceId: ai.answer?.sourceDetails?.[0]?.resourceId || null, title: "AI explanation", body: ai.explanation!.explanation, kind: "explanation" });
                    if (saved) { toast({ title: "Saved to your notes", variant: "success" }); onSavedNote?.(); }
                  }}
                />
              </div>
            </article>
          ) : null}

          {ai.answer?.followUps?.length ? (
            <div className="flex flex-wrap gap-1.5" data-ai-followups="">
              {ai.answer.followUps.map((followUp) => (
                <button key={followUp} type="button" onClick={() => void send(followUp)} disabled={Boolean(ai.busy)}
                  className="min-h-10 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-[11px] font-bold text-white/70 disabled:opacity-40">
                  {followUp}
                </button>
              ))}
            </div>
          ) : null}

          {unreadable.length && sentOnce ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-ai-unreadable="">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Not used in this answer</p>
              <ul className="mt-1.5 space-y-1">
                {unreadable.slice(0, 5).map((row) => (
                  <li key={row.id} className="flex items-start gap-2 text-[11px] font-medium leading-4 text-white/50">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-300/70" />
                    <span><span className="font-black text-white/70">{row.name}</span> — {row.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {!gate ? (
        <div className={cn("shrink-0 border-t border-white/10 bg-[#0b0b16]/95 px-3 pt-2.5 sm:px-5", composerBottomClass)} data-module-ai-composer="">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-3xl border border-white/12 bg-white/[0.05] p-2 focus-within:border-violet-400/50">
              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (event.shiftKey) return;
                  if (coarsePointer) return; // phones: Enter makes a new line, the button sends
                  event.preventDefault();
                  void send(draft);
                }}
                disabled={Boolean(ai.busy)}
                placeholder={resourceTitle ? `Ask about “${resourceTitle}”…` : "Ask about this module…"}
                aria-label="Ask the AI about this module"
                className="max-h-[140px] min-h-11 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[13px] font-semibold leading-5 text-white outline-none placeholder:text-white/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={!draft.trim() || Boolean(ai.busy)}
                aria-label="Send question"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:opacity-35"
                data-module-ai-send=""
              >
                {ai.busy?.kind === "ask" ? <RotateCcw size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="py-2 text-[10px] font-medium leading-4 text-white/30">
              Answers come only from what the AI could read in this module{ai.snapshot ? ` · ${ai.snapshot.coverage.readable}/${ai.snapshot.coverage.total} resources readable` : ""}. Ask again if a file was still being read.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
