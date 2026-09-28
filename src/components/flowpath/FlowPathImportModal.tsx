// src/components/flowpath/FlowPathImportModal.tsx
//
// Direct import-test overlay for FlowPath — user can import tests without leaving the page.
// Flexible responsive design for mobile/tablet/desktop.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Check, FileUp, Sparkles, X } from "lucide-react";
import { GlassSurface } from "../ui/glass";
import { GlassButton } from "../ui/glass-button";
import { GlassCard } from "../ui/GlassCard";
import { parseQuestionText, type ParsedQuestion } from "../../revision/engine/bulkParser";
import { createCustomTest, deleteCustomTestLocal } from "../../revision/engine/customTestService";
import {
  persistCustomTestToBank,
  releaseRevisionTestSlot,
  reserveRevisionTestSlotOrOffline,
  RevisionCloudError,
  type RevisionBankStatus,
} from "../../revision/engine/cloudRevisionService";
import TestBankLimitGate from "../../revision/components/TestBankLimitGate";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type PreviewItem = ParsedQuestion & { key: string };

interface Props {
  open: boolean;
  uid: string;
  onClose: () => void;
  onCreated?: (testId: number, title: string, count: number) => void;
}

const SAMPLE = `1. What is the capital of France?
A. London
B. Paris ✓
C. Berlin
D. Madrid
Explanation: Paris is the capital.

2. Which gas do plants absorb?
A) Oxygen
B) Carbon dioxide *
C) Nitrogen
D) Hydrogen`;

export default function FlowPathImportModal({ open, uid, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "err">("info");
  const [saving, setSaving] = useState(false);
  const [bankGate, setBankGate] = useState<RevisionBankStatus | null>(null);
  const [ready, setReady] = useState<{ testId: number; count: number; pendingSync: boolean } | null>(null);

  const undetected = useMemo(() => preview.filter((p) => p.correctIndex < 0).length, [preview]);

  const parse = () => {
    setNotice(null);
    const parsed = parseQuestionText(text);
    if (parsed.length === 0) {
      setNotice("No questions found. Check the format and try again.");
      setNoticeTone("err");
      return;
    }
    const accepted = parsed.slice(0, 100);
    setPreview(accepted.map((p) => ({ ...p, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })));
    const missing = accepted.filter((p) => !p.detected).length;
    if (parsed.length > 100) {
      setNotice(`Test Bank supports up to 100 questions per test. First 100 imported.`);
      setNoticeTone("info");
    } else if (missing > 0) {
      setNotice(`${missing} question(s) had no detected correct answer — mark them below.`);
      setNoticeTone("info");
    } else {
      setNotice(`${accepted.length} questions parsed. Review below, then create.`);
      setNoticeTone("info");
    }
  };

  const patch = (key: string, partial: Partial<ParsedQuestion>) => {
    setPreview((items) => items.map((q) => (q.key === key ? { ...q, ...partial } : q)));
  };
  const removeItem = (key: string) => setPreview((items) => items.filter((q) => q.key !== key));

  const createTest = async () => {
    if (preview.length === 0 || saving) return;
    if (undetected > 0) {
      setNotice(`${undetected} question(s) still have no correct answer marked.`);
      setNoticeTone("err");
      return;
    }
    setSaving(true);
    setNotice(null);
    let reservationId = "";
    let createdTestId: number | null = null;
    try {
      const reservation = await reserveRevisionTestSlotOrOffline(uid);
      reservationId = reservation.reservationId;
      const cleanTitle = title.trim() || "My Imported Test";
      const created = createCustomTest(uid, {
        title: cleanTitle,
        estimatedMinutes: Math.max(2, Math.ceil(preview.length * 0.75)),
        source: "bulk",
        questions: preview.map((p) => ({
          prompt: p.prompt,
          options: p.options,
          correctIndex: p.correctIndex,
          explanation: p.explanation,
          difficulty: "medium",
          subjectName: "My Imports",
          topicName: cleanTitle,
        })),
      });
      createdTestId = created.testId;
      const persisted = await persistCustomTestToBank(uid, created.testId, reservationId);
      const result = { testId: created.testId, count: preview.length, pendingSync: persisted.status === "local" };
      setReady(result);
      setPreview([]);
      setText("");
      setNotice(null);
      onCreated?.(created.testId, cleanTitle, preview.length);
    } catch (err) {
      if (createdTestId !== null) deleteCustomTestLocal(uid, createdTestId);
      if (reservationId) await releaseRevisionTestSlot(uid, reservationId);
      if (err instanceof RevisionCloudError && err.code === "TEST_BANK_FULL" && err.bank) {
        setBankGate(err.bank);
      } else {
        setNotice(err instanceof Error ? err.message : "Could not save the test securely.");
        setNoticeTone("err");
      }
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col sm:max-h-[85vh] sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl"
          >
            <GlassSurface radius={24} className="flex flex-col overflow-hidden text-white" contentClassName="flex flex-col overflow-hidden p-0">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5 md:px-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30 md:h-11 md:w-11">
                  <FileUp className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black leading-tight md:text-lg">Import Test</h2>
                  <p className="text-[11px] text-white/60 md:text-xs">Paste questions directly here — no need to leave FlowPath</p>
                </div>
                <GlassButton onClick={onClose} className="[&_.size-12]:size-8" aria-label="Close">
                  <X className="h-4 w-4" />
                </GlassButton>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                {ready ? (
                  <div className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg md:h-20 md:w-20">
                      <Check className="h-8 w-8 md:h-10 md:w-10" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-white md:text-xl">Test created! 🎉</h3>
                      <p className="mt-1 text-xs text-white/75 md:text-sm">{ready.count} questions imported — saved to Test Bank and scheduled on your flow.</p>
                      {ready.pendingSync && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-200 md:text-xs">Saved on device. Cloud sync will finish when online.</p>
                      )}
                    </div>
                    <div className="mt-2 grid w-full gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReady(null);
                          onClose();
                        }}
                        className="flex min-h-[48px] items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.98] md:text-[15px]"
                      >
                        Done — back to flow
                      </button>
                      <button
                        type="button"
                        onClick={() => setReady(null)}
                        className="flex min-h-[48px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 md:text-[15px]"
                      >
                        Import more
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 sm:p-5 md:space-y-5 md:p-6">
                    {/* Info card */}
                    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:p-4">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white md:h-10 md:w-10">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white md:text-[15px]">Paste your revision plan</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-white/60 md:text-xs md:leading-6">
                          Drop in a complete test — questions, options and correct answers. Generate in ChatGPT, Claude or anywhere, then paste here. Test will be created and scheduled on your flow stairs directly.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input
                        className="dc-field h-11 w-full rounded-xl border px-3 text-sm font-medium outline-none md:h-12 md:text-[15px]"
                        placeholder="Test name (optional) — e.g. Physics Ch 4"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                      <textarea
                        rows={6}
                        className="dc-field w-full rounded-xl border p-3 font-mono text-xs leading-relaxed outline-none sm:rows-7 md:rows-8 md:text-sm"
                        placeholder={SAMPLE}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                      <p className="text-[10px] leading-relaxed text-white/50 md:text-[11px]">
                        Format: “1. Question?” then “A. …”, “B. …”. Mark correct with ✓ / * / (correct) or “Answer: B” line.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={parse}
                        disabled={!text.trim()}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50 md:min-h-[48px] md:text-[15px]"
                      >
                        <Sparkles className="h-4 w-4" /> Parse questions
                      </button>
                      <button
                        type="button"
                        disabled={preview.length === 0 || saving}
                        onClick={() => void createTest()}
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50 md:min-h-[48px] md:text-[15px]"
                      >
                        <Check className="h-4 w-4" /> Create test ({preview.length})
                      </button>
                    </div>

                    {notice && (
                      <div
                        className={`rounded-xl px-3 py-2.5 text-xs font-medium leading-relaxed md:text-sm ${noticeTone === "err" ? "bg-rose-500/15 text-rose-200" : "bg-sky-500/15 text-sky-200"}`}
                      >
                        {notice}
                      </div>
                    )}

                    {preview.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white md:text-[15px]">Preview ({preview.length})</h3>
                          <span className="text-[11px] font-medium text-white/55 md:text-xs">Tap correct answer where needed</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-1">
                          {preview.map((q, qi) => (
                            <GlassCard key={q.key} contentClassName="p-3 md:p-4">
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-[11px] font-bold text-white md:h-7 md:w-7 md:text-xs">
                                  {qi + 1}
                                </span>
                                <textarea
                                  rows={2}
                                  className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-white outline-none focus:border-white/15 md:text-[15px]"
                                  value={q.prompt}
                                  onChange={(e) => patch(q.key, { prompt: e.target.value })}
                                />
                                <GlassButton type="button" onClick={() => removeItem(q.key)} aria-label="Remove" className="shrink-0 [&_.size-12]:size-7 text-white/70">
                                  ✕
                                </GlassButton>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {q.options.map((opt, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input type="radio" name={`correct-${q.key}`} checked={q.correctIndex === i} onChange={() => patch(q.key, { correctIndex: i, detected: true })} className="h-4 w-4 shrink-0 accent-emerald-600" />
                                    <span className="w-5 shrink-0 text-xs font-bold text-white/75 md:text-sm">{OPTION_LETTERS[i]}</span>
                                    <input
                                      className={`w-full rounded-lg border px-2 py-1.5 text-sm outline-none md:py-2 md:text-[15px] ${i === q.correctIndex ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "dc-field"}`}
                                      value={opt}
                                      onChange={(e) => {
                                        const options = [...q.options];
                                        options[i] = e.target.value;
                                        patch(q.key, { options });
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {q.correctIndex < 0 && <p className="mt-1.5 text-[11px] font-semibold text-amber-300 md:text-xs">Correct answer not detected — tap it above.</p>}
                            </GlassCard>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!ready && (
                <div className="border-t border-white/10 p-3 sm:p-4 md:p-5">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex flex-1 min-h-[44px] items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10 md:min-h-[48px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={preview.length === 0 || saving}
                      onClick={() => void createTest()}
                      className="flex flex-1 min-h-[44px] items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50 md:min-h-[48px]"
                    >
                      {saving ? "Saving…" : `Create & schedule`}
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[10px] text-white/40 md:text-[11px]">Test will be saved to Test Bank and appear on your flow stairs</p>
                </div>
              )}
            </GlassSurface>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
