// Student-facing bulk importer (moved here from the admin panel).
//
// The learner pastes questions in plain text, the parser detects options and
// correct answers automatically, and one tap turns everything into a
// ready-to-take test on their dashboard. No subject/topic selection needed —
// the test is created directly.

import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, SecondaryButton } from "../components/ui";
import { BookOpenIcon, CheckIcon, ChevronRightIcon, SparklesIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { parseQuestionText, type ParsedQuestion } from "../engine/bulkParser";
import { createCustomTest, deleteCustomTestLocal } from "../engine/customTestService";
import {
  persistCustomTestToBank,
  releaseRevisionTestSlot,
  reserveRevisionTestSlotOrOffline,
  RevisionCloudError,
  type RevisionBankStatus,
} from "../engine/cloudRevisionService";
import TestBankLimitGate from "../components/TestBankLimitGate";

type Props = { uid: string; route: string; hasAccess?: boolean; onRequireAccess?: () => boolean };

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

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

type PreviewItem = ParsedQuestion & { key: string };

export default function BulkImportPage({ uid, route, hasAccess = true, onRequireAccess }: Props) {
  const { navigate } = useExitGuard();
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
      setNotice(`The Test Bank supports up to 100 questions per saved test. The first 100 were imported for review.`);
      setNoticeTone("info");
    } else if (missing > 0) {
      setNotice(`${missing} question(s) had no detected correct answer — mark them below before creating the test.`);
      setNoticeTone("info");
    } else {
      setNotice(`${accepted.length} questions parsed. Review below, then create your test.`);
      setNoticeTone("info");
    }
  };

  const patch = (key: string, partial: Partial<ParsedQuestion>) => {
    setPreview((items) => items.map((q) => (q.key === key ? { ...q, ...partial } : q)));
  };
  const removeItem = (key: string) => setPreview((items) => items.filter((q) => q.key !== key));

  const createTest = async () => {
    if (preview.length === 0 || saving) return;
    if (onRequireAccess && !onRequireAccess()) return;
    if (!hasAccess) return;
    if (undetected > 0) {
      setNotice(`${undetected} question(s) still have no correct answer marked. Tap the right option on each.`);
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
      setReady({ testId: created.testId, count: preview.length, pendingSync: persisted.status === "local" });
      setPreview([]);
      setText("");
      setNotice(null);
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

  return (
    <PageShell route={route} title="Bulk Import" subtitle="Paste a full revision plan" backHref="#/revision/profile">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-10">
        {ready ? (
          <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                <CheckIcon className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Test created! 🎉</h2>
                <p className="mt-1 text-xs text-slate-600">{ready.count} questions imported — saved to your Test Bank and live on your dashboard.</p>
                {ready.pendingSync && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">
                    Saved on this device. Cloud sync will finish automatically when you are online.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate("#/revision")}
                className="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-[15px] font-bold text-white shadow-lg shadow-emerald-200 transition active:scale-[0.98]"
              >
                Click & submit your score <ChevronRightIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => navigate("#/revision/bank")}
                className="flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-white text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"
              >
                Open Test Bank
              </button>
              <button
                type="button"
                onClick={() => setReady(null)}
                className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
              >
                Import more questions
              </button>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
                  <BookOpenIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold text-slate-900">Paste your revision plan</h2>
                  <p className="text-xs text-slate-600">
                    Drop in a complete test — questions, options and correct answers. Generate them in ChatGPT,
                    Claude or anywhere else, then paste here to create a revision plan in one go.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500"
                  placeholder="Test name (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  rows={9}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-indigo-500"
                  placeholder={SAMPLE}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Format: “1. Question?” then “A. …”, “B. …”. Mark the right answer with ✓ / * / (correct) or an
                  “Answer: B” line.
                </p>
              </div>

              <div className="mt-3 flex gap-2">
                <SecondaryButton className="flex-1" onClick={parse} disabled={!text.trim()}>
                  Parse questions
                </SecondaryButton>
                <PrimaryButton className="flex-1" disabled={preview.length === 0} onClick={createTest}>
                  <SparklesIcon className="h-4 w-4" /> Create test ({preview.length})
                </PrimaryButton>
              </div>

              {notice && (
                <div
                  className={`mt-3 rounded-xl px-3 py-2.5 text-xs font-medium leading-relaxed ${
                    noticeTone === "err" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"
                  }`}
                >
                  {notice}
                </div>
              )}
            </Card>

            {preview.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Preview ({preview.length})</h3>
                  <span className="text-[11px] font-medium text-slate-500">Tap the correct answer where needed</span>
                </div>
                <div className="space-y-3">
                  {preview.map((q, qi) => (
                    <div key={q.key} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                          {qi + 1}
                        </span>
                        <textarea
                          rows={2}
                          className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-white"
                          value={q.prompt}
                          onChange={(e) => patch(q.key, { prompt: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(q.key)}
                          className="h-7 w-7 shrink-0 rounded-lg text-slate-500 active:bg-slate-100"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {q.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.key}`}
                              checked={q.correctIndex === i}
                              onChange={() => patch(q.key, { correctIndex: i, detected: true })}
                              className="h-4 w-4 shrink-0 accent-emerald-600"
                            />
                            <span className="w-5 shrink-0 text-xs font-bold text-slate-600">{OPTION_LETTERS[i]}</span>
                            <input
                              className={`w-full rounded-lg border px-2 py-1 text-sm outline-none ${
                                i === q.correctIndex
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : "border-slate-300 bg-white text-slate-800 focus:border-slate-500"
                              }`}
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
                      {q.correctIndex < 0 && (
                        <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                          Correct answer not detected — tap it above.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <PrimaryButton className="mt-3" disabled={preview.length === 0 || saving} onClick={() => void createTest()}>
                  <CheckIcon className="h-4 w-4" /> {saving ? "Saving securely…" : `Create test with ${preview.length} question${preview.length === 1 ? "" : "s"}`}
                </PrimaryButton>
              </Card>
            )}
          </>
        )}
      </div>
      <TestBankLimitGate
        open={Boolean(bankGate)}
        bank={bankGate}
        onClose={() => setBankGate(null)}
        onManageBank={() => navigate("#/revision/bank")}
        onExplorePlans={() => navigate("#/subscription")}
      />
    </PageShell>
  );
}
