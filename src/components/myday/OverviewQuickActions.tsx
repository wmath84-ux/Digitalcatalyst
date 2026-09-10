import { ArrowRight, CalendarClock, FileText, ListChecks, Plus } from "lucide-react";

interface OverviewQuickActionsProps {
  onAddTask: () => void;
  onNewNote: () => void;
  onViewSchedule: () => void;
  onStartRevision: () => void;
  onSeeAll: () => void;
}

/**
 * The overview's quick-action row. Every card is wired to the existing
 * My Day flows — nothing here is decorative.
 */
export default function OverviewQuickActions({
  onAddTask,
  onNewNote,
  onViewSchedule,
  onStartRevision,
  onSeeAll,
}: OverviewQuickActionsProps) {
  const cards = [
    {
      id: "add-task",
      title: "Add Task",
      sub: "Plan your study",
      icon: Plus,
      tone: "myday-qa--task",
      action: onAddTask,
      label: "Add Task — plan your study",
    },
    {
      id: "new-note",
      title: "New Note",
      sub: "Capture ideas",
      icon: FileText,
      tone: "myday-qa--note",
      action: onNewNote,
      label: "New Note — capture ideas",
    },
    {
      id: "view-schedule",
      title: "View Schedule",
      sub: "Manage your day",
      icon: CalendarClock,
      tone: "myday-qa--schedule",
      action: onViewSchedule,
      label: "View Schedule — manage your day",
    },
    {
      id: "start-revision",
      title: "Start Revision",
      sub: "Practice & grow",
      icon: ListChecks,
      tone: "myday-qa--revision",
      action: onStartRevision,
      label: "Start Revision — practice and grow",
    },
  ];

  return (
    <section aria-label="Quick actions">
      <div className="myday-section-head mb-2.5 px-0.5">
        <h2 className="myday-section-title">Quick Actions</h2>
        <button type="button" className="myday-see-all" onClick={onSeeAll}>
          See all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="myday-qa-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              aria-label={card.label}
              onClick={card.action}
              className={`myday-qa ${card.tone}`}
            >
              <span className="myday-qa-icon">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="myday-qa-title">{card.title}</span>
              <span className="myday-qa-sub">{card.sub}</span>
              <ArrowRight className="myday-qa-arrow h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
