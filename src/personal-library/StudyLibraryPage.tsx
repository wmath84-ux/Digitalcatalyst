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
//     material, carrying the cover, the title, Play, Edit and Delete
//     (owner brief 2026-09-29: a self-created course deletes from its card —
//     through the same profile-card glass the Profile page wears)
//   · Play opens the SAME Course Player a purchased course opens, on the
//     modules and practice the learner built.
//
// Nothing else lives on this page any more — no separate module cards,
// resource lists, filters or plan-usage panels — because the course itself
// now carries all of that inside the player.

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import Header from "../components/Header";
import BottomNav, { type TabKey } from "../components/BottomNav";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { toast } from "../components/ui/glass-toast";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import { useCommerce } from "../context/CommerceContext";
import { useMyCourses } from "../hooks/useMyCourses";
import { countModules, countResources } from "../lib/myCourseClient";
import { trackFeatureEvent } from "../utils/featureAnalytics";
import type { MyCourse } from "../types/myCourse";
import MyCourseCard from "./MyCourseCard";
import "../profile/profile-minimal.css";
import "./study-library-minimal.css";

/** Routes the library navigates to (kept in one place — see appRoutes.ts). */
export const MY_COURSE_NEW_HASH = "#/my-course/new";
export const myCoursePlayHash = (courseId: string) => `#/my-course/${encodeURIComponent(courseId)}`;
export const myCourseEditHash = (courseId: string) =>
  `#/my-course/${encodeURIComponent(courseId)}/edit`;

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
      `${course.title} ${course.description || ""}`.toLowerCase().includes(needle)
    );
  }, [myCourses.courses, query]);

  const totals = useMemo(
    () => ({
      courses: myCourses.courses.length,
      modules: myCourses.courses.reduce((total, course) => total + countModules(course.modules), 0),
      resources: myCourses.courses.reduce(
        (total, course) => total + countResources(course.modules),
        0
      ),
    }),
    [myCourses.courses]
  );

  const openCourse = useCallback((course: MyCourse) => {
    trackFeatureEvent("my_course_played", { surface: "study_library" });
    window.location.hash = myCoursePlayHash(course.id);
  }, []);

  const editCourse = useCallback((course: MyCourse) => {
    trackFeatureEvent("my_course_edited", { surface: "study_library" });
    window.location.hash = myCourseEditHash(course.id);
  }, []);

  // Delete from the card (owner brief 2026-09-29). The card only ASKS — the
  // course is removed after the confirmation, which wears the exact glass the
  // Profile page's cards wear. The builder keeps its own Delete for edits.
  const [pendingDelete, setPendingDelete] = useState<MyCourse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestDelete = useCallback((course: MyCourse) => {
    setPendingDelete(course);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await myCourses.remove(pendingDelete.id);
      if (!result.ok) {
        toast({ title: "Course was not deleted", description: result.message, variant: "error" });
        return;
      }
      setPendingDelete(null);
      trackFeatureEvent("my_course_deleted", { surface: "study_library" });
      toast({
        title: "Course deleted",
        description: pendingDelete.title || "Untitled course",
        variant: "success",
      });
    } catch {
      toast({
        title: "Course was not deleted",
        description: "Please retry. Your course is still in the library.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  }, [deleting, myCourses, pendingDelete]);

  if (!user)
    return (
      <main data-study-library-page className="dc-study-signed-out">
        <h1>My Study Library</h1>
        <p className="dc-account-note">Sign in to access your own courses.</p>
        <button
          type="button"
          className="dc-account-primary"
          onClick={() => {
            window.location.hash = "#/auth?mode=login&return=%23%2Fstudy-library";
          }}
        >
          Sign in
        </button>
      </main>
    );

  return (
    <div data-study-library-page className="min-h-screen text-white">
      <div data-app-frame className="relative mx-auto flex min-h-screen w-full flex-col">
        <Header
          cartCount={cartIds.size}
          notifCount={0}
          onNavigateToSubscription={() => {
            window.location.hash = "#/subscription";
          }}
          onNavigateToCart={() => {
            window.location.hash = "#/cart";
          }}
          onNavigateToNotifications={() => {
            window.location.hash = "#/notifications";
          }}
        />
        <main
          data-study-library-content
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="dc-study-layout">
            <button
              type="button"
              onClick={() => {
                window.location.hash = "#/profile";
              }}
              className="dc-account-text-action"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Profile
            </button>
            <header className="dc-account-header">
              <div>
                <h1>My Study Library</h1>
                <p className="dc-account-note">Courses you create and manage.</p>
                {myCourses.state === "ready" || myCourses.courses.length > 0 ? (
                  <p data-study-library-count className="dc-account-note">
                    {totals.courses} course{totals.courses === 1 ? "" : "s"} · {totals.modules}{" "}
                    module{totals.modules === 1 ? "" : "s"} · {totals.resources} resource
                    {totals.resources === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                data-my-course-create
                className="dc-account-primary"
                onClick={() => {
                  window.location.hash = MY_COURSE_NEW_HASH;
                }}
              >
                New course
              </button>
            </header>
            {myCourses.state === "loading" && myCourses.courses.length === 0 ? (
              <LibrarySkeleton />
            ) : myCourses.state === "error" && myCourses.courses.length === 0 ? (
              <section role="alert" className="dc-study-empty">
                <h2>Your library couldn't load</h2>
                <p className="dc-account-error">{myCourses.error || "Please retry."}</p>
                <button type="button" className="dc-account-text-action" onClick={myCourses.reload}>
                  Try again
                </button>
              </section>
            ) : (
              <>
                {myCourses.state === "error" ? (
                  <p role="alert" className="dc-account-error">
                    Last saved courses shown. {myCourses.error}
                  </p>
                ) : null}
                {myCourses.courses.length > 0 ? (
                  <div className="dc-study-search">
                    <Search aria-hidden="true" />
                    <input
                      type="search"
                      data-my-course-search
                      aria-label="Search your courses"
                      placeholder="Search your courses"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query ? (
                      <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                        <X aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {myCourses.courses.length === 0 ? (
                  <section data-my-course-empty className="dc-study-empty">
                    <h2>No courses yet</h2>
                    <p className="dc-account-note">
                      Use New course to add modules, folders and resources.
                    </p>
                  </section>
                ) : courses.length === 0 ? (
                  <section className="dc-study-empty">
                    <h2>No matches</h2>
                    <p className="dc-account-note">Try a course title or description.</p>
                  </section>
                ) : (
                  <div data-my-course-grid className="dc-study-list">
                    {courses.map((course) => (
                      <MyCourseCard
                        minimal
                        key={course.id}
                        course={course}
                        onPlay={openCourse}
                        onEdit={editCourse}
                        onDelete={requestDelete}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
        <BottomNav
          active="study-library"
          onChange={navigateFromBottom}
          purchasesBadge={purchasedIds.size}
        />
        {/* Card-level delete confirmation — the Profile card glass (tint 0.62 ·
            rgb(173,216,255) · blur 0 + `.dc-rev-glass`), sized by the shared
            responsive overlay: full-width sheet on a phone, centred dialog on
            a tablet / desktop. */}
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          material="profile"
          title="Delete this course?"
          message={`“${
            pendingDelete?.title || "Untitled course"
          }” and everything inside it will be permanently deleted. This can't be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleting) setPendingDelete(null);
          }}
        />
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading My Study Library"
      data-my-course-skeleton
      className="dc-study-loading"
    >
      <p>Loading your courses…</p>
      <div aria-hidden="true" />
    </div>
  );
}
