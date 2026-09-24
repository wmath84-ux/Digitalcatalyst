// src/hooks/useMyCourses.ts
//
// ONE live controller for the learner's own courses.
//
// A single Firestore listener feeds every consumer (the Study Library grid and
// the Course Player route), so a save in the editor is visible everywhere the
// instant Firestore confirms it — and the same listener is what makes the
// player open with zero extra reads on a warm app.
//
// Writes are optimistic but honest: local state is patched immediately so the
// UI never feels laggy, and a failed write is rolled back and reported with the
// server's own message.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  deleteMyCourse,
  saveMyCourse,
  subscribeMyCourses,
} from "../lib/myCourseClient";
import type { MyCourse } from "../types/myCourse";

export type MyCoursesState = "loading" | "ready" | "error";

export interface MyCoursesController {
  uid: string | null;
  state: MyCoursesState;
  courses: MyCourse[];
  error: string | null;
  saving: boolean;
  getCourse: (courseId: string) => MyCourse | null;
  save: (course: MyCourse) => Promise<{ ok: boolean; message?: string }>;
  remove: (courseId: string) => Promise<{ ok: boolean; message?: string }>;
  reload: () => void;
}

export function useMyCourses(): MyCoursesController {
  const { user } = useAuth();
  const uid = user?.id || null;
  const [state, setState] = useState<MyCoursesState>("loading");
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const liveRef = useRef<MyCourse[]>([]);
  liveRef.current = courses;

  useEffect(() => {
    if (!uid) {
      setCourses([]);
      setState("ready");
      setError(null);
      return undefined;
    }
    setState((current) => (current === "ready" ? current : "loading"));
    const unsubscribe = subscribeMyCourses(
      uid,
      (next) => {
        setCourses(next);
        setError(null);
        setState("ready");
      },
      (nextError) => {
        setError(nextError.message || "Your library could not be loaded.");
        setState("error");
      },
    );
    return () => unsubscribe();
  }, [uid, reloadToken]);

  const getCourse = useCallback(
    (courseId: string) => liveRef.current.find((course) => course.id === courseId) || null,
    [],
  );

  const upsertLocal = useCallback((course: MyCourse) => {
    setCourses((current) => {
      const index = current.findIndex((item) => item.id === course.id);
      if (index < 0) return [course, ...current];
      const next = [...current];
      next[index] = course;
      return next;
    });
  }, []);

  const save = useCallback(
    async (course: MyCourse) => {
      if (!uid) return { ok: false, message: "Please sign in to save your course." };
      setSaving(true);
      // Optimistic: the editor / grid show the change immediately.
      const previous = liveRef.current;
      upsertLocal(course);
      try {
        await saveMyCourse(uid, course);
        setError(null);
        return { ok: true };
      } catch (writeError) {
        setCourses(previous);
        const message = writeError instanceof Error ? writeError.message : "The course was not saved.";
        setError(message);
        return { ok: false, message };
      } finally {
        setSaving(false);
      }
    },
    [uid, upsertLocal],
  );

  const remove = useCallback(
    async (courseId: string) => {
      if (!uid) return { ok: false, message: "Please sign in to delete your course." };
      setSaving(true);
      const previous = liveRef.current;
      setCourses((current) => current.filter((course) => course.id !== courseId));
      try {
        await deleteMyCourse(uid, courseId);
        return { ok: true };
      } catch (writeError) {
        setCourses(previous);
        const message = writeError instanceof Error ? writeError.message : "The course was not deleted.";
        setError(message);
        return { ok: false, message };
      } finally {
        setSaving(false);
      }
    },
    [uid],
  );

  const reload = useCallback(() => {
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  return useMemo(
    () => ({ uid, state, courses, error, saving, getCourse, save, remove, reload }),
    [uid, state, courses, error, saving, getCourse, save, remove, reload],
  );
}
