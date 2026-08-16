import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import {
  Badge,
  Card,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from "../components/ui";
import { BankIcon, FilterIcon, SearchIcon, SparklesIcon, XIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import {
  getAllSubjects,
  getRevisionBank,
  getRevisionSummary,
  startRevisionSession,
  ServiceError,
} from "../engine/revisionService";

type StatusTab = "active" | "learning" | "improving" | "mastered" | "all";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "active", label: "Due" },
  { key: "learning", label: "Learning" },
  { key: "improving", label: "Improving" },
  { key: "mastered", label: "Mastered" },
  { key: "all", label: "All" },
];

function relativeDate(dateStr: string | null) {
  if (!dateStr) return "Never revised";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  const weeks = Math.floor(diffDays / 7);
  return `${weeks}w ago`;
}

export default function RevisionBankPage({ uid, route }: { uid: string; route: string }) {
  const { navigate } = useExitGuard();
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  const statusParam = statusTab === "active" ? undefined : statusTab;

  const bankData = useMemo(
    () =>
      getRevisionBank(uid, {
        status: statusParam as "learning" | "improving" | "mastered" | "all" | undefined,
        search,
        sort: sort as "recent" | "oldest" | "difficulty" | "most_wrong" | "alphabetical",
        subjectId,
        difficulty: difficulty as "easy" | "medium" | "hard" | undefined,
      }),
    [uid, statusParam, search, sort, subjectId, difficulty],
  );
  const summary = useMemo(() => getRevisionSummary(uid), [uid]);
  const subjects = useMemo(() => getAllSubjects(uid), [uid]);

  const handleStartSession = () => {
    setStartingSession(true);
    try {
      const session = startRevisionSession(uid, {
        subjectId,
        status: statusTab === "mastered" ? "mastered" : undefined,
      });
      navigate(`#/revision/session/${session.id}`);
    } catch (err) {
      setSessionError(err instanceof ServiceError ? err.message : "Could not start a revision session.");
    } finally {
      setStartingSession(false);
    }
  };

  const activeFilterCount = [subjectId, difficulty].filter(Boolean).length;
  const dueCount = summary.due;

  return (
    <PageShell
      route={route}
      title="Revision Bank"
      subtitle={`${dueCount} question${dueCount === 1 ? "" : "s"} due for revision`}
    >
      <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex gap-2">
          <div className="flex min-h-[44px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
            <SearchIcon className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions or topics"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                <XIcon className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 active:bg-slate-100"
            aria-label="Filters"
          >
            <FilterIcon className="h-5 w-5" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`min-h-[36px] shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                statusTab === tab.key
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 active:bg-slate-50"
              }`}
            >
              {tab.label}
              {tab.key === "active" ? ` (${summary.due})` : ""}
            </button>
          ))}
        </div>
      </div>

      {bankData.length === 0 && (
        <EmptyState
          icon={<BankIcon className="h-8 w-8" />}
          title={summary.total === 0 ? "Your revision bank is empty" : "No matching questions"}
          description={
            summary.total === 0
              ? "Wrong or skipped answers from your Daily Test will automatically show up here so you can master them."
              : "Try adjusting your filters or search to find revision questions."
          }
          action={
            summary.total === 0 ? (
              <PrimaryButton className="mt-2 w-auto px-6" onClick={() => navigate("#/revision")}>
                Take Today&apos;s Test
              </PrimaryButton>
            ) : (
              <SecondaryButton
                className="mt-2 w-auto px-6"
                onClick={() => {
                  setSearch("");
                  setSubjectId(undefined);
                  setDifficulty(undefined);
                  setStatusTab("active");
                }}
              >
                Clear filters
              </SecondaryButton>
            )
          }
        />
      )}

      {bankData.length > 0 && (
        <div className="animate-fade-in space-y-3 px-4 py-4 pb-28">
          {bankData.map((item) => (
            <Card key={item.id}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={item.status}>{item.status}</Badge>
                <Badge tone={item.difficulty}>{item.difficulty}</Badge>
                <span className="ml-auto text-[11px] font-medium text-slate-400">{relativeDate(item.lastRevisedAt)}</span>
              </div>
              <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900">{item.prompt}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  {item.subjectIcon} {item.subjectName} · {item.topicName}
                </span>
                <span>Missed {item.timesWrong}×</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {sessionError && (
        <div className="fixed inset-x-0 bottom-24 z-40 mx-auto w-full max-w-[440px] px-4">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
            <span className="flex-1">{sessionError}</span>
            <button type="button" onClick={() => setSessionError(null)} aria-label="Dismiss">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {bankData.length > 0 && (
        <div className="fixed inset-x-0 bottom-[56px] z-20 mx-auto w-full max-w-[480px] border-t border-slate-100 bg-white/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
          <PrimaryButton onClick={handleStartSession} disabled={startingSession}>
            <SparklesIcon className="h-4 w-4" />
            {startingSession ? "Starting…" : `Start Revision Session (${bankData.length})`}
          </PrimaryButton>
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
    </PageShell>
  );
}

function FilterSheet({
  subjects,
  subjectId,
  difficulty,
  sort,
  onApply,
  onClose,
}: {
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

  const difficulties = useMemo(() => ["easy", "medium", "hard"], []);
  const sorts = [
    { key: "recent", label: "Recently added" },
    { key: "oldest", label: "Oldest first" },
    { key: "most_wrong", label: "Most missed" },
    { key: "difficulty", label: "Hardest first" },
    { key: "alphabetical", label: "Topic A–Z" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center">
      <div className="mx-auto max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Filter & Sort</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <XIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Subject</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLocalSubject(undefined)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              localSubject === undefined ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            All Subjects
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setLocalSubject(s.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                localSubject === s.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"
              }`}
            >
              {s.icon} {s.name}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Difficulty</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLocalDifficulty(undefined)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
              localDifficulty === undefined ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            Any
          </button>
          {difficulties.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setLocalDifficulty(d)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
                localDifficulty === d ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-600"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sort by</p>
        <div className="mb-6 flex flex-col gap-2">
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setLocalSort(s.key)}
              className={`flex min-h-[44px] items-center rounded-xl border px-3 text-sm font-medium ${
                localSort === s.key ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <PrimaryButton onClick={() => onApply({ subjectId: localSubject, difficulty: localDifficulty, sort: localSort })}>
          Apply Filters
        </PrimaryButton>
      </div>
    </div>
  );
}
