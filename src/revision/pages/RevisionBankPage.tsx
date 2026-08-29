import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  History,
  ListRestart,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import PageShell from "../components/PageShell";
import { Badge, Card, EmptyState, PrimaryButton, SecondaryButton } from "../components/ui";
import { BankIcon, FilterIcon, SearchIcon, SparklesIcon, XIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import {
  getAllSubjects,
  getRevisionBank,
  getRevisionSummary,
  startRevisionSession,
  ServiceError,
} from "../engine/revisionService";
import {
  deleteCustomTestLocal,
  listCustomTestAttempts,
  listCustomTests,
  startCustomTestRetake,
  startSkippedQuestionsRetake,
  type CustomTestAttemptSummary,
  type CustomTestListItem,
} from "../engine/customTestService";
import {
  deleteCustomTestFromCloud,
  fetchRevisionBankStatus,
  type RevisionBankStatus,
} from "../engine/cloudRevisionService";
import { questionModeLabel } from "../engine/questionMode";

type ViewTab = "tests" | "smart";
type StatusTab = "active" | "learning" | "improving" | "mastered" | "all";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "active", label: "Due" },
  { key: "learning", label: "Learning" },
  { key: "improving", label: "Improving" },
  { key: "mastered", label: "Mastered" },
  { key: "all", label: "All" },
];

function relativeDate(dateStr: string | null) {
  if (!dateStr) return "Not completed yet";
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function sourceLabel(source: string) {
  return source === "bulk" ? "Imported" : source === "ai" ? "AI generated" : "Saved test";
}

type Props = {
  uid: string;
  route: string;
  hasAccess?: boolean;
  onRequireAccess?: () => boolean;
};

export default function RevisionBankPage({ uid, route, hasAccess = true, onRequireAccess }: Props) {
  const { navigate } = useExitGuard();
  const [view, setView] = useState<ViewTab>("tests");
  const [dataVersion, setDataVersion] = useState(0);
  const [testSearch, setTestSearch] = useState("");
  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomTestListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bankStatus, setBankStatus] = useState<RevisionBankStatus | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (!detail?.uid || detail.uid === uid) setDataVersion((version) => version + 1);
    };
    window.addEventListener("revision-db-changed", refresh);
    return () => window.removeEventListener("revision-db-changed", refresh);
  }, [uid]);

  useEffect(() => {
    if (uid === "guest") return;
    let cancelled = false;
    void fetchRevisionBankStatus(uid)
      .then((status) => { if (!cancelled) setBankStatus(status); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [uid, dataVersion]);

  const savedTests = useMemo(() => listCustomTests(uid), [uid, dataVersion]);
  const visibleTests = useMemo(() => {
    const query = testSearch.trim().toLowerCase();
    if (!query) return savedTests;
    return savedTests.filter((test) =>
      [test.title, test.source, ...test.planDetails.subjectNames, ...test.planDetails.chapterNames, ...test.planDetails.topicNames]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [savedTests, testSearch]);

  const statusParam = statusTab === "active" ? undefined : statusTab;
  const bankData = useMemo(
    () => getRevisionBank(uid, {
      status: statusParam as "learning" | "improving" | "mastered" | "all" | undefined,
      search,
      sort: sort as "recent" | "oldest" | "difficulty" | "most_wrong" | "alphabetical",
      subjectId,
      difficulty: difficulty as "easy" | "medium" | "hard" | undefined,
    }),
    [uid, dataVersion, statusParam, search, sort, subjectId, difficulty],
  );
  const summary = useMemo(() => getRevisionSummary(uid), [uid, dataVersion]);
  const subjects = useMemo(() => getAllSubjects(uid), [uid, dataVersion]);

  const createNew = (href: string) => {
    if (onRequireAccess && !onRequireAccess()) return;
    if (!hasAccess) return;
    navigate(href);
  };

  const openAttempt = (attemptId: number) => navigate(`#/revision/test/play-attempt/${attemptId}`);

  const reviseAgain = (testId: number) => {
    setActionError(null);
    try {
      openAttempt(startCustomTestRetake(uid, testId).id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start another attempt.");
    }
  };

  const reviseSkipped = (testId: number) => {
    setActionError(null);
    try {
      openAttempt(startSkippedQuestionsRetake(uid, testId).id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start a skipped-question attempt.");
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      const nextStatus = await deleteCustomTestFromCloud(uid, deleting.id);
      deleteCustomTestLocal(uid, deleting.id);
      if (nextStatus) setBankStatus(nextStatus);
      setExpandedTest(null);
      setDeleting(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not permanently delete this test. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleStartSession = () => {
    // Smart Revision operates on already-owned learner data, so it remains
    // available after expiry/downgrade just like saved-test retakes.
    setStartingSession(true);
    setActionError(null);
    try {
      const session = startRevisionSession(uid, {
        subjectId,
        status: statusTab === "mastered" ? "mastered" : undefined,
      });
      navigate(`#/revision/session/${session.id}`);
    } catch (error) {
      setActionError(error instanceof ServiceError ? error.message : "Could not start a revision session.");
    } finally {
      setStartingSession(false);
    }
  };

  const activeFilterCount = [subjectId, difficulty].filter(Boolean).length;
  const used = bankStatus?.used ?? savedTests.length;
  const limit = bankStatus?.limit;
  const capacityLabel = limit === -1 ? `${used} saved · Unlimited` : limit == null ? `${used} saved` : `${used} of ${limit} saved`;

  return (
    <PageShell route={route} title="Test Bank" subtitle={view === "tests" ? capacityLabel : `${summary.due} questions ready for Smart Revision`} mergeIntoMainHeader>
      <div className="dc-glass-toolbar border-b border-white/60 px-4 pb-3 pt-3 lg:px-0 lg:max-w-[1200px] lg:mx-auto lg:rounded-2xl lg:mt-2">
        <div data-rev-bank-view-switch className="dc-glass-soft grid grid-cols-2 rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setView("tests")}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl text-xs font-black transition ${view === "tests" ? "border border-indigo-300/70 bg-indigo-500/15 text-indigo-700 shadow-sm backdrop-blur" : "text-slate-600"}`}
          >
            <Archive className="h-4 w-4" /> Saved Tests
          </button>
          <button
            type="button"
            onClick={() => setView("smart")}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl text-xs font-black transition ${view === "smart" ? "border border-indigo-300/70 bg-indigo-500/15 text-indigo-700 shadow-sm backdrop-blur" : "text-slate-600"}`}
          >
            <BrainCircuit className="h-4 w-4" /> Smart Revision
          </button>
        </div>
      </div>

      {view === "tests" ? (
        <SavedTestsView
          tests={visibleTests}
          allCount={savedTests.length}
          search={testSearch}
          bankStatus={bankStatus}
          expandedTest={expandedTest}
          onSearch={setTestSearch}
          onExpand={(id) => setExpandedTest((current) => current === id ? null : id)}
          onOpenAttempt={openAttempt}
          onOpenResult={(id) => navigate(`#/revision/test/result/${id}`)}
          onStart={(test) => navigate(`#/revision/test/play/${test.id}`)}
          onReviseAgain={reviseAgain}
          onReviseSkipped={reviseSkipped}
          onDelete={setDeleting}
          onCreateAi={() => createNew("#/revision/ai-generate")}
          onImport={() => createNew("#/revision/bulk-import")}
          uid={uid}
        />
      ) : (
        <SmartRevisionView
          bankData={bankData}
          summary={summary}
          search={search}
          statusTab={statusTab}
          activeFilterCount={activeFilterCount}
          startingSession={startingSession}
          onSearch={setSearch}
          onStatus={setStatusTab}
          onFilters={() => setShowFilters(true)}
          onStart={handleStartSession}
          onClear={() => {
            setSearch("");
            setSubjectId(undefined);
            setDifficulty(undefined);
            setStatusTab("active");
          }}
        />
      )}

      {actionError && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto w-full max-w-[440px] px-4">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
            <span className="flex-1">{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss"><XIcon className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {showFilters && (
        <FilterSheet
          subjects={subjects}
          subjectId={subjectId}
          difficulty={difficulty}
          sort={sort}
          onApply={(next) => {
            setSubjectId(next.subjectId);
            setDifficulty(next.difficulty);
            setSort(next.sort);
            setShowFilters(false);
          }}
          onClose={() => setShowFilters(false)}
        />
      )}

      {deleting && (
        <DeleteConfirmation
          test={deleting}
          busy={deleteBusy}
          onClose={() => { if (!deleteBusy) setDeleting(null); }}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </PageShell>
  );
}

function SavedTestsView({
  tests,
  allCount,
  search,
  bankStatus,
  expandedTest,
  onSearch,
  onExpand,
  onOpenAttempt,
  onOpenResult,
  onStart,
  onReviseAgain,
  onReviseSkipped,
  onDelete,
  onCreateAi,
  onImport,
  uid,
}: {
  tests: CustomTestListItem[];
  allCount: number;
  search: string;
  bankStatus: RevisionBankStatus | null;
  expandedTest: number | null;
  onSearch: (value: string) => void;
  onExpand: (id: number) => void;
  onOpenAttempt: (id: number) => void;
  onOpenResult: (id: number) => void;
  onStart: (test: CustomTestListItem) => void;
  onReviseAgain: (id: number) => void;
  onReviseSkipped: (id: number) => void;
  onDelete: (test: CustomTestListItem) => void;
  onCreateAi: () => void;
  onImport: () => void;
  uid: string;
}) {
  const limit = bankStatus?.limit;
  const used = bankStatus?.used ?? allCount;
  const percentage = limit == null || limit < 0 ? 0 : Math.min(100, limit === 0 ? 100 : (used / limit) * 100);

  return (
    <div className="animate-fade-in pb-24">
      <div className="dc-glass-toolbar sticky top-0 z-10 space-y-3 border-b border-white/60 px-4 py-3">
        <div className="dc-glass-input flex min-h-[44px] items-center gap-2 rounded-2xl px-3">
          <SearchIcon className="h-4 w-4 text-slate-500" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search saved tests" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-500" />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search"><XIcon className="h-4 w-4 text-slate-500" /></button>}
        </div>
        {bankStatus && limit !== -1 && (
          <div className="rounded-xl bg-indigo-100/70 px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-800">
              <span>{bankStatus.planName} Test Bank</span><span>{used}/{limit}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${percentage}%` }} /></div>
          </div>
        )}
        {bankStatus && allCount > bankStatus.used && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-800">
            {allCount - bankStatus.used} older test{allCount - bankStatus.used === 1 ? " is" : "s are"} pending cloud sync. They remain safely available on this device while automatic migration retries when eligible.
          </div>
        )}
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-8 w-8" />}
          title={allCount === 0 ? "Your Test Bank is ready" : "No saved tests found"}
          description={allCount === 0 ? "AI-generated and imported tests will be stored here with every attempt, answer and result." : "Try a different title, subject or topic."}
          action={allCount === 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              <PrimaryButton className="w-auto px-6" onClick={onCreateAi}><SparklesIcon className="h-4 w-4" /> Generate a Test</PrimaryButton>
              <SecondaryButton className="w-auto px-6" onClick={onImport}>Import Questions</SecondaryButton>
            </div>
          ) : <SecondaryButton className="mt-2 w-auto px-6" onClick={() => onSearch("")}>Clear search</SecondaryButton>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:px-0 lg:gap-3 lg:max-w-[1200px] lg:mx-auto" data-saved-tests-grid>
          {tests.map((test) => (
            <SavedTestCard
              key={test.id}
              test={test}
              attempts={expandedTest === test.id ? listCustomTestAttempts(uid, test.id) : []}
              expanded={expandedTest === test.id}
              onExpand={() => onExpand(test.id)}
              onOpenAttempt={onOpenAttempt}
              onOpenResult={onOpenResult}
              onStart={() => onStart(test)}
              onReviseAgain={() => onReviseAgain(test.id)}
              onReviseSkipped={() => onReviseSkipped(test.id)}
              onDelete={() => onDelete(test)}
            />
          ))}
          {/* Trailing create actions. `data-saved-tests-actions` lets the
              compact-band CSS pin this tile to a full row: its `sm:col-span-2
              lg:col-span-3` spans would otherwise invent an implicit second
              column inside the one-card-per-row grid and squeeze the buttons. */}
          <div className="grid grid-cols-2 gap-2 pt-1 sm:col-span-2 lg:col-span-3" data-saved-tests-actions>
            <SecondaryButton onClick={onCreateAi}><SparklesIcon className="h-4 w-4" /> Generate</SecondaryButton>
            <SecondaryButton onClick={onImport}><BookOpenCheck className="h-4 w-4" /> Import</SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedTestCard({
  test,
  attempts,
  expanded,
  onExpand,
  onOpenAttempt,
  onOpenResult,
  onStart,
  onReviseAgain,
  onReviseSkipped,
  onDelete,
}: {
  test: CustomTestListItem;
  attempts: CustomTestAttemptSummary[];
  expanded: boolean;
  onExpand: () => void;
  onOpenAttempt: (id: number) => void;
  onOpenResult: (id: number) => void;
  onStart: () => void;
  onReviseAgain: () => void;
  onReviseSkipped: () => void;
  onDelete: () => void;
}) {
  const labels = [...test.planDetails.subjectNames, ...test.planDetails.chapterNames].slice(0, 2);
  const progressTotal = Math.max(1, test.totalQuestions);
  const progress = test.status === "in_progress" ? Math.min(100, ((test.currentIndex + 1) / progressTotal) * 100) : 0;

  return (
    /* `aspect-square` is the wide-screen look only. Whenever the Test Bank
       content column is narrow (small tablet with the side panel visible,
       split-screen tablet, phone) the compact-band CSS in `src/index.css`
       switches it to `aspect-ratio: auto` so the card grows with its content
       instead of clipping the action buttons behind `overflow-hidden`. */
    <Card className="relative aspect-square overflow-hidden p-0" data-saved-test-card>
      <div className="flex h-full flex-col p-3.5">
        <div className="flex items-start gap-2.5">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${test.source === "bulk" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}>
            {test.source === "bulk" ? <BookOpenCheck className="h-4.5 w-4.5" /> : <SparklesIcon className="h-4.5 w-4.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5"><h3 className="min-w-0 flex-1 text-[13px] font-black leading-snug text-slate-900 line-clamp-2">{test.title}</h3><Badge tone={test.status === "completed" ? "mastered" : test.status === "in_progress" ? "learning" : "neutral"}>{test.status === "in_progress" ? "in progress" : test.status}</Badge></div>
            <p className="mt-0.5 text-[10px] font-medium text-slate-500">{sourceLabel(test.source)} · {test.totalQuestions} questions · {test.estimatedMinutes} min</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => <span key={label} className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600">{label}</span>)}
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">{questionModeLabel(test.planDetails.questionMode)}</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold capitalize text-slate-600">{test.planDetails.difficulty}</span>
        </div>

        {test.status === "in_progress" && (
          <div className="mt-2 rounded-xl bg-indigo-100/70 px-2.5 py-2">
            <div className="flex justify-between text-[10px] font-bold text-indigo-700"><span>Attempt in progress</span><span>{Math.min(test.currentIndex + 1, test.totalQuestions)}/{test.totalQuestions}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        {test.status === "completed" && (
          <div data-rev-result-metrics className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-2 text-center">
            <ResultMetric value={`${test.score ?? 0}%`} label="Score" />
            <ResultMetric value={String(test.correctCount)} label="Correct" tone="text-emerald-600" />
            <ResultMetric value={String(test.wrongCount)} label="Wrong" tone="text-rose-600" />
            <ResultMetric value={String(test.skippedCount)} label="Skipped" tone="text-amber-600" />
          </div>
        )}

        <div className="min-h-0 flex-1" />

        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><History className="h-3 w-3" /> {test.attemptCount} completed attempt{test.attemptCount === 1 ? "" : "s"}</span>
          <span>{relativeDate(test.completedAt)}</span>
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          {test.status === "available" ? (
            <PrimaryButton className="w-full min-h-[38px] rounded-xl text-xs" onClick={onStart}><Play className="h-3.5 w-3.5" /> Start Test</PrimaryButton>
          ) : test.status === "in_progress" && test.attemptId ? (
            <PrimaryButton className="w-full min-h-[38px] rounded-xl text-xs" onClick={() => onOpenAttempt(test.attemptId!)}><Play className="h-3.5 w-3.5" /> Continue Attempt</PrimaryButton>
          ) : (
            <>
              <PrimaryButton className="w-full min-h-[38px] rounded-xl text-xs" onClick={onReviseAgain}><RotateCcw className="h-3.5 w-3.5" /> Revise Again</PrimaryButton>
              <div className="grid grid-cols-2 gap-1.5">
                <SecondaryButton className="min-h-[32px] rounded-lg text-[10px]" disabled={test.skippedCount === 0} onClick={onReviseSkipped}><ListRestart className="h-3 w-3" /> Revise Skipped</SecondaryButton>
                {test.attemptId ? (
                  <SecondaryButton className="min-h-[32px] rounded-lg text-[10px]" onClick={() => onOpenResult(test.attemptId!)}><BarChart3 className="h-3 w-3" /> Result</SecondaryButton>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1 border-t border-slate-200 pt-1.5">
          <button type="button" onClick={onExpand} className="flex min-h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg text-[10px] font-bold text-slate-600 active:bg-slate-100">
            <History className="h-3.5 w-3.5" /> Attempt history {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onDelete} className="grid h-8 w-9 place-items-center rounded-lg text-rose-500 active:bg-rose-50" aria-label={`Delete ${test.title}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {expanded && (
        <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl" data-saved-test-attempts>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <p className="text-xs font-black text-slate-700">Attempt history</p>
            <button type="button" onClick={onExpand} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Close attempt history"><ChevronUp className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
            {attempts.length === 0 ? <p className="py-2 text-center text-xs text-slate-500">No attempts yet.</p> : (
              <div className="space-y-2">
                {attempts.map((attempt, index) => (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => attempt.status === "completed" ? onOpenResult(attempt.id) : onOpenAttempt(attempt.id)}
                    className="flex min-h-[50px] w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 text-left shadow-sm"
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${attempt.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>{attempts.length - index}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-slate-700">{attempt.attemptKind === "skipped" ? "Skipped questions" : "Full test"} · {attempt.questionCount} questions</span>
                      <span className="mt-0.5 block text-[9px] text-slate-500">{relativeDate(attempt.completedAt ?? attempt.startedAt)}</span>
                    </span>
                    <span className="text-right"><span className="block text-[11px] font-black text-slate-700">{attempt.status === "completed" ? `${attempt.score}%` : "Continue"}</span><span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{attempt.status}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ResultMetric({ value, label, tone = "text-slate-800" }: { value: string; label: string; tone?: string }) {
  return <div><p className={`text-[11px] font-black ${tone}`}>{value}</p><p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>;
}

function SmartRevisionView({ bankData, summary, search, statusTab, activeFilterCount, startingSession, onSearch, onStatus, onFilters, onStart, onClear }: {
  bankData: ReturnType<typeof getRevisionBank>;
  summary: ReturnType<typeof getRevisionSummary>;
  search: string;
  statusTab: StatusTab;
  activeFilterCount: number;
  startingSession: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: StatusTab) => void;
  onFilters: () => void;
  onStart: () => void;
  onClear: () => void;
}) {
  return (
    <div className="animate-fade-in pb-28">
      <div className="dc-glass-toolbar sticky top-0 z-10 space-y-3 border-b border-white/60 px-4 py-3">
        <div className="flex gap-2">
          <div className="dc-glass-input flex min-h-[44px] flex-1 items-center gap-2 rounded-2xl px-3"><SearchIcon className="h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search weak questions or topics" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-500" />{search && <button type="button" onClick={() => onSearch("")}><XIcon className="h-4 w-4 text-slate-500" /></button>}</div>
          <button type="button" onClick={onFilters} className="dc-glass-input relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-slate-700"><FilterIcon className="h-5 w-5" />{activeFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">{activeFilterCount}</span>}</button>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">{STATUS_TABS.map((tab) => <button key={tab.key} type="button" onClick={() => onStatus(tab.key)} className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-semibold ${statusTab === tab.key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{tab.label}{tab.key === "active" ? ` (${summary.due})` : ""}</button>)}</div>
      </div>
      {bankData.length === 0 ? (
        <EmptyState icon={<BankIcon className="h-8 w-8" />} title={summary.total === 0 ? "No weak questions yet" : "No matching questions"} description={summary.total === 0 ? "Questions you answer incorrectly or skip are automatically organized here for focused revision." : "Adjust the search or filters to see more questions."} action={summary.total > 0 ? <SecondaryButton className="mt-2 w-auto px-6" onClick={onClear}>Clear filters</SecondaryButton> : undefined} />
      ) : (
        <div className="space-y-3 px-4 py-4">{bankData.map((item) => <Card key={item.id}><div className="mb-2 flex flex-wrap items-center gap-1.5"><Badge tone={item.status}>{item.status}</Badge><Badge tone={item.difficulty}>{item.difficulty}</Badge><span className="ml-auto text-[11px] text-slate-500">{relativeDate(item.lastRevisedAt)}</span></div><p className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">{item.prompt}</p><div className="mt-2 flex justify-between text-xs text-slate-600"><span>{item.subjectIcon} {item.subjectName} · {item.topicName}</span><span>Missed {item.timesWrong}×</span></div></Card>)}</div>
      )}
      {bankData.length > 0 && <div className="dc-glass-toolbar fixed inset-x-0 bottom-[56px] z-20 mx-auto w-full max-w-[480px] border-t border-white/60 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><PrimaryButton onClick={onStart} disabled={startingSession}><SparklesIcon className="h-4 w-4" />{startingSession ? "Starting…" : `Start Smart Revision (${bankData.length})`}</PrimaryButton></div>}
    </div>
  );
}

function DeleteConfirmation({ test, busy, onClose, onConfirm }: { test: CustomTestListItem; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-5">
      <button type="button" aria-label="Cancel deletion" className="absolute inset-0" onClick={onClose} />
      <div className="dc-modal-glass relative w-full max-w-md rounded-t-[2rem] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem]">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-7 w-7" /></span>
        <h3 className="mt-4 text-xl font-black text-slate-900">Permanently delete this test?</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600"><strong className="text-slate-700">{test.title}</strong>, all {test.attemptCount} completed attempt{test.attemptCount === 1 ? "" : "s"}, answers and historical results will be removed from every device. This cannot be undone.</p>
        <div className="mt-5 grid grid-cols-2 gap-2"><SecondaryButton disabled={busy} onClick={onClose}>Keep Test</SecondaryButton><button type="button" disabled={busy} onClick={onConfirm} className="min-h-[48px] rounded-2xl bg-rose-600 px-4 text-sm font-black text-white disabled:opacity-60">{busy ? "Deleting…" : "Delete Permanently"}</button></div>
      </div>
    </div>
  );
}

function FilterSheet({ subjects, subjectId, difficulty, sort, onApply, onClose }: {
  subjects: { id: number; name: string; icon: string }[];
  subjectId?: number;
  difficulty?: string;
  sort: string;
  onApply: (next: { subjectId?: number; difficulty?: string; sort: string }) => void;
  onClose: () => void;
}) {
  const [localSubject, setLocalSubject] = useState(subjectId);
  const [localDifficulty, setLocalDifficulty] = useState(difficulty);
  const [localSort, setLocalSort] = useState(sort);
  const sorts = [{ key: "recent", label: "Recently added" }, { key: "oldest", label: "Oldest first" }, { key: "most_wrong", label: "Most missed" }, { key: "difficulty", label: "Hardest first" }, { key: "alphabetical", label: "Topic A–Z" }];
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center">
      <div className="dc-modal-glass max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-900">Filter & Sort</h3><button type="button" onClick={onClose}><XIcon className="h-5 w-5 text-slate-500" /></button></div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Subject</p><div className="mb-4 flex flex-wrap gap-2"><FilterChoice active={localSubject === undefined} label="All Subjects" onClick={() => setLocalSubject(undefined)} />{subjects.map((subject) => <FilterChoice key={subject.id} active={localSubject === subject.id} label={`${subject.icon} ${subject.name}`} onClick={() => setLocalSubject(subject.id)} />)}</div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Difficulty</p><div className="mb-4 flex flex-wrap gap-2"><FilterChoice active={localDifficulty === undefined} label="Any" onClick={() => setLocalDifficulty(undefined)} />{["easy", "medium", "hard"].map((item) => <FilterChoice key={item} active={localDifficulty === item} label={item} onClick={() => setLocalDifficulty(item)} />)}</div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Sort by</p><div className="mb-6 space-y-2">{sorts.map((item) => <button key={item.key} type="button" onClick={() => setLocalSort(item.key)} className={`flex min-h-[44px] w-full items-center rounded-xl border px-3 text-sm font-medium ${localSort === item.key ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-700"}`}>{item.label}</button>)}</div>
        <PrimaryButton onClick={() => onApply({ subjectId: localSubject, difficulty: localDifficulty, sort: localSort })}>Apply Filters</PrimaryButton>
      </div>
    </div>
  );
}

function FilterChoice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-700"}`}>{label}</button>;
}
