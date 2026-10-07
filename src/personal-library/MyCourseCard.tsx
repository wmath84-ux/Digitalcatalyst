// src/personal-library/MyCourseCard.tsx
//
// One learner-authored course in the Study Library grid.
//
// Uses the shared collection-card surface and compact spacing, with a 4:3
// cover and natural-height copy. Scoped CSS protects images and actions from
// viewport-wide tablet overrides without changing the course controls.
//
// Owner brief (2026-09-29): a self-created course can be deleted straight from
// its card — the row under the title carries Play, Edit AND Delete (Delete
// asks for a confirmation first; the builder keeps its own delete as well) —
// and a course whose learner never picked a cover shows a random bundled one
// instead of an empty placeholder (the client also persists one at save time).

import { Layers3, PencilLine, Play, Trash2 } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import { countModules, countResources } from "../lib/myCourseClient";
import { fallbackCoverImage } from "../lib/myCourseCovers";
import type { MyCourse } from "../types/myCourse";
import "../components/collection-cards.css";

interface MyCourseCardProps {
  course: MyCourse;
  onPlay: (course: MyCourse) => void;
  onEdit: (course: MyCourse) => void;
  onDelete: (course: MyCourse) => void;
}

export default function MyCourseCard({ course, onPlay, onEdit, onDelete }: MyCourseCardProps) {
  const moduleCount = countModules(course.modules);
  const resourceCount = countResources(course.modules);
  // No cover set → a stable random one from the bundled pool (never a gap).
  const cover = String(course.coverImage || "").trim() || fallbackCoverImage(course.id);

  return (
    <GlassSurface
      radius={24}
      tint={0.25}
      blur={0}
      className="dc-scene-plate dc-collection-card group"
      contentClassName="flex flex-col"
      data-my-course-card={course.id}
    >
      <div className="dc-collection-media relative aspect-[4/3] w-full overflow-hidden">
        <img
          src={cover}
          alt={course.title || "Course cover"}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          data-my-course-cover={course.coverImage ? "" : "fallback"}
        />
        <span className="absolute left-2 top-2 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          My course
        </span>
        {resourceCount > 0 ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-[var(--dc-chrome-glass)] px-1.5 py-0.5 text-[10px] font-semibold text-white [backdrop-filter:var(--dc-chrome-glass-blur)]">
            <Layers3 size={11} />
            {moduleCount} module{moduleCount === 1 ? "" : "s"} · {resourceCount} resource{resourceCount === 1 ? "" : "s"}
          </span>
        ) : null}

        {/* Play — the whole artwork is the tap target, like a store tile. */}
        <button
          type="button"
          onClick={() => onPlay(course)}
          aria-label={`Play ${course.title || "course"}`}
          title="Open in the Course Player"
          className="absolute inset-0 grid place-items-center bg-black/0 transition hover:bg-black/25 focus-visible:bg-black/30"
          data-my-course-play={course.id}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 opacity-0 ring-1 ring-white/40 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Play size={24} className="ml-0.5 fill-white text-white" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onEdit(course)}
          aria-label={`Edit ${course.title || "course"}`}
          title="Edit this course"
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/65 active:scale-95"
          data-my-course-edit={course.id}
        >
          <PencilLine size={15} />
        </button>
      </div>

      <div className="dc-collection-body">
        <h4 className="dc-collection-title" title={course.title || "Untitled course"} data-my-course-title>
          {course.title || "Untitled course"}
        </h4>
        {course.description ? (
          <p className="dc-collection-meta line-clamp-2">{course.description}</p>
        ) : (
          <p className="dc-collection-meta">Tap play to open the Course Player</p>
        )}
        {/* Actions wrap to the card width and keep 44px touch targets. */}
        <div className="dc-collection-actions">
          <button
            type="button"
            onClick={() => onPlay(course)}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-violet-600 px-3 text-[11px] font-black text-white transition hover:bg-violet-500 active:scale-[0.98]"
            data-my-course-play-button={course.id}
          >
            <Play size={12} /> Play
          </button>
          <button
            type="button"
            onClick={() => onEdit(course)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-black text-white/75 ring-1 ring-white/15 transition hover:bg-white/10 active:scale-[0.98]"
            data-my-course-edit-button={course.id}
          >
            <PencilLine size={12} /> Edit
          </button>
          {/* Delete lives right next to Edit — the card is where the learner
              looks for it. It only ASKS; the shelf deletes after the confirm. */}
          <button
            type="button"
            onClick={() => onDelete(course)}
            aria-label={`Delete ${course.title || "course"}`}
            title="Delete this course"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[11px] font-black text-rose-300 ring-1 ring-rose-400/25 transition hover:bg-rose-500/15 active:scale-[0.98]"
            data-my-course-delete={course.id}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </GlassSurface>
  );
}
