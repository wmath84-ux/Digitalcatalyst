import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Check, Star, BookOpen } from "lucide-react";
import type { Course } from "../data/courses";

interface Props {
  open: boolean;
  courses: Course[];
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
}

export default function CourseSelectModal({
  open,
  courses,
  selected,
  onClose,
  onChangeSelected,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [courses, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.includes(c.id));

  const toggleCourse = (id: string) => {
    if (selected.includes(id)) {
      onChangeSelected(selected.filter((s) => s !== id));
    } else {
      onChangeSelected([...selected, id]);
    }
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((c) => c.id));
      onChangeSelected(selected.filter((id) => !filteredIds.has(id)));
    } else {
      const merged = new Set([...selected, ...filtered.map((c) => c.id)]);
      onChangeSelected(Array.from(merged));
    }
  };

  const selectedTotal = courses
    .filter((c) => selected.includes(c.id))
    .reduce((sum, c) => sum + c.price, 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[28px] bg-white shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-slate-200" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Select Courses
                </h2>
                <p className="text-xs text-slate-400">
                  {selected.length} of {courses.length} selected · $
                  {selectedTotal.toFixed(2)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform"
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-violet-400">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses..."
                  className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="text-slate-400 active:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={toggleSelectAll}
              className="mx-5 mb-2 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                    allFilteredSelected
                      ? "border-violet-600 bg-violet-600"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {allFilteredSelected && (
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  )}
                </span>
                <span className="text-sm font-bold text-slate-700">
                  Select All {query ? "(filtered)" : ""}
                </span>
              </div>
              <span className="text-xs font-medium text-violet-600">
                {filtered.length} courses
              </span>
            </button>

            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <BookOpen className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-400">
                    No courses match "{query}"
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {filtered.map((course) => {
                    const isChecked = selected.includes(course.id);
                    return (
                      <li key={course.id}>
                        <button
                          onClick={() => toggleCourse(course.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                            isChecked
                              ? "border-violet-200 bg-violet-50"
                              : "border-slate-100 bg-white"
                          }`}
                        >
                          <img
                            src={course.image}
                            alt={course.name}
                            className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">
                              {course.name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500">
                                {course.category}
                              </span>
                              <span>{course.lessons} lessons</span>
                              <span className="flex items-center gap-0.5 text-amber-500">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {course.rating}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-sm font-extrabold text-slate-800">
                              ${course.price.toFixed(2)}
                            </span>
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                                isChecked
                                  ? "border-violet-600 bg-violet-600"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {isChecked && (
                                <Check
                                  className="h-3.5 w-3.5 text-white"
                                  strokeWidth={3}
                                />
                              )}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform"
              >
                Done · {selected.length} courses · ${selectedTotal.toFixed(2)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
