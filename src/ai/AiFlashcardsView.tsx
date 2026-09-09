// src/ai/AiFlashcardsView.tsx
//
// "Generate Flashcards" — a deliberately lightweight deck over the module's
// readable content: front / back, reveal, next / previous, shuffle and a
// progress indicator. Advanced spaced repetition is explicitly out of scope for
// this phase; a "Got it / Missed it" pair only feeds weak-topic evidence.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Layers, Shuffle, X } from "lucide-react";
import { cn } from "../utils/cn";
import { toast } from "../components/ui/glass-toast";
import {
  AiActionButton, AiBusyRow, AiCoverageLine, AiEmptyState, AiFailureBanner,
  AiPill, AiSectionCard, AiSourceChips,
} from "./components";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiFlashcards } from "./types";

const COUNTS = [8, 12, 20, 30];

interface Props {
  ai: ModuleAiController;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
}

export default function AiFlashcardsView({ ai, onOpenUpgrade, onConfigureAi }: Props) {
  const [count, setCount] = useState(12);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [seen, setSeen] = useState<Record<string, "known" | "missed">>({});
  const generated = ai.flashcards;
  const cards = generated?.payload.cards || [];
  const deckId = useMemo(() => cards.map((card) => card.id).join(","), [cards]);

  useEffect(() => {
    setOrder(cards.map((_, position) => position));
    setIndex(0);
    setRevealed(false);
    setSeen({});
  }, [deckId]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback((force = false) => {
    setSeen({});
    setIndex(0);
    setRevealed(false);
    void ai.generate<PersonalAiFlashcards>("flashcards", { count, force });
  }, [ai, count]);

  const position = order.length ? order[Math.min(index, order.length - 1)] : 0;
  const card = cards[position];
  const reviewed = Object.keys(seen).length;

  const advance = (delta: number) => {
    if (!cards.length) return;
    setRevealed(false);
    setIndex((current) => (current + delta + cards.length) % cards.length);
  };

  const shuffle = () => {
    if (cards.length < 2) return;
    setOrder((current) => {
      const next = [...current];
      for (let cursor = next.length - 1; cursor > 0; cursor -= 1) {
        const swap = Math.floor(Math.random() * (cursor + 1));
        [next[cursor], next[swap]] = [next[swap], next[cursor]];
      }
      return next;
    });
    setIndex(0);
    setRevealed(false);
  };

  const mark = async (result: "known" | "missed") => {
    if (!card) return;
    setSeen((current) => ({ ...current, [card.id]: result }));
    if (result === "missed" && card.topic) {
      await ai.recordEvidence("flashcard_missed", card.topic, ai.snapshot?.scope.resourceId || null);
    }
    if (reviewed + 1 >= cards.length) {
      const missed = Object.values({ ...seen, [card.id]: result }).filter((row) => row === "missed").length;
      toast({
        title: "Deck complete",
        description: missed ? `${cards.length - missed} known · ${missed} to revise again` : `All ${cards.length} cards known`,
        variant: missed ? "info" : "success",
      });
    }
    advance(1);
  };

  const progress = cards.length ? Math.round((reviewed / cards.length) * 100) : 0;

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiFailureBanner failure={ai.failure?.scope === "flashcards" ? ai.failure : null}
          onRetry={() => generate(true)} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

        <AiSectionCard
          title="Flashcards"
          hint="Concise front / back cards from this module's readable content."
          action={
            <AiActionButton label={cards.length ? "Regenerate" : "Generate flashcards"} icon={Layers} tone={cards.length ? "default" : "primary"}
              busy={ai.busy?.kind === "flashcards"} onClick={() => generate(Boolean(cards.length))} dataAttrs={{ "data-module-ai-generate-flashcards": "" }} />
          }
        >
          {ai.snapshot?.coverage ? <AiCoverageLine coverage={ai.snapshot.coverage} className="mb-3" /> : null}
          <div className="flex flex-wrap gap-1">
            {COUNTS.map((option) => (
              <button key={option} type="button" onClick={() => setCount(option)} disabled={Boolean(ai.busy)}
                className={cn("min-h-10 rounded-full px-3.5 text-[11px] font-black ring-1 transition disabled:opacity-40",
                  count === option ? "bg-violet-600 text-white ring-violet-400/40" : "bg-white/[0.05] text-white/65 ring-white/10")}>
                {option} cards
              </button>
            ))}
          </div>
          {ai.busy?.kind === "flashcards" ? <AiBusyRow className="mt-3" label={ai.busy.label} /> : null}
          {!cards.length && ai.busy?.kind !== "flashcards" ? (
            <AiEmptyState className="mt-3" icon={Layers} title="No flashcards yet"
              message={ai.hasReadableContent ? "Generate a deck and flip through it — reveal, next, previous and shuffle." : "This module has no readable content yet, so cards would be invented rather than grounded."}
              action={<AiActionButton label={`Generate ${count} flashcards`} tone="primary" onClick={() => generate(false)} disabled={!ai.hasReadableContent} />} />
          ) : null}
        </AiSectionCard>

        {card ? (
          <AiSectionCard
            title="Study the deck"
            hint={generated?.authoredOnly ? "Built from your titles, descriptions and notes — no file content could be read." : undefined}
            action={<div className="flex items-center gap-1.5"><AiPill tone="violet">{Math.min(index + 1, cards.length)} / {cards.length}</AiPill><AiPill>{progress}% reviewed</AiPill></div>}
          >
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div
              className="min-h-[190px] rounded-3xl border border-violet-400/20 bg-violet-500/[0.07] p-5 sm:min-h-[220px]"
              data-module-ai-flashcard=""
              data-revealed={revealed ? "true" : "false"}
            >
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">{revealed ? "Answer" : "Question"}</p>
              <p className="mt-2 break-words text-[15px] font-black leading-6 text-white sm:text-base">{revealed ? card.back : card.front}</p>
              {revealed ? (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Prompt</p>
                  <p className="mt-1 break-words text-[12px] font-bold leading-5 text-white/60">{card.front}</p>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {card.topic ? <AiPill tone="cyan">{card.topic}</AiPill> : null}
                {seen[card.id] ? <AiPill tone={seen[card.id] === "known" ? "emerald" : "amber"}>{seen[card.id] === "known" ? "Known" : "Revise again"}</AiPill> : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AiActionButton label="Previous" icon={ArrowLeft} onClick={() => advance(-1)} className="w-full" />
              {revealed ? (
                <>
                  <AiActionButton label="Got it" icon={Check} tone="primary" className="w-full" busy={ai.busy?.kind === "evidence"} onClick={() => void mark("known")} dataAttrs={{ "data-ai-flashcard-known": card.id }} />
                  <AiActionButton label="Missed it" icon={X} className="w-full" onClick={() => void mark("missed")} dataAttrs={{ "data-ai-flashcard-missed": card.id }} />
                </>
              ) : (
                <AiActionButton label="Reveal answer" icon={Check} tone="primary" className="w-full" onClick={() => setRevealed(true)} dataAttrs={{ "data-ai-flashcard-reveal": card.id }} />
              )}
              <AiActionButton label="Next" icon={ArrowRight} onClick={() => advance(1)} className="w-full" />
              <AiActionButton label="Shuffle" icon={Shuffle} onClick={shuffle} className="w-full sm:col-span-1 col-span-2" />
            </div>
            {reviewed === cards.length && cards.length > 0 ? (
              <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5 text-[11px] font-bold leading-4 text-emerald-100">
                Deck complete — {Object.values(seen).filter((row) => row === "missed").length} card(s) marked to revise again.
              </p>
            ) : null}
            {generated ? <AiSourceChips className="mt-3 border-t border-white/[0.07] pt-3" sources={generated.sources} title="Grounded in" /> : null}
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}
