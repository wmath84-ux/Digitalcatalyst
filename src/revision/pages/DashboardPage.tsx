import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, ProgressBar } from "../components/ui";
import {
  BankIcon,
  ChartIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FlameIcon,
  SparklesIcon,
  TargetIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getRevisionOverview } from "../engine/statsService";
import { questionModeLabel } from "../engine/questionMode";
import { listCustomTests, type CustomTestListItem } from "../engine/customTestService";

const SWIPE_DISTANCE = 65;
const SWIPE_VELOCITY = 350;

function trendIcon(trend: string) {
  if (trend === "improving") return <TrendUpIcon className="h-4 w-4 text-emerald-600" />;
  if (trend === "declining") return <TrendDownIcon className="h-4 w-4 text-rose-600" />;
  return null;
}

type DashboardPageProps = {
  uid: string;
  route: string;
  userName: string;
  hasAccess?: boolean;
  onRequireAccess?: () => boolean;
};

export default function DashboardPage({ uid, route, userName, hasAccess = true, onRequireAccess }: DashboardPageProps) {
  const { navigate } = useExitGuard();
  const data = getRevisionOverview(uid);
  const revisionPlans = listCustomTests(uid);

  const requirePaidAccess = () => {
    if (onRequireAccess && !onRequireAccess()) return false;
    return hasAccess !== false;
  };

  const openGenerator = () => {
    if (!requirePaidAccess()) return;
    navigate("#/revision/ai-generate");
  };

  const openPlan = (plan: CustomTestListItem) => {
    // Saved tests are owned learner data and remain usable after expiry or a
    // downgrade. Only creating another test is a paid entitlement action.
    if (plan.status === "completed" && plan.attemptId) {
      navigate(`#/revision/test/result/${plan.attemptId}`);
      return;
    }
    navigate(`#/revision/test/play/${plan.id}`);
  };

  return (
    <PageShell
      route={route}
      title="Revision"
      subtitle={`Hi ${userName}, choose what you want to revise`}
      rightSlot={
        data.quickStats.streak > 0 ? (
          <div className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1.5 text-orange-600">
            <FlameIcon className="h-4 w-4" />
            <span className="text-xs font-bold">{data.quickStats.streak}</span>
          </div>
        ) : undefined
      }
    >
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        {revisionPlans.length === 0 ? (
          <FirstRevisionCard onGenerate={openGenerator} />
        ) : (
          <RevisionPlanCarousel plans={revisionPlans} onOpen={openPlan} />
        )}

        <div className="grid grid-cols-3 gap-3">
          <StatChip icon={<ChartIcon className="h-5 w-5 text-indigo-600" />} label="Revisions" value={String(data.quickStats.testsCompleted)} />
          <StatChip icon={<TargetIcon className="h-5 w-5 text-emerald-600" />} label="Accuracy" value={`${data.quickStats.overallAccuracy}%`} />
          <StatChip icon={<FlameIcon className="h-5 w-5 text-orange-600" />} label="Streak" value={`${data.quickStats.streak}d`} />
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Weak Topics</h2>
            <button type="button" onClick={() => navigate("#/revision/weak-topics")} className="text-xs font-semibold text-indigo-600">
              View all
            </button>
          </div>
          {data.weakTopicSummary.length === 0 ? (
            <p className="text-sm text-slate-500">No weak topics yet. Complete a revision plan to build your learning profile.</p>
          ) : (
            <div className="space-y-3">
              {data.weakTopicSummary.map((topic) => (
                <div key={topic.topicId} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">{topic.subjectIcon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-slate-800">{topic.topicName}</p>
                      <span className="ml-2 flex items-center gap-1 text-xs font-semibold text-slate-600">
                        {trendIcon(topic.trend)} {topic.accuracy}%
                      </span>
                    </div>
                    <ProgressBar value={topic.accuracy} className="mt-1.5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Revision Bank</h2>
            <button type="button" onClick={() => navigate("#/revision/bank")} className="text-xs font-semibold text-indigo-600">
              Open
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <BankCount tone="amber" value={data.revisionBankSummary.learning} label="Learning" />
            <BankCount tone="sky" value={data.revisionBankSummary.improving} label="Improving" />
            <BankCount tone="emerald" value={data.revisionBankSummary.mastered} label="Mastered" />
          </div>
          {data.revisionBankSummary.due > 0 ? (
            <PrimaryButton className="mt-3" onClick={() => navigate("#/revision/bank")}>
              <SparklesIcon className="h-4 w-4" /> Revise {data.revisionBankSummary.due} due question{data.revisionBankSummary.due === 1 ? "" : "s"}
            </PrimaryButton>
          ) : (
            <p className="mt-3 text-center text-xs text-slate-400">
              {data.revisionBankSummary.total === 0 ? "Your revision bank will grow from your completed plans." : "You're all caught up on revisions 🎉"}
            </p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function FirstRevisionCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <Card className="relative min-h-[270px] overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-0 text-white">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-indigo-300/10" />
      <div className="relative flex min-h-[270px] flex-col p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-sm backdrop-blur">
          <SparklesIcon className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-violet-100">Your first revision plan</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">Generate Questions with AI</h2>
        <p className="mt-2 text-sm leading-relaxed text-violet-100">
          Choose your class, subject, chapter and exact topics. AI will build a focused revision plan—nothing random.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="mt-auto flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-violet-700 shadow-lg shadow-violet-950/15 transition active:scale-[0.98]"
        >
          <SparklesIcon className="h-5 w-5" /> Create my revision plan
        </button>
      </div>
    </Card>
  );
}

function RevisionPlanCarousel({ plans, onOpen }: { plans: CustomTestListItem[]; onOpen: (plan: CustomTestListItem) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (activeIndex >= plans.length) setActiveIndex(Math.max(0, plans.length - 1));
  }, [activeIndex, plans.length]);

  const move = (step: number) => {
    if (plans.length < 2) return;
    setDirection(step);
    setActiveIndex((current) => (current + step + plans.length) % plans.length);
  };

  const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_DISTANCE || info.velocity.x <= -SWIPE_VELOCITY) move(1);
    else if (info.offset.x >= SWIPE_DISTANCE || info.velocity.x >= SWIPE_VELOCITY) move(-1);
  };

  const plan = plans[activeIndex];
  return (
    <section aria-label="Your revision plans">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={plan.id}
          custom={direction}
          initial={{ x: direction > 0 ? 70 : -70, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction > 0 ? -70 : 70, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          drag={plans.length > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={onDragEnd}
          className="cursor-grab touch-pan-y active:cursor-grabbing"
        >
          <RevisionPlanCard plan={plan} onOpen={() => onOpen(plan)} position={`${activeIndex + 1} of ${plans.length}`} />
        </motion.div>
      </AnimatePresence>

      {plans.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button type="button" onClick={() => move(-1)} aria-label="Previous revision plan" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-100 transition active:scale-90">
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-[132px] text-center">
            <p className="text-xs font-semibold text-slate-500">Swipe to change plan</p>
            <div className="mt-1.5 flex justify-center gap-1">
              {plans.map((item, index) => (
                <span key={item.id} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-5 bg-indigo-600" : "w-1.5 bg-slate-300"}`} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => move(1)} aria-label="Next revision plan" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-md transition active:scale-90">
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      )}
    </section>
  );
}

function RevisionPlanCard({ plan, onOpen, position }: { plan: CustomTestListItem; onOpen: () => void; position: string }) {
  const details = plan.planDetails;
  const subjects = displayList(details.subjectNames, "Subject not labelled");
  const chapters = displayList(details.chapterNames, "Chapter not labelled");
  const topics = displayList(details.topicNames, "All selected chapter topics");
  const action = plan.status === "completed" ? "View Revision Results" : plan.status === "in_progress" ? "Continue Revision" : "Start Revision";

  return (
    <Card className="relative min-h-[270px] overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-0 text-white shadow-lg shadow-indigo-200">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-400/15" />
      <div className="relative flex min-h-[270px] flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">Start Revision</p>
            <h2 className="mt-1 line-clamp-2 text-xl font-extrabold leading-tight">{subjects}</h2>
          </div>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-indigo-100">{position}</span>
        </div>

        <div className="mt-3 space-y-1.5 rounded-2xl bg-white/10 p-3 text-xs backdrop-blur-sm">
          {details.classNames.length > 0 && <PlanRow label="Class" value={displayList(details.classNames, "")} />}
          <PlanRow label="Chapter" value={chapters} />
          <PlanRow label="Topics" value={topics} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-100">
          <span className="flex items-center gap-1"><BankIcon className="h-4 w-4" /> {plan.totalQuestions} questions</span>
          <span className="flex items-center gap-1"><ClockIcon className="h-4 w-4" /> {plan.estimatedMinutes} min</span>
          <span className="rounded-full bg-white/10 px-2 py-1 capitalize">{details.difficulty} difficulty</span>
          <span className="rounded-full bg-white/10 px-2 py-1">{questionModeLabel(details.questionMode)}</span>
        </div>

        <button type="button" onClick={onOpen} className="mt-auto flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-indigo-800 shadow-sm transition active:scale-[0.98]">
          {plan.status === "completed" && <CheckIcon className="h-4 w-4" />}
          {action}
          {plan.status !== "completed" && <ChevronRightIcon className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  );
}

function displayList(items: string[], fallback: string) {
  if (items.length === 0) return fallback;
  if (items.length <= 2) return items.join(" · ");
  return `${items.slice(0, 2).join(" · ")} +${items.length - 2}`;
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return <p className="line-clamp-1"><span className="font-bold text-indigo-200">{label}:</span> <span className="text-white">{value}</span></p>;
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-100 bg-white py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      {icon}<span className="text-base font-bold text-slate-900">{value}</span><span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}

function BankCount({ tone, value, label }: { tone: "amber" | "sky" | "emerald"; value: number; label: string }) {
  const tones = { amber: "bg-amber-50 text-amber-700", sky: "bg-sky-50 text-sky-700", emerald: "bg-emerald-50 text-emerald-700" };
  return <div className={`rounded-2xl py-2.5 ${tones[tone]}`}><p className="text-lg font-bold">{value}</p><p className="text-[11px] font-medium">{label}</p></div>;
}
