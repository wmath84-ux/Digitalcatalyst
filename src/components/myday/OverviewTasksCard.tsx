import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import type { Task } from "../../types";
import { GlassSurface } from "../ui/glass";
import TaskItem from "./TaskItem";

interface OverviewTasksCardProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSeeAll: () => void;
}

const PREVIEW_COUNT = 3;

/**
 * The overview's "Today's Tasks" card. It renders the learner's REAL task
 * rows (the same TaskItem the Tasks page uses, so toggle / edit / delete
 * behave identically) and the polished empty state when there is nothing
 * planned yet.
 */
export default function OverviewTasksCard({
  tasks,
  onToggle,
  onCycleStatus,
  onEdit,
  onDelete,
  onAdd,
  onSeeAll,
}: OverviewTasksCardProps) {
  const preview = tasks.slice(0, PREVIEW_COUNT);

  return (
    <GlassSurface
      radius={24}
      className="dc-scene-plate h-full text-white"
      contentClassName="myday-card-pad flex h-full flex-col"
    >
      <div className="myday-section-head mb-3">
        <h2 className="myday-section-title flex items-center gap-2">
          <ClipboardList className="h-[18px] w-[18px] text-violet-300" aria-hidden="true" />
          Today&apos;s Tasks
        </h2>
        <button type="button" className="myday-see-all" onClick={onSeeAll} aria-label="See all tasks">
          See all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="myday-empty flex-1 justify-center">
          <span className="myday-empty-icon">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="myday-empty-title">No tasks for today</p>
          <p className="myday-empty-sub">Add a task to get started and make progress!</p>
          <button type="button" className="myday-cta mt-2" onClick={onAdd}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add your first task
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {preview.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onCycleStatus={onCycleStatus}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {tasks.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={onSeeAll}
              className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-xs font-bold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            >
              View all {tasks.length} tasks
            </button>
          )}
        </div>
      )}
    </GlassSurface>
  );
}
