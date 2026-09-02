import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/glass-dialog";
import { GlassSheet, GlassSheetContent, GlassSheetTitle, GlassSheetClose } from "../../components/ui/glass-sheet";
import { GlassInput } from "../../components/ui/glass-input";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassToggleGroup, GlassToggleItem } from "../../components/ui/glass-toggle-group";
import { GlassSurface } from "../../components/ui/glass";
import { GlassTile } from "../../components/ui/glass-tile";
import { GlassCard } from "../../components/ui/GlassCard";
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
      {/* The Test Bank header row.
          `data-rev-bank-header` is the hook the flush-seat rules in
          `src/index.css` key off. This row is the FIRST child of the page
          scroller (`main[data-revision-page-main]`), and a sticky inset is
          resolved against that scroller's CONTENT box — so the band paddings
          it used to carry (12 px tablet landscape, clamp(12–20 px) inside the
          desktop shell) plus the old `lg:mt-2` here parked the whole Test Bank
          header a few px BELOW the website header instead of flush against it,
          and the search row below could never rise to the true top while
          sticking. Both offsets are gone: the header now starts glued to the
          main header, and `sticky top-0` inside the scroller means "the very
          top", not "the top plus padding". The row keeps its own `py-3`, so
          the breathing room lives inside the glass bar instead of above it. */}
      <div data-rev-bank-header className="dc-glass-toolbar border-b border-white/10 px-4 py-3 lg:px-0 lg:max-w-[1200px] lg:mx-auto lg:rounded-2xl">
        {/* Wave 4: the two hand-rolled boxes became the registry
            `glass-toggle-group`. One droplet slides between the views instead
            of two backgrounds flickering, and the active state is now the same
            material as the store's sort/segment controls. The
            `data-rev-bank-view-switch` hook stays on the wrapper so the
            responsive contract keeps finding it; `data-stretch` asks the pack
            surface to fill the toolbar row (see src/glass.css). */}
        <div data-rev-bank-view-switch>
          <GlassToggleGroup
            className="dc-segment flex w-full rounded-2xl p-1"
            data-stretch
            tint={0.5}
            value={view}
            onValueChange={(next) => setView(next === "smart" ? "smart" : "tests")}
            aria-label="Test bank view"
          >
            <GlassToggleItem value="tests" className="min-h-[42px] flex-1 justify-center whitespace-nowrap px-3.5 text-xs font-black">
              <Archive className="h-4 w-4" /> Saved Tests
            </GlassToggleItem>
            <GlassToggleItem value="smart" className="min-h-[42px] flex-1 justify-center whitespace-nowrap px-3.5 text-xs font-black">
              <BrainCircuit className="h-4 w-4" /> Smart Revision
            </GlassToggleItem>
          </GlassToggleGroup>
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
          <GlassSurface radius={20} className="text-white ring-1 ring-rose-400/30" contentClassName="flex items-center gap-2 px-4 py-3 text-sm">
            <span className="flex-1">{actionError}</span>
            <GlassButton onClick={() => setActionError(null)} aria-label="Dismiss" className="[&_.size-12]:size-8"><XIcon className="h-4 w-4" /></GlassButton>
          </GlassSurface>
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
    /* The root wrapper must not grow a top padding of its own on any band:
       the sticky search row below is constrained by this element's content
       box, so any padding here would leave that row hanging the same number of
       px under the main header instead of flush (`index.css` zeroes it for the
       Test Bank). */
    <div className="animate-fade-in pb-24">
      <div className="dc-glass-toolbar sticky top-0 z-10 space-y-3 border-b border-white/10 px-4 py-3">
        <div className="relative">
          <GlassInput icon={<SearchIcon className="h-4 w-4" />} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search saved tests" className="w-full" />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2"><XIcon className="h-4 w-4 text-white/55" /></button>}
        </div>
        {bankStatus && limit !== -1 && (
          <div className="rounded-xl bg-indigo-500/20 px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-200">
              <span>{bankStatus.planName} Test Bank</span><span>{used}/{limit}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-white/15"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${percentage}%` }} /></div>
          </div>
        )}
        {bankStatus && allCount > bankStatus.used && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-200">
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
              <SecondaryButton className="w-auto" onClick={onImport}>Import Questions</SecondaryButton>
            </div>
          ) : <SecondaryButton className="mt-2 w-auto" onClick={() => onSearch("")}>Clear search</SecondaryButton>}
        />
      ) : (
        /* `items-start` matters as much as the column count: with the grid's
           default `align-items: stretch` every card in a row is forced to the
           height of the tallest one (a completed test shows a 4-up result-metrics
           row, a "ready to start" one does not), and the leftover opened up in the
           MIDDLE of the shorter cards — the "cards bahut vertically stretched /
           bich mein white space" report on every tablet width. */
        <div className="grid grid-cols-1 items-start gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:px-0 lg:gap-3 lg:max-w-[1200px] lg:mx-auto" data-saved-tests-grid>
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
    /* No `aspect-square`: a card is as tall as its content, on every band. The
       square was only ever safe in a narrow single-column layout (and the
       compact-band CSS in `src/index.css` had to switch it back to `auto` for
       exactly that reason) — as soon as the column was wide enough for a square
       of 260-330 px, the content was shorter than the box and the leftover
       space opened a white gap in the middle of every card. `overflow-hidden`
       stays: it is what contains the expanded attempt-history overlay. */
    <Card className="relative overflow-hidden p-0" data-saved-test-card>
      <div className="flex h-full flex-col p-3.5">
        <div className="flex items-start gap-2.5">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${test.source === "bulk" ? "bg-amber-500/15 text-amber-300" : "bg-violet-500/15 text-violet-300"}`}>
            {test.source === "bulk" ? <BookOpenCheck className="h-4.5 w-4.5" /> : <SparklesIcon className="h-4.5 w-4.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5"><h3 className="min-w-0 flex-1 text-[13px] font-black leading-snug text-white line-clamp-2">{test.title}</h3><Badge tone={test.status === "completed" ? "mastered" : test.status === "in_progress" ? "learning" : "neutral"}>{test.status === "in_progress" ? "in progress" : test.status}</Badge></div>
            <p className="mt-0.5 text-[10px] font-medium text-white/55">{sourceLabel(test.source)} · {test.totalQuestions} questions · {test.estimatedMinutes} min</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => <span key={label} className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold text-white/75">{label}</span>)}
          <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-bold text-indigo-300">{questionModeLabel(test.planDetails.questionMode)}</span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold capitalize text-white/75">{test.planDetails.difficulty}</span>
        </div>

        {test.status === "in_progress" && (
          <div className="mt-2 rounded-xl bg-indigo-500/20 px-2.5 py-2">
            <div className="flex justify-between text-[10px] font-bold text-indigo-200"><span>Attempt in progress</span><span>{Math.min(test.currentIndex + 1, test.totalQuestions)}/{test.totalQuestions}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-white/15"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        {test.status === "completed" && (
          <div data-rev-result-metrics className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-white/10 p-2 text-center">
            <ResultMetric value={`${test.score ?? 0}%`} label="Score" />
            <ResultMetric value={String(test.correctCount)} label="Correct" tone="text-emerald-300" />
            <ResultMetric value={String(test.wrongCount)} label="Wrong" tone="text-rose-300" />
            <ResultMetric value={String(test.skippedCount)} label="Skipped" tone="text-amber-300" />
          </div>
        )}

        {/* Used to be a `min-h-0 flex-1` spacer that pushed the actions to the
            bottom of a square card. With content-driven heights it had nothing
            to absorb EXCEPT the slack from a stretched grid row — i.e. it WAS
            the white band in the middle of the card. Gone. */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/55">
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
                <SecondaryButton size="sm" className="w-full" disabled={test.skippedCount === 0} onClick={onReviseSkipped}><ListRestart className="h-3 w-3" /> Revise Skipped</SecondaryButton>
                {test.attemptId ? (
                  <SecondaryButton size="sm" className="w-full" onClick={() => onOpenResult(test.attemptId!)}><BarChart3 className="h-3 w-3" /> Result</SecondaryButton>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1.5">
          <button type="button" onClick={onExpand} className="flex min-h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg text-[10px] font-bold text-white/75 hover:text-white">
            <History className="h-3.5 w-3.5" /> Attempt history {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <GlassButton onClick={onDelete} className="[&_.size-12]:size-8 [&_svg]:text-rose-300" aria-label={`Delete ${test.title}`}><Trash2 className="h-4 w-4" /></GlassButton>
        </div>
      </div>

      {expanded && (
        <GlassSurface radius={20} className="absolute inset-0 z-20" contentClassName="flex h-full flex-col overflow-hidden p-0" data-saved-test-attempts>
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2.5">
            <p className="text-xs font-black text-white/85">Attempt history</p>
            <GlassButton onClick={onExpand} className="[&_.size-12]:size-7 [&_svg]:text-white/75" aria-label="Close attempt history"><ChevronUp className="h-4 w-4" /></GlassButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
            {attempts.length === 0 ? <p className="py-2 text-center text-xs text-white/55">No attempts yet.</p> : (
              <div className="space-y-2">
                {attempts.map((attempt, index) => (
                  <GlassCard
                    key={attempt.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => attempt.status === "completed" ? onOpenResult(attempt.id) : onOpenAttempt(attempt.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (attempt.status === "completed") onOpenResult(attempt.id); else onOpenAttempt(attempt.id); } }}
                    className="cursor-pointer"
                    contentClassName="flex min-h-[50px] w-full items-center gap-2.5 px-2.5 py-1.5 text-left"
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${attempt.status === "completed" ? "bg-emerald-500/15 text-emerald-200" : "bg-indigo-500/15 text-indigo-200"}`}>{attempts.length - index}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-white/85">{attempt.attemptKind === "skipped" ? "Skipped questions" : "Full test"} · {attempt.questionCount} questions</span>
                      <span className="mt-0.5 block text-[9px] text-white/55">{relativeDate(attempt.completedAt ?? attempt.startedAt)}</span>
                    </span>
                    <span className="text-right"><span className="block text-[11px] font-black text-white/85">{attempt.status === "completed" ? `${attempt.score}%` : "Continue"}</span><span className="text-[8px] font-bold uppercase tracking-wide text-white/55">{attempt.status}</span></span>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </GlassSurface>
      )}
    </Card>
  );
}

function ResultMetric({ value, label, tone = "text-white/85" }: { value: string; label: string; tone?: string }) {
  return <div><p className={`text-[11px] font-black ${tone}`}>{value}</p><p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-white/55">{label}</p></div>;
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
    /* Same seat as the Saved Tests view: a sticky row directly under a wrapper
       with no top padding, so `top-0` really is the top of the page. */
    <div className="animate-fade-in pb-28">
      <div className="dc-glass-toolbar sticky top-0 z-10 space-y-3 border-b border-white/10 px-4 py-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1"><GlassInput icon={<SearchIcon className="h-4 w-4" />} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search weak questions or topics" className="w-full" />{search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2"><XIcon className="h-4 w-4 text-white/55" /></button>}</div>
          <GlassButton onClick={onFilters} aria-label="Filter and sort" className="relative shrink-0 [&_.size-12]:size-11"><FilterIcon className="h-5 w-5" />{activeFilterCount > 0 && <span className="absolute -right-1 -top-1 z-10 grid h-4 w-4 place-items-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">{activeFilterCount}</span>}</GlassButton>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto"><GlassToggleGroup className="dc-segment shrink-0" value={statusTab} onValueChange={(next) => onStatus(next as StatusTab)} aria-label="Question status">{STATUS_TABS.map((tab) => <GlassToggleItem key={tab.key} value={tab.key} className="min-h-[36px] whitespace-nowrap px-3.5 text-xs font-semibold">{tab.label}{tab.key === "active" ? ` (${summary.due})` : ""}</GlassToggleItem>)}</GlassToggleGroup></div>
      </div>
      {bankData.length === 0 ? (
        <EmptyState icon={<BankIcon className="h-8 w-8" />} title={summary.total === 0 ? "No weak questions yet" : "No matching questions"} description={summary.total === 0 ? "Questions you answer incorrectly or skip are automatically organized here for focused revision." : "Adjust the search or filters to see more questions."} action={summary.total > 0 ? <SecondaryButton className="mt-2 w-auto" onClick={onClear}>Clear filters</SecondaryButton> : undefined} />
      ) : (
        <div className="space-y-3 px-4 py-4">{bankData.map((item) => <Card key={item.id}><div className="mb-2 flex flex-wrap items-center gap-1.5"><Badge tone={item.status}>{item.status}</Badge><Badge tone={item.difficulty}>{item.difficulty}</Badge><span className="ml-auto text-[11px] text-white/55">{relativeDate(item.lastRevisedAt)}</span></div><p className="line-clamp-2 text-[15px] font-semibold leading-snug text-white">{item.prompt}</p><div className="mt-2 flex justify-between text-xs text-white/75"><span>{item.subjectIcon} {item.subjectName} · {item.topicName}</span><span>Missed {item.timesWrong}×</span></div></Card>)}</div>
      )}
      {bankData.length > 0 && <div className="dc-glass-toolbar fixed inset-x-0 bottom-[56px] z-20 mx-auto w-full max-w-[480px] border-t border-white/10 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"><PrimaryButton onClick={onStart} disabled={startingSession}><SparklesIcon className="h-4 w-4" />{startingSession ? "Starting…" : `Start Smart Revision (${bankData.length})`}</PrimaryButton></div>}
    </div>
  );
}

function DeleteConfirmation({ test, busy, onClose, onConfirm }: { test: CustomTestListItem; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent aria-label="Delete test">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300"><Trash2 className="h-7 w-7" /></span>
        <DialogTitle className="mt-4 text-xl font-black">Permanently delete this test?</DialogTitle>
        <DialogDescription className="leading-relaxed text-white/75"><strong className="text-white/85">{test.title}</strong>, all {test.attemptCount} completed attempt{test.attemptCount === 1 ? "" : "s"}, answers and historical results will be removed from every device. This cannot be undone.</DialogDescription>
        <DialogFooter className="mt-5 grid grid-cols-2 gap-2"><SecondaryButton disabled={busy} onClick={onClose}>Keep Test</SecondaryButton><button type="button" disabled={busy} onClick={onConfirm} className="min-h-[48px] rounded-full bg-rose-600 px-4 text-sm font-black text-white hover:bg-rose-500 disabled:opacity-60">{busy ? "Deleting…" : "Delete Permanently"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
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
    <GlassSheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <GlassSheetContent side="bottom" aria-label="Filter and sort" className="h-auto max-h-[85vh] pb-[env(safe-area-inset-bottom)] sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2">
        <div className="mb-4 flex items-center justify-between"><GlassSheetTitle>Filter & Sort</GlassSheetTitle><GlassSheetClose aria-label="Close filters" className="grid h-9 w-9 place-items-center rounded-full"><XIcon className="h-5 w-5 text-white/55" /></GlassSheetClose></div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/55">Subject</p><div className="mb-4 flex flex-wrap gap-2"><FilterChoice active={localSubject === undefined} label="All Subjects" onClick={() => setLocalSubject(undefined)} />{subjects.map((subject) => <FilterChoice key={subject.id} active={localSubject === subject.id} label={`${subject.icon} ${subject.name}`} onClick={() => setLocalSubject(subject.id)} />)}</div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/55">Difficulty</p><div className="mb-4 flex flex-wrap gap-2"><FilterChoice active={localDifficulty === undefined} label="Any" onClick={() => setLocalDifficulty(undefined)} />{["easy", "medium", "hard"].map((item) => <FilterChoice key={item} active={localDifficulty === item} label={item} onClick={() => setLocalDifficulty(item)} />)}</div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/55">Sort by</p><div className="mb-6 space-y-2">{sorts.map((item) => <GlassTile key={item.key} onClick={() => setLocalSort(item.key)} selected={localSort === item.key} className={`dc-tile aspect-auto min-h-[44px] w-full rounded-xl px-3 text-left text-sm font-medium [&>span]:w-full [&>span]:justify-start ${localSort === item.key ? "text-indigo-200" : "text-white/85"}`}>{item.label}</GlassTile>)}</div>
        <PrimaryButton onClick={() => onApply({ subjectId: localSubject, difficulty: localDifficulty, sort: localSort })}>Apply Filters</PrimaryButton>
      </GlassSheetContent>
    </GlassSheet>
  );
}

function FilterChoice({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  /* Wave 13: filter chips are the pack GlassTile (pill radius); the pack's
     selected ring marks the active choice. */
  return <GlassTile onClick={onClick} selected={active} className={`dc-tile aspect-auto rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${active ? "text-white" : "text-white/85"}`}>{label}</GlassTile>;
}
