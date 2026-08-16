import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, EmptyState } from "../components/ui";
import { ChartIcon, CheckIcon, FlameIcon, SparklesIcon, TrophyIcon, XIcon } from "../components/icons";
import { getProgressData } from "../engine/statsService";

type RangeTab = "daily" | "weekly" | "monthly";

function BarChart({ data }: { data: { label: string; accuracy: number; attempted: number }[] }) {
  const max = Math.max(...data.map((d) => d.attempted), 1);
  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2">
      {data.map((d, i) => {
        const heightPct = d.attempted === 0 ? 4 : Math.max(8, (d.attempted / max) * 100);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-32 w-full items-end">
              <div
                className={`w-full rounded-t-md ${d.attempted === 0 ? "bg-slate-100" : "bg-gradient-to-t from-indigo-500 to-violet-400"}`}
                style={{ height: `${heightPct}%` }}
                title={`${d.attempted} attempted · ${d.accuracy}% accuracy`}
              />
            </div>
            <span className="text-[9px] font-medium text-slate-400">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ points }: { points: { date: string; score: number }[] }) {
  if (points.length === 0) return <p className="py-6 text-center text-sm text-slate-400">No completed tests yet.</p>;
  const width = 300;
  const height = 80;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * stepX : width / 2;
    const y = height - (p.score / 100) * height;
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full overflow-visible">
        <polyline points={coords.join(" ")} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const x = points.length > 1 ? i * stepX : width / 2;
          const y = height - (p.score / 100) * height;
          return <circle key={i} cx={x} cy={y} r={3} fill="#4f46e5" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function ProgressPage({ uid, route }: { uid: string; route: string }) {
  const [range, setRange] = useState<RangeTab>("daily");
  const data = useMemo(() => getProgressData(uid), [uid]);

  const chartData = range === "daily" ? data.daily : range === "weekly" ? data.weekly : data.monthly;

  return (
    <PageShell route={route} title="Progress" subtitle="Your learning journey">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        <div className="grid grid-cols-2 gap-3">
          <TotalCard icon={<CheckIcon className="h-5 w-5 text-indigo-600" />} label="Tests Completed" value={data.totals.testsCompleted} />
          <TotalCard icon={<ChartIcon className="h-5 w-5 text-emerald-600" />} label="Overall Accuracy" value={`${data.totals.overallAccuracy}%`} />
          <TotalCard icon={<SparklesIcon className="h-5 w-5 text-sky-600" />} label="Questions Attempted" value={data.totals.questionsAttempted} />
          <TotalCard icon={<XIcon className="h-5 w-5 text-rose-600" />} label="Incorrect Answers" value={data.totals.questionsIncorrect} />
          <TotalCard icon={<TrophyIcon className="h-5 w-5 text-amber-600" />} label="Mastered Questions" value={data.totals.masteredCount} />
          <TotalCard icon={<FlameIcon className="h-5 w-5 text-orange-600" />} label="Current Streak" value={`${data.totals.currentStreak}d`} />
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Activity</h2>
            <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
              {(["daily", "weekly", "monthly"] as RangeTab[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`min-h-[30px] rounded-full px-3 capitalize transition ${
                    range === r ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <BarChart data={chartData} />
        </Card>

        <Card>
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">Recent Test Score Trend</h2>
          <Sparkline points={data.accuracyTrend} />
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Activity History</h2>
          {data.activityHistory.length === 0 ? (
            <EmptyState title="No activity yet" description="Complete a test or revision session to see it here." />
          ) : (
            <div className="space-y-3">
              {data.activityHistory.map((a, idx) => (
                <div key={`${a.type}-${a.refId}-${idx}`} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      a.type === "test" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {a.type === "test" ? <ChartIcon className="h-4.5 w-4.5" /> : <SparklesIcon className="h-4.5 w-4.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.detail}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function TotalCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="flex flex-col gap-1">
      {icon}
      <span className="text-xl font-bold text-slate-900">{value}</span>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
    </Card>
  );
}
