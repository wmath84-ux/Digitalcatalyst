import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, ProgressBar } from "../components/ui";
import { GlassSurface } from "../../components/ui/glass";
import { GlassButton } from "../../components/ui/glass-button";
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
  if (trend === "improving") return <TrendUpIcon className="h-4 w-4 text-emerald-300" />;
  if (trend === "declining") return <TrendDownIcon className="h-4 w-4 text-rose-300" />;
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
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (!detail?.uid || detail.uid === uid) setDataVersion((version) => version + 1);
    };
    window.addEventListener("revision-db-changed", refresh);
    return () => window.removeEventListener("revision-db-changed", refresh);
  }, [uid]);
  const data = useMemo(() => getRevisionOverview(uid), [uid, dataVersion]);
  const revisionPlans = useMemo(() => listCustomTests(uid), [uid, dataVersion]);

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

  // Memoized so the header registration in PageShell doesn't re-register on
  // every render — a fresh JSX node each render would loop against the
  // context's shallow-compare guard.
  const streakSlot = useMemo(
    () =>
      data.quickStats.streak > 0 ? (
        <div className="flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/20 px-2.5 py-1.5 text-orange-200">
          <FlameIcon className="h-4 w-4" />
          <span className="text-xs font-bold">{data.quickStats.streak}</span>
        </div>
      ) : undefined,
    [data.quickStats.streak],
  );

  return (
    <PageShell
      route={route}
      title="Revision"
      subtitle={`Hi ${userName}, choose what you want to revise`}
      rightSlot={streakSlot}
      mergeIntoMainHeader
    >
      <div data-revision-page="dashboard" data-rev-layout="dashboard" className="animate-fade-in space-y-4 px-4 py-4 pb-8 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-3 lg:px-0 lg:py-0 lg:pb-0 lg:max-w-[1200px] lg:mx-auto">
        {/* The dashboard's plan column.
            • `flex flex-col` + the hero card's `flex-1`: on tablet / desktop the
              dashboard grid stretches its rows, and this panel is what the plan
              card fills. Without that chain the card stopped at its own height
              and the left half of the dashboard ended in a band of empty
              wallpaper — the "dashboard vertically shrink ho gaya" look.
            • The three quick stats live here on purpose (they used to be the top
              of the right column): the hero + the stat row make this column about
              as tall as the weak-topics + revision-bank stack next to it, so both
              columns read complete on every band instead of one trailing short.
            • `gap-*` rather than `space-y-*`, because the panel is a flex column. */}
        <div data-rev-panel="primary" className="flex flex-col gap-4 lg:col-span-7 lg:gap-3">
        {revisionPlans.length === 0 ? (
          <FirstRevisionCard onGenerate={openGenerator} />
        ) : (
          <RevisionPlanCarousel plans={revisionPlans} onOpen={openPlan} />
        )}
        <div data-rev-stat-grid className="grid shrink-0 grid-cols-3 gap-3 lg:gap-2">
          <StatChip icon={<ChartIcon className="h-5 w-5 text-indigo-300" />} label="Revisions" value={String(data.quickStats.testsCompleted)} />
          <StatChip icon={<TargetIcon className="h-5 w-5 text-emerald-300" />} label="Accuracy" value={`${data.quickStats.overallAccuracy}%`} />
          <StatChip icon={<FlameIcon className="h-5 w-5 text-orange-300" />} label="Streak" value={`${data.quickStats.streak}d`} />
        </div>
        </div>

        <div data-rev-panel="secondary" className="space-y-4 lg:col-span-5 lg:space-y-3">
        <div className="space-y-4 lg:space-y-3">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-white lg:text-[14px]">Weak Topics</h2>
            <button type="button" onClick={() => navigate("#/revision/weak-topics")} className="text-xs font-semibold text-indigo-300">
              View all
            </button>
          </div>
          {data.weakTopicSummary.length === 0 ? (
            <p className="text-sm text-white/75">No weak topics yet. Complete a revision plan to build your learning profile.</p>
          ) : (
            <div className="space-y-3">
              {data.weakTopicSummary.map((topic) => (
                <div key={topic.topicId} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg">{topic.subjectIcon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-white/85">{topic.topicName}</p>
                      <span className="ml-2 flex items-center gap-1 text-xs font-semibold text-white/75">
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
            <h2 className="text-[15px] font-bold text-white">Revision Bank</h2>
            <button type="button" onClick={() => navigate("#/revision/bank")} className="text-xs font-semibold text-indigo-300">
              Open
            </button>
          </div>
          <div data-rev-bank-grid className="grid grid-cols-3 gap-2 text-center">
            <BankCount tone="amber" value={data.revisionBankSummary.learning} label="Learning" />
            <BankCount tone="sky" value={data.revisionBankSummary.improving} label="Improving" />
            <BankCount tone="emerald" value={data.revisionBankSummary.mastered} label="Mastered" />
          </div>
          {data.revisionBankSummary.due > 0 ? (
            <PrimaryButton className="mt-3" onClick={() => navigate("#/revision/bank")}>
              <SparklesIcon className="h-4 w-4" /> Revise {data.revisionBankSummary.due} due question{data.revisionBankSummary.due === 1 ? "" : "s"}
            </PrimaryButton>
          ) : (
            <p className="mt-3 text-center text-xs font-medium text-white/55">
              {data.revisionBankSummary.total === 0 ? "Your revision bank will grow from your completed plans." : "You're all caught up on revisions 🎉"}
            </p>
          )}
        </Card>
        </div>
        </div>
      </div>
    </PageShell>
  );
}

function FirstRevisionCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    /* `flex-auto` (1 1 auto), never `flex-1` (1 1 0%): a zero flex basis lets a
       card shrink to less than its own content, which `overflow-hidden` would
       then clip. `auto` keeps the content height as the floor and still grows
       into whatever the row gives the column. */
    <GlassSurface className="relative flex min-h-[270px] flex-auto flex-col overflow-hidden text-white lg:min-h-[220px]" contentClassName="flex min-h-0 flex-1 flex-col p-5 lg:p-4">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur lg:h-10 lg:w-10 lg:rounded-xl">
          <SparklesIcon className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-violet-100">Your first revision plan</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">Generate Questions with AI</h2>
        <p className="mt-2 text-sm leading-relaxed text-violet-100">
          Choose your class, subject, chapter and exact topics. AI will build a focused revision plan—nothing random.
        </p>
        <PrimaryButton onClick={onGenerate} className="mt-auto">
          <SparklesIcon className="h-5 w-5" /> Create my revision plan
        </PrimaryButton>
      </div>
    </GlassSurface>
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
    <section aria-label="Your revision plans" className="flex min-h-0 flex-auto flex-col">
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
          className="flex min-h-0 flex-auto cursor-grab flex-col touch-pan-y active:cursor-grabbing"
        >
          <RevisionPlanCard plan={plan} onOpen={() => onOpen(plan)} position={`${activeIndex + 1} of ${plans.length}`} />
        </motion.div>
      </AnimatePresence>

      {plans.length > 1 && (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-4">
          <GlassButton onClick={() => move(-1)} aria-label="Previous revision plan" className="[&_.size-12]:size-11">
            <ChevronLeftIcon className="h-5 w-5" />
          </GlassButton>
          <div className="min-w-[132px] text-center">
            <p className="text-xs font-semibold text-white/55">Swipe to change plan</p>
            <div className="mt-1.5 flex justify-center gap-1">
              {plans.map((item, index) => (
                <span key={item.id} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-5 bg-indigo-600" : "w-1.5 bg-white/25"}`} />
              ))}
            </div>
          </div>
          <GlassButton onClick={() => move(1)} aria-label="Next revision plan" className="[&_.size-12]:size-11">
            <ChevronRightIcon className="h-5 w-5" />
          </GlassButton>
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
    /* Same fill chain as `FirstRevisionCard` — `flex-auto`, not `flex-1`, so the
       card can never be squeezed below its content. */
    <GlassSurface className="relative flex min-h-[270px] flex-auto flex-col overflow-hidden text-white" contentClassName="flex min-h-0 flex-1 flex-col p-5">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">Start Revision</p>
            <h2 className="mt-1 line-clamp-2 text-xl font-extrabold leading-tight">{subjects}</h2>
          </div>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-indigo-100">{position}</span>
        </div>

        {/* The slack lands HERE, not under the copy: when the row is taller than the
            card's own content, the Class / Chapter / Topics box grows and centres its
            rows. That keeps the card filled instead of opening an empty band between
            the text and the button — which is what an `mt-auto` button would do (auto
            margins take free space before `flex-grow` can). */}
        <div data-rev-plan-details className="mt-3 flex min-h-0 flex-auto flex-col justify-center space-y-1.5 rounded-2xl bg-white/10 p-3 text-xs">
          {details.classNames.length > 0 && <PlanRow label="Class" value={displayList(details.classNames, "")} />}
          <PlanRow label="Chapter" value={chapters} />
          <PlanRow label="Topics" value={topics} />
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold text-indigo-100">
          <span className="flex items-center gap-1"><BankIcon className="h-4 w-4" /> {plan.totalQuestions} questions</span>
          <span className="flex items-center gap-1"><ClockIcon className="h-4 w-4" /> {plan.estimatedMinutes} min</span>
          <span className="rounded-full bg-white/10 px-2 py-1 capitalize">{details.difficulty} difficulty</span>
          <span className="rounded-full bg-white/10 px-2 py-1">{questionModeLabel(details.questionMode)}</span>
        </div>

        <div data-rev-plan-cta className="mt-3 min-h-[48px] w-full shrink-0">
          <PrimaryButton onClick={onOpen}>
            {plan.status === "completed" && <CheckIcon className="h-4 w-4" />}
            {action}
            {plan.status !== "completed" && <ChevronRightIcon className="h-4 w-4" />}
          </PrimaryButton>
        </div>
      </div>
    </GlassSurface>
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
    <GlassSurface tint={0.4} radius={20} className="text-white" contentClassName="flex flex-col items-center gap-1 py-3 lg:py-2">
      {icon}<span className="text-base font-bold text-white lg:text-sm">{value}</span><span className="text-[10px] font-medium text-white/55 lg:text-[9px]">{label}</span>
    </GlassSurface>
  );
}

function BankCount({ tone, value, label }: { tone: "amber" | "sky" | "emerald"; value: number; label: string }) {
  const tones = { amber: "bg-amber-500/20 text-amber-200", sky: "bg-sky-500/20 text-sky-200", emerald: "bg-emerald-500/20 text-emerald-200" };
  return <div className={`rounded-2xl py-2.5 ${tones[tone]}`}><p className="text-lg font-bold">{value}</p><p className="text-[11px] font-medium">{label}</p></div>;
}
