// src/personal-library/StudyLibraryPage.tsx
//
// My Study Library — the learner's own course shelf.
//
// Rebuilt as a CREATION surface. The old library was a flat list of saved
// links and borrowed resources; this one holds whole courses the learner
// designed themselves:
//
//   · a "+" tile / button opens the builder (cover image, title, modules,
//     folders inside folders, resources, Brain MCQ sets)
//   · every course is a card drawn with the store's own product-card
//     material, carrying only the cover, the title, Play and Edit
//   · Play opens the SAME Course Player a purchased course opens, on the
//     modules and practice the learner built.
//
// Nothing else lives on this page any more — no separate module cards,
// resource lists, filters or plan-usage panels — because the course itself
// now carries all of that inside the player.

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft, ImagePlus, Layers3, Library, Plus, RefreshCw, Sparkles,
} from "lucide-react";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { useMyCourses } from "../hooks/useMyCourses";
import { countModules, countResources } from "../lib/myCourseClient";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import type { MyCourse } from "../types/myCourse";
import MyCourseCard from "./MyCourseCard";

/** Routes the library navigates to (kept in one place — see appRoutes.ts). */
export const MY_COURSE_NEW_HASH = "#/my-course/new";
export const myCoursePlayHash = (courseId: string) => `#/my-course/${encodeURIComponent(courseId)}`;
export const myCourseEditHash = (courseId: string) => `#/my-course/${encodeURIComponent(courseId)}/edit`;

const navigateFromBottom = (tab: TabKey) => {
  if (tab === "home") window.location.hash = "#/home";
  else if (tab === "myday") window.location.hash = "#/my-day";
  else if (tab === "store") window.location.hash = "#/store";
  else if (tab === "purchases") window.location.hash = "#/store/purchases";
  else if (tab === "profile") window.location.hash = "#/profile";
  else if (tab === "revision") window.location.hash = "#/revision";
};

export default function StudyLibraryPage() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { purchasedIds } = useCatalog();
  const myCourses = useMyCourses();
  const [query, setQuery] = useState("");

  const courses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return myCourses.courses;
    return myCourses.courses.filter((course) =>
      `${course.title} ${course.description || ""}`.toLowerCase().includes(needle),
    );
  }, [myCourses.courses, query]);

  const totals = useMemo(
    () => ({
      courses: myCourses.courses.length,
      modules: myCourses.courses.reduce((total, course) => total + countModules(course.modules), 0),
      resources: myCourses.courses.reduce((total, course) => total + countResources(course.modules), 0),
    }),
    [myCourses.courses],
  );

  const openCourse = useCallback((course: MyCourse) => {
    trackFeatureEvent("my_course_played", { surface: "study_library" });
    window.location.hash = myCoursePlayHash(course.id);
  }, []);

  const editCourse = useCallback((course: MyCourse) => {
    trackFeatureEvent("my_course_edited", { surface: "study_library" });
    window.location.hash = myCourseEditHash(course.id);
  }, []);

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center text-white" data-study-library-page>
        <div>
          <Library className="mx-auto h-12 w-12 text-violet-300" />
          <h1 className="mt-4 text-2xl font-black">Sign in to open your library</h1>
        </div>
      </main>
    );
  }

  return (
    <div data-study-library-page className="min-h-screen text-white">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-screen sm:overflow-hidden sm:rounded-none sm:border-0 lg:max-w-full">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          title="Study Library"
          subtitle="Courses you built"
          onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
          onNavigateToCart={() => { window.location.hash = "#/cart"; }}
          onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
        />

        <main data-study-library-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 pt-3 sm:px-5 lg:px-7 xl:px-9">
          <div className="mx-auto w-full max-w-[1500px] space-y-5">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => { window.location.hash = "#/profile"; }}
                  className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-white/65 ring-1 ring-white/10 transition hover:bg-white/10"
                >
                  <ArrowLeft size={14} /> Profile
                </button>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Your learning workspace</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">My Study Library</h1>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-white/55">
                  Apna course khud banayein — cover image, modules, resources aur Brain MCQ — aur use poore Course Player mein play karein.
                </p>
              </div>

              {totals.courses > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-black text-white/60">
                    <Layers3 size={13} /> {totals.courses} course{totals.courses === 1 ? "" : "s"} · {totals.modules} module{totals.modules === 1 ? "" : "s"} · {totals.resources} resource{totals.resources === 1 ? "" : "s"}
                  </span>
                </div>
              ) : null}
            </header>

            {myCourses.state === "loading" && myCourses.courses.length === 0 ? (
              <LibrarySkeleton />
            ) : myCourses.state === "error" && myCourses.courses.length === 0 ? (
              <div className="grid min-h-72 place-items-center rounded-3xl border border-rose-400/20 bg-rose-500/10 p-8 text-center">
                <div>
                  <RefreshCw className="mx-auto h-8 w-8 text-rose-200" />
                  <p className="mt-3 font-black">Your library couldn't load</p>
                  <p className="mt-1 text-sm text-white/60">
                    {myCourses.error || "The server is temporarily unavailable. This usually resolves within a few seconds."}
                  </p>
                  <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={myCourses.reload}
                      className="min-h-11 rounded-full bg-white/10 px-5 text-sm font-black ring-1 ring-white/20 transition hover:bg-white/15 active:scale-95"
                    >
                      <RefreshCw className="mr-1.5 inline h-4 w-4" /> Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="min-h-11 rounded-full px-5 text-xs font-bold text-white/50 underline-offset-2 hover:text-white/70 hover:underline"
                    >
                      Reload page
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {myCourses.courses.length > 3 ? (
                  <div className="relative">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search your courses…"
                      aria-label="Search your courses"
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-violet-400/60"
                      data-my-course-search
                    />
                  </div>
                ) : null}

                <section aria-labelledby="my-courses-heading">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Built by you</p>
                      <h2 id="my-courses-heading" className="mt-0.5 text-xl font-black">My courses</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => { window.location.hash = MY_COURSE_NEW_HASH; }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-violet-600 px-4 text-[11px] font-black transition hover:bg-violet-500"
                      data-my-course-create-inline
                    >
                      <Plus size={14} /> New course
                    </button>
                  </div>

                  <div
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                    data-my-course-grid
                  >
                    {courses.map((course) => (
                      <MyCourseCard key={course.id} course={course} onPlay={openCourse} onEdit={editCourse} />
                    ))}

                    {/* The "+" tile is the same size as a card, so the grid
                        never jumps when the first course is created. */}
                    <button
                      type="button"
                      onClick={() => { window.location.hash = MY_COURSE_NEW_HASH; }}
                      aria-label="Create a new module or folder"
                      className="group flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/20 bg-white/[0.025] p-4 text-center transition hover:border-violet-400/50 hover:bg-violet-500/[0.08] active:scale-[0.99] sm:aspect-auto sm:min-h-[15rem]"
                      data-my-course-create
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30 transition group-hover:bg-violet-500/25">
                        <Plus size={26} />
                      </span>
                      <span className="text-sm font-black">Create module / folder</span>
                      <span className="max-w-[15rem] text-[11px] font-medium leading-5 text-white/45">
                        Cover image, title, file type, name, resource aur Brain MCQ — sab kuch yahin se.
                      </span>
                    </button>
                  </div>
                </section>

                {myCourses.courses.length === 0 ? (
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center" data-my-course-empty>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-violet-200">
                      <ImagePlus size={24} />
                    </span>
                    <h3 className="mt-4 text-lg font-black">Build your first course</h3>
                    <p className="mx-auto mt-1 max-w-md text-sm font-medium leading-6 text-white/50">
                      Ek module ya folder banayein, usme resources (video, PDF, link) aur Brain MCQ add karein — aur phir
                      Play dabakar apna khud ka Course Player kholein.
                    </p>
                    <button
                      type="button"
                      onClick={() => { window.location.hash = MY_COURSE_NEW_HASH; }}
                      className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-600 px-6 text-sm font-black transition hover:bg-violet-500"
                      data-my-course-create-empty
                    >
                      <Plus size={16} /> New course
                    </button>
                  </section>
                ) : null}

                {myCourses.courses.length > 0 ? (
                  <p className="flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-white/35">
                    <Sparkles size={12} /> Har course apne aap save hota hai — Play karte hi Course Player khul jaata hai.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </main>

        {/* The floating "+" — always one tap away, on every screen size. */}
        <button
          type="button"
          onClick={() => { window.location.hash = MY_COURSE_NEW_HASH; }}
          aria-label="Create a new module or folder"
          title="New module / folder"
          className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_12px_30px_-10px_rgba(124,92,255,0.9)] transition hover:brightness-110 active:scale-95 sm:bottom-28 sm:right-6 lg:bottom-8"
          data-my-course-create-fab
        >
          <Plus size={26} />
        </button>

        <BottomNav active="study-library" onChange={navigateFromBottom} purchasesBadge={purchasedIds.size} />
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading My Study Library" data-my-course-skeleton>
      <div className="h-32 animate-pulse rounded-3xl bg-white/[0.05]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="aspect-[4/3] animate-pulse rounded-3xl bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}
