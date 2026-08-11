import { ChevronRight, LayoutGrid } from "lucide-react";
import type { Course } from "../data/courses";

interface Props {
  courses: Course[];
  selectedIds: string[];
  onOpen: () => void;
}

export default function CourseSelectTrigger({
  courses,
  selectedIds,
  onOpen,
}: Props) {
  const selectedCourses = courses.filter((c) => selectedIds.includes(c.id));
  const preview = selectedCourses.slice(0, 4);
  const total = selectedCourses.reduce((s, c) => s + c.price, 0);

  return (
    <div className="px-5 pt-5">
      <button
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/60 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50">
            <LayoutGrid className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Select Courses</p>
            {selectedCourses.length === 0 ? (
              <p className="text-xs text-slate-400">
                Choose courses for your learning path
              </p>
            ) : (
              <p className="text-xs font-medium text-violet-600">
                {selectedCourses.length} course
                {selectedCourses.length !== 1 ? "s" : ""} · ${total.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {preview.length > 0 && (
            <div className="flex -space-x-2.5">
              {preview.map((c) => (
                <img
                  key={c.id}
                  src={c.image}
                  alt={c.name}
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
                />
              ))}
              {selectedCourses.length > 4 && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white ring-2 ring-white">
                  +{selectedCourses.length - 4}
                </span>
              )}
            </div>
          )}
          <ChevronRight className="h-4.5 w-4.5 text-slate-300" />
        </div>
      </button>
    </div>
  );
}
