import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton } from "../components/ui";
import {
  BankIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
  UserIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getDashboardData, getProgressData, getWeakTopics } from "../engine/statsService";

export default function RevisionProfilePage({ uid, route, userName }: { uid: string; route: string; userName: string }) {
  const { navigate } = useExitGuard();
  const dashboard = useMemo(() => getDashboardData(uid), [uid]);
  const progress = useMemo(() => getProgressData(uid), [uid]);
  const weakTopics = useMemo(() => getWeakTopics(uid), [uid]);

  return (
    <PageShell route={route} title="Profile">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        <Card className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <UserIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{userName}</h2>
            <p className="text-sm text-slate-500">Daily learner</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-orange-600">
              <FlameIcon className="h-3.5 w-3.5" /> {dashboard.quickStats.streak}-day streak
            </div>
          </div>
        </Card>

        <div>
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Today</h3>
          <button
            type="button"
            onClick={() => navigate("#/revision")}
            className="flex w-full items-center gap-3 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] active:bg-slate-50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <CheckIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Today&apos;s Test</p>
              <p className="text-xs capitalize text-slate-500">
                {dashboard.today.status === "in_progress"
                  ? "In progress"
                  : dashboard.today.status === "completed"
                    ? `Completed · Score ${dashboard.today.score}%`
                    : dashboard.today.status === "expired"
                      ? "Expired"
                      : "Available now"}
              </p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-slate-300" />
          </button>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Snapshot</h3>
          <div className="grid grid-cols-2 gap-3">
            <WidgetCard
              icon={<BankIcon className="h-5 w-5 text-sky-600" />}
              label="Revision Bank"
              value={dashboard.revisionBankSummary.due}
              sub={`${dashboard.revisionBankSummary.total} total`}
              onClick={() => navigate("#/revision/bank")}
            />
            <WidgetCard
              icon={<TargetIcon className="h-5 w-5 text-rose-600" />}
              label="Weak Topics"
              value={weakTopics.weakestTopics.length}
              sub="need attention"
              onClick={() => navigate("#/revision/weak-topics")}
            />
            <WidgetCard
              icon={<TrophyIcon className="h-5 w-5 text-amber-600" />}
              label="Mastered"
              value={dashboard.revisionBankSummary.mastered}
              sub="questions"
              onClick={() => navigate("#/revision/bank")}
            />
            <WidgetCard
              icon={<ChartIcon className="h-5 w-5 text-emerald-600" />}
              label="Accuracy"
              value={`${dashboard.quickStats.overallAccuracy}%`}
              sub={`${dashboard.quickStats.testsCompleted} tests`}
              onClick={() => navigate("#/revision/progress")}
            />
          </div>
        </div>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-slate-900">Recent Performance</h3>
            <button type="button" onClick={() => navigate("#/revision/progress")} className="text-xs font-semibold text-indigo-600">
              Full history
            </button>
          </div>
          {progress.accuracyTrend.length === 0 ? (
            <p className="text-sm text-slate-500">Complete your first test to see performance trends here.</p>
          ) : (
            <div className="flex items-end gap-1.5">
              {progress.accuracyTrend.slice(-8).map((p, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-400"
                      style={{ height: `${Math.max(6, p.score)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400">{p.score}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <PrimaryButton onClick={() => navigate("#/revision")}>Go to Dashboard</PrimaryButton>
      </div>
    </PageShell>
  );
}

function WidgetCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] active:bg-slate-50"
    >
      {icon}
      <span className="text-xl font-bold text-slate-900">{value}</span>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className="text-[10px] text-slate-400">{sub}</span>
    </button>
  );
}
