// src/hooks/usePersonalModules.ts
//
// The Course Player's My Modules state hook — one place that owns the
// server-derived entitlement/access snapshot + the learner's module/resource
// lists for the current course, plus every mutation the UI can fire.
//
// The server (api/_lib/personalCourse.ts) is authoritative for entitlement,
// plan limits and allowed resource types: this hook only REFLECTS what
// `/api/personal-course` returns and surfaces server error messages
// verbatim (e.g. a plan-limit 409 while another device is creating content).
// Local state is never used to grant the feature.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPersonalModule,
  createPersonalResource,
  deletePersonalModule,
  deletePersonalResource,
  fetchPersonalCourseModules,
  fetchPersonalCourseStatus,
  movePersonalModule,
  movePersonalResource,
  updatePersonalModule,
  updatePersonalResource,
  type PersonalCourseAccess,
  type PersonalCourseApiError,
  type PersonalCourseModule,
  type PersonalCourseResource,
  type PersonalCourseUsage,
} from "../lib/personalCourseClient";

export type PersonalModulesState =
  | "idle" // no signed-in user or no course yet
  | "loading"
  | "ready"
  | "error";

export interface PersonalModulesResult {
  ok: boolean;
  message?: string;
  /** Server error code, e.g. MODULE_LIMIT_REACHED / RATE_LIMITED. */
  code?: string;
}

const errorOf = (error: unknown): PersonalModulesResult => {
  const apiError = error as PersonalCourseApiError;
  return {
    ok: false,
    code: apiError?.code || "PERSONAL_COURSE_ERROR",
    message: apiError?.message || "Something went wrong. Please try again.",
  };
};

export interface PersonalModulesController {
  /** uid driving this session (null when signed out). */
  uid: string | null;
  productId: string | null;
  state: PersonalModulesState;
  error: string | null;
  refreshing: boolean;
  access: PersonalCourseAccess | null;
  usage: PersonalCourseUsage | null;
  modules: PersonalCourseModule[];
  /** True when the learner holds at least one module in THIS course. */
  hasModules: boolean;
  /** Total resources across modules in this course (usage doc). */
  resourceCount: number;
  moduleCount: number;
  reload: () => void;
  createModule: (title: string, description: string) => Promise<PersonalModulesResult>;
  updateModule: (moduleId: string, title: string, description: string) => Promise<PersonalModulesResult>;
  deleteModule: (moduleId: string) => Promise<PersonalModulesResult>;
  moveModule: (moduleId: string, toIndex: number) => Promise<PersonalModulesResult>;
  createResource: (
    moduleId: string,
    fields: { type: PersonalCourseResource["type"]; name: string; description: string; url: string },
  ) => Promise<PersonalModulesResult>;
  updateResource: (
    moduleId: string,
    resourceId: string,
    fields: { type: PersonalCourseResource["type"]; name: string; description: string; url: string },
  ) => Promise<PersonalModulesResult>;
  deleteResource: (moduleId: string, resourceId: string) => Promise<PersonalModulesResult>;
  moveResource: (moduleId: string, resourceId: string, toIndex: number) => Promise<PersonalModulesResult>;
}

export function usePersonalModules(uid: string | null | undefined, productId: string | null | undefined): PersonalModulesController {
  const active = Boolean(uid && productId);
  const [state, setState] = useState<PersonalModulesState>(uid && productId ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [access, setAccess] = useState<PersonalCourseAccess | null>(null);
  const [usage, setUsage] = useState<PersonalCourseUsage | null>(null);
  const [modules, setModules] = useState<PersonalCourseModule[]>([]);
  // Guards against out-of-order responses (a reload finishing after a newer
  // mutation-triggered reload would otherwise re-show stale data).
  const epochRef = useRef(0);

  const reload = useCallback(() => {
    if (!active) return;
    const epoch = ++epochRef.current;
    setRefreshing(true);
    const courseId = String(productId);
    void Promise.all([
      fetchPersonalCourseStatus(courseId),
      fetchPersonalCourseModules(courseId),
    ])
      .then(([statusBody, listBody]) => {
        if (epochRef.current !== epoch) return;
        setAccess(statusBody.access ?? null);
        setUsage(statusBody.usage ?? null);
        setModules(listBody.modules ?? []);
        setError(null);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (epochRef.current !== epoch) return;
        const result = errorOf(reason);
        setError(result.message || "Could not load My Modules.");
        setState("error");
      })
      .finally(() => {
        if (epochRef.current === epoch) setRefreshing(false);
      });
  }, [active, productId]);

  useEffect(() => {
    if (!active) {
      epochRef.current += 1;
      setState("idle");
      setAccess(null);
      setUsage(null);
      setModules([]);
      setError(null);
      return;
    }
    setState("loading");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, productId, uid]);

  const runMutation = useCallback(
    async (mutation: () => Promise<{ ok?: boolean }>): Promise<PersonalModulesResult> => {
      try {
        await mutation();
        reload();
        return { ok: true };
      } catch (reason) {
        return errorOf(reason);
      }
    },
    [reload],
  );

  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
    [modules],
  );

  return {
    uid: uid ?? null,
    productId: productId ?? null,
    state,
    error,
    refreshing,
    access,
    usage,
    modules: sortedModules,
    hasModules: sortedModules.length > 0,
    moduleCount: usage?.moduleCount ?? sortedModules.length,
    resourceCount: usage?.resourceCount ?? sortedModules.reduce((sum, module) => sum + module.resources.length, 0),
    reload,
    createModule: (title, description) => runMutation(() => createPersonalModule(String(productId), title, description)),
    updateModule: (moduleId, title, description) => runMutation(() => updatePersonalModule(moduleId, title, description)),
    deleteModule: (moduleId) => runMutation(() => deletePersonalModule(moduleId)),
    moveModule: (moduleId, toIndex) => runMutation(() => movePersonalModule(moduleId, toIndex)),
    createResource: (moduleId, fields) => runMutation(() => createPersonalResource(moduleId, fields)),
    updateResource: (moduleId, resourceId, fields) => runMutation(() => updatePersonalResource(moduleId, resourceId, fields)),
    deleteResource: (moduleId, resourceId) => runMutation(() => deletePersonalResource(moduleId, resourceId)),
    moveResource: (moduleId, resourceId, toIndex) => runMutation(() => movePersonalResource(moduleId, resourceId, toIndex)),
  };
}
