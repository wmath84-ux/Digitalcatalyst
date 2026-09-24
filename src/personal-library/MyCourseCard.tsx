// src/personal-library/MyCourseCard.tsx
//
// One learner-authored course in the Study Library grid.
//
// It is drawn with the SAME material and geometry as the store's product card
// (src/home/components/ProductCard.tsx — `dc-scene-plate`, radius 24, 4:3
// artwork, title underneath), so a course the learner built sits in the
// library exactly like a course they bought.
//
// The card carries ONLY what the learner asked for: the cover image, the
// title, Play and Edit. Everything else (rename, delete, the module tree, the
// questions) lives in the editor, behind Edit.

import { ImagePlus, Layers3, PencilLine, Play } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import { countModules, countResources } from "../lib/myCourseClient";
import type { MyCourse } from "../types/myCourse";

interface MyCourseCardProps {
  course: MyCourse;
  onPlay: (course: MyCourse) => void;
  onEdit: (course: MyCourse) => void;
}

export default function MyCourseCard({ course, onPlay, onEdit }: MyCourseCardProps) {
  const moduleCount = countModules(course.modules);
  const resourceCount = countResources(course.modules);

  return (
    <GlassSurface
      radius={24}
      tint={0.25}
      blur={0}
      className="dc-scene-plate group relative overflow-hidden text-white transition-transform duration-200 active:scale-[0.98]"
      contentClassName="flex flex-col"
      data-my-course-card={course.id}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {course.coverImage ? (
          <img
            src={course.coverImage}
            alt={course.title || "Course cover"}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            data-my-course-cover=""
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600/35 via-indigo-600/25 to-cyan-500/25"
            data-my-course-cover="empty"
          >
            <ImagePlus className="h-9 w-9 text-white/45" />
          </span>
        )}
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
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/65 active:scale-95"
          data-my-course-edit={course.id}
        >
          <PencilLine size={15} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h4 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-tight text-white/85" data-my-course-title>
          {course.title || "Untitled course"}
        </h4>
        {course.description ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-white/50">{course.description}</p>
        ) : (
          <p className="text-[11px] text-white/40">Tap play to open the Course Player</p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
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
        </div>
      </div>
    </GlassSurface>
  );
}
