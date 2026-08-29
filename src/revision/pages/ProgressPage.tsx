import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, EmptyState } from "../components/ui";
import { ChartIcon, CheckIcon, FlameIcon, SparklesIcon, TrophyIcon, XIcon } from "../components/icons";
import { getProgressData } from "../engine/statsService";

type RangeTab = "daily" | "weekly" | "monthly";

const RANGE_TABS: { value: RangeTab; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function BarChart({ data }: { data: { label: string; accuracy: number; attempted: number }[] }) {
  const hasAny = data.some((d) => d.attempted > 0);
  if (!hasAny) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-medium text-slate-500">No attempts in this period yet.</p>
        <p className="mt-0.5 text-[11px] text-slate-400">Complete a test or revision session to see your activity bars.</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.attempted), 1);
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {data.map((d, i) => {
        const heightPct = d.attempted === 0 ? 4 : Math.max(8, (d.attempted / max) * 100);
        return (
          <div key={`${d.label}-${i}`} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-32 w-full items-end">
              <div
                className={`w-full rounded-t-md transition-[height] duration-300 ease-out ${d.attempted === 0 ? "bg-slate-200" : "bg-gradient-to-t from-indigo-500 to-violet-400"}`}
                style={{ height: `${heightPct}%` }}
                title={`${d.attempted} attempted · ${d.accuracy}% accuracy`}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] font-medium text-slate-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ points }: { points: { date: string; score: number }[] }) {
  const safe = points.filter((p) => Number.isFinite(Number(p.score)));
  if (safe.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-medium text-slate-500">No completed tests yet.</p>
        <p className="mt-0.5 text-[11px] text-slate-400">Your score trend will appear here after your first test.</p>
      </div>
    );
  }
  const width = 300;
  const height = 80;
  const stepX = safe.length > 1 ? width / (safe.length - 1) : 0;
  const coords = safe.map((p, i) => {
    const x = safe.length > 1 ? i * stepX : width / 2;
    const y = height - (Math.max(0, Math.min(100, Number(p.score))) / 100) * height;
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full overflow-visible">
        <polyline points={coords.join(" ")} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {safe.map((p, i) => {
          const x = safe.length > 1 ? i * stepX : width / 2;
          const y = height - (Math.max(0, Math.min(100, Number(p.score))) / 100) * height;
          return <circle key={i} cx={x} cy={y} r={3} fill="#4f46e5" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
        <span>{safe[0]?.date}</span>
        <span>{safe[safe.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function ProgressPage({ uid, route }: { uid: string; route: string }) {
  const [range, setRange] = useState<RangeTab>("daily");
  const data = useMemo(() => getProgressData(uid), [uid]);

  const chartData = range === "daily" ? data.daily : range === "weekly" ? data.weekly : data.monthly;

  return (
    <PageShell route={route} title="Progress" subtitle="Your learning journey" mergeIntoMainHeader>
      <div data-rev-layout="progress" className="animate-fade-in space-y-4 px-4 py-4 pb-8 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-3 lg:px-0 lg:py-0 lg:pb-0 lg:max-w-[1200px] lg:mx-auto">
        <div data-rev-panel="primary" className="lg:col-span-4 lg:space-y-3"><div data-rev-total-grid className="grid grid-cols-2 gap-2.5 lg:gap-2">
          <TotalCard icon={<CheckIcon className="h-5 w-5 text-indigo-600" />} label="Tests Completed" value={data.totals.testsCompleted} />
          <TotalCard icon={<ChartIcon className="h-5 w-5 text-emerald-600" />} label="Overall Accuracy" value={`${data.totals.overallAccuracy}%`} />
          <TotalCard icon={<SparklesIcon className="h-5 w-5 text-sky-600" />} label="Questions Attempted" value={data.totals.questionsAttempted} />
          <TotalCard icon={<XIcon className="h-5 w-5 text-rose-600" />} label="Incorrect Answers" value={data.totals.questionsIncorrect} />
          <TotalCard icon={<TrophyIcon className="h-5 w-5 text-amber-600" />} label="Mastered" value={data.totals.masteredCount} />
          <TotalCard icon={<FlameIcon className="h-5 w-5 text-orange-600" />} label="Current Streak" value={`${data.totals.currentStreak}d`} />
        </div></div>

        <div data-rev-panel="secondary" className="space-y-4 lg:col-span-8 lg:space-y-3">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-slate-900 lg:text-[14px]">Activity</h2>
            <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
              {RANGE_TABS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={`min-h-[30px] rounded-full px-3 transition ${
                    range === r.value ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {/* `key={range}` remounts the chart on tab change so the exit/enter
              of swapped bars can't flicker on mobile compositing. */}
          <div key={range} className="animate-fade-in">
            <BarChart data={chartData} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 text-[15px] font-bold text-slate-900">Recent Test Score Trend</h2>
          <Sparkline points={data.accuracyTrend} />
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-bold text-slate-900">Activity History</h2>
          {data.activityHistory.length === 0 ? (
            <EmptyState title="No activity yet" description="Complete a test or revision session to see it here." />
          ) : (
            <div className="space-y-3">
              {data.activityHistory.map((a, idx) => (
                <div key={`${a.type}-${a.refId}-${idx}`} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                      a.type === "test" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {a.type === "test" ? <ChartIcon className="h-4.5 w-4.5" /> : <SparklesIcon className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.detail}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                    {a.date ? new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        </div>
      </div>
    </PageShell>
  );
}

function TotalCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rev-card flex items-center gap-3 rounded-2xl p-3 lg:rounded-xl lg:p-2.5 lg:shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-lg font-bold leading-tight text-slate-900">{value}</span>
        <span className="block truncate text-[11px] font-medium text-slate-500">{label}</span>
      </div>
    </div>
  );
}
