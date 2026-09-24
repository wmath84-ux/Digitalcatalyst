// src/personal-library/MyCoursePlayerPage.tsx
//
// Route host for `#/my-course/<courseId>` — the Course Player opened on a
// course the LEARNER built in My Study Library.
//
// It resolves the course (from the library's live Firestore listener — no
// extra read), projects it into the same `Product` shape the official player
// consumes (src/lib/myCourseAdapter.ts) and hands it to the SAME
// `<CoursePlayer>`: identical viewer stack, Modules tab, Brain practice,
// Notes, Mind map, AI chat and Player settings. The only differences are the
// ones the Course Player applies for `mine` (no Paid tab, no official-resource
// rows in the settings).
//
// There is no access check: a learner always owns what they authored.

import { Suspense, lazy, useEffect, useMemo } from "react";
import { ArrowLeft, Library, LoaderCircle, RefreshCw } from "lucide-react";
import { useMyCourses } from "../hooks/useMyCourses";
import { myCourseToProduct } from "../lib/myCourseAdapter";
import type { PaidCourseUpdate } from "../types/course";

// The player is the heaviest chunk in the app; it is fetched only when a
// course is actually opened (same reason the official route lazy-loads it).
const CoursePlayer = lazy(() => import("../CoursePlayerApp"));

interface MyCoursePlayerPageProps {
  courseId: string | null;
  /** Back to My Study Library (the player's own logo button uses it too). */
  onBack: () => void;
}

export default function MyCoursePlayerPage({ courseId, onBack }: MyCoursePlayerPageProps) {
  const myCourses = useMyCourses();
  const course = courseId ? myCourses.getCourse(courseId) : null;

  // The library listener is the only read. Nothing else fetches the course,
  // so opening a player is free once the library has loaded.
  useEffect(() => {
    if (!course) return;
    document.title = `${course.title || "My course"} · Course Player`;
    return () => {
      document.title = typeof document === "undefined" ? "" : document.title;
    };
  }, [course]);

  const product = useMemo(() => (course ? myCourseToProduct(course) : null), [course]);

  if (!courseId) {
    return <MyCourseMissing onBack={onBack} message="That course link is not valid." />;
  }

  if (!course) {
    if (myCourses.state === "loading") {
      return (
        <div className="grid min-h-[100dvh] place-items-center text-white" data-my-course-player-loading>
          <div className="flex flex-col items-center gap-2">
            <LoaderCircle className="h-7 w-7 animate-spin text-violet-300" />
            <p className="text-sm font-semibold text-white/60">Opening your course…</p>
          </div>
        </div>
      );
    }
    if (myCourses.state === "error") {
      return (
        <div className="grid min-h-[100dvh] place-items-center px-6 text-center text-white" data-my-course-player-error>
          <div>
            <RefreshCw className="mx-auto h-8 w-8 text-rose-200" />
            <p className="mt-3 text-lg font-black">Your course could not be loaded</p>
            <p className="mt-1 text-sm text-white/60">{myCourses.error || "Check your connection and try again."}</p>
            <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <button type="button" onClick={myCourses.reload} className="min-h-11 rounded-full bg-white/10 px-5 text-sm font-black ring-1 ring-white/20">
                Try again
              </button>
              <button type="button" onClick={onBack} className="min-h-11 rounded-full px-5 text-xs font-bold text-white/55 underline-offset-2 hover:text-white/75 hover:underline">
                Back to My Study Library
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <MyCourseMissing
        onBack={onBack}
        message="This course is no longer in your library."
        action={{ label: "Open My Study Library", onClick: onBack }}
      />
    );
  }

  if (!product) return null;

  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center text-white" data-my-course-player-loading>
          <LoaderCircle className="h-7 w-7 animate-spin text-violet-300" />
        </div>
      }
    >
      <CoursePlayer
        key={course.id}
        product={product}
        onBack={onBack}
        // Nothing in a learner-authored course is purchasable, so nothing is
        // ever bought from this route — the handler stays a no-op.
        onPurchaseUpdate={() => undefined}
        mine={{ courseId: course.id }}
      />
    </Suspense>
  );
}

function MyCourseMissing({
  onBack,
  message,
  action,
}: {
  onBack: () => void;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid min-h-[100dvh] place-items-center px-6 text-center text-white" data-my-course-player-missing>
      <div>
        <Library className="mx-auto h-10 w-10 text-violet-300" />
        <p className="mt-3 text-lg font-black">{message}</p>
        <button
          type="button"
          onClick={action?.onClick || onBack}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-600 px-5 text-sm font-black"
        >
          <ArrowLeft size={15} /> {action?.label || "Back to My Study Library"}
        </button>
      </div>
    </div>
  );
}

/** Kept so callers can type the player's purchase handler without importing it. */
export type MyCoursePurchaseUpdate = PaidCourseUpdate;
