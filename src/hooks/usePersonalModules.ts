// Shared My Study Library controller. It lazily hydrates one account-wide
// snapshot, applies targeted post-commit patches, and never refetches a course
// (or mutates official progress) for personal-library writes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addOfficialResource,
  createPersonalModule,
  createPersonalResource,
  deletePersonalModule,
  deletePersonalResource,
  fetchPersonalCourseLibrary,
  markPersonalResourceOpened,
  movePersonalModule,
  movePersonalResource,
  movePersonalResourceToDestination,
  updatePersonalModule,
  updatePersonalResource,
  type AddOfficialResourceDestination,
  type PersonalCourseAccess,
  type PersonalCourseApiError,
  type PersonalCourseModule,
  type PersonalCourseMutationData,
  type PersonalCourseOfficialReference,
  type PersonalCourseResource,
  type PersonalCourseUsage,
  type PersonalResourceFields,
} from "../lib/personalCourseClient";
import { movePersonalLibraryItem } from "../../utils/personalLibrary";

export type PersonalModulesState = "idle" | "loading" | "ready" | "error";

export interface PersonalModulesResult {
  ok: boolean;
  message?: string;
  code?: string;
  alreadyExists?: boolean;
  data?: PersonalCourseMutationData;
}

interface CachedLibrary {
  access: PersonalCourseAccess;
  usage: PersonalCourseUsage;
  modules: PersonalCourseModule[];
  savedResources: PersonalCourseResource[];
  fetchedAt: number;
}

const libraryCache = new Map<string, CachedLibrary>();
const REVALIDATE_AFTER_MS = 30_000;

const errorOf = (error: unknown): PersonalModulesResult => {
  const apiError = error as PersonalCourseApiError;
  return {
    ok: false,
    code: apiError?.code || "PERSONAL_COURSE_ERROR",
    message: apiError?.message || "Something went wrong. Please try again — nothing was changed.",
  };
};

export interface UsePersonalModulesOptions {
  /** Course Player uses false so opening a course performs no library request. */
  autoLoad?: boolean;
  /** Context keeps the in-player module manager course-specific; central uses all. */
  scope?: "context" | "all";
  productDocumentId?: string;
}

export interface PersonalModulesController {
  uid: string | null;
  productId: string | null;
  state: PersonalModulesState;
  loaded: boolean;
  error: string | null;
  refreshing: boolean;
  access: PersonalCourseAccess | null;
  usage: PersonalCourseUsage | null;
  modules: PersonalCourseModule[];
  allModules: PersonalCourseModule[];
  savedResources: PersonalCourseResource[];
  hasModules: boolean;
  resourceCount: number;
  moduleCount: number;
  reload: () => void;
  ensureLoaded: () => Promise<boolean>;
  createModule: (title: string, description: string) => Promise<PersonalModulesResult>;
  updateModule: (moduleId: string, title: string, description: string) => Promise<PersonalModulesResult>;
  deleteModule: (moduleId: string) => Promise<PersonalModulesResult>;
  moveModule: (moduleId: string, toIndex: number) => Promise<PersonalModulesResult>;
  createResource: (moduleId: string | null, fields: PersonalResourceFields) => Promise<PersonalModulesResult>;
  updateResource: (storageModuleId: string, resourceId: string, fields: PersonalResourceFields) => Promise<PersonalModulesResult>;
  deleteResource: (storageModuleId: string, resourceId: string) => Promise<PersonalModulesResult>;
  moveResource: (storageModuleId: string, resourceId: string, toIndex: number) => Promise<PersonalModulesResult>;
  moveResourceTo: (resource: PersonalCourseResource, moduleId: string | null) => Promise<PersonalModulesResult>;
  addOfficial: (official: PersonalCourseOfficialReference, destination: AddOfficialResourceDestination) => Promise<PersonalModulesResult>;
  markOpened: (resource: PersonalCourseResource) => Promise<PersonalModulesResult>;
}

export function usePersonalModules(
  uid: string | null | undefined,
  productId: string | null | undefined,
  options: UsePersonalModulesOptions = {},
): PersonalModulesController {
  const { autoLoad = true, scope = "context", productDocumentId } = options;
  const userId = uid || null;
  const active = Boolean(userId);
  const initial = userId ? libraryCache.get(userId) : undefined;
  const [state, setState] = useState<PersonalModulesState>(initial ? "ready" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [access, setAccess] = useState<PersonalCourseAccess | null>(initial?.access || null);
  const [usage, setUsage] = useState<PersonalCourseUsage | null>(initial?.usage || null);
  const [allModules, setAllModules] = useState<PersonalCourseModule[]>(initial?.modules || []);
  const [savedResources, setSavedResources] = useState<PersonalCourseResource[]>(initial?.savedResources || []);
  const epochRef = useRef(0);
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const accessRef = useRef(access);
  const usageRef = useRef(usage);
  const modulesRef = useRef(allModules);
  const savedRef = useRef(savedResources);
  // Mask the previous account synchronously during an auth-user switch. The
  // reset effect runs after paint, so state alone could otherwise flash one
  // learner's cached library to the next learner for a frame.
  const dataOwnerRef = useRef(userId);

  const writeCache = useCallback(() => {
    if (!userId || !accessRef.current || !usageRef.current) return;
    libraryCache.set(userId, {
      access: accessRef.current,
      usage: usageRef.current,
      modules: modulesRef.current,
      savedResources: savedRef.current,
      fetchedAt: Date.now(),
    });
  }, [userId]);

  const commitUsage = useCallback((next: PersonalCourseUsage | undefined) => {
    if (!next) return;
    usageRef.current = next;
    setUsage(next);
    if (accessRef.current) {
      const updated = { ...accessRef.current, moduleCount: next.moduleCount, resourceCount: next.resourceCount };
      accessRef.current = updated;
      setAccess(updated);
    }
  }, []);
  const commitModules = useCallback((updater: (current: PersonalCourseModule[]) => PersonalCourseModule[]) => {
    const next = updater(modulesRef.current);
    modulesRef.current = next;
    setAllModules(next);
  }, []);
  const commitSaved = useCallback((updater: (current: PersonalCourseResource[]) => PersonalCourseResource[]) => {
    const next = updater(savedRef.current);
    savedRef.current = next;
    setSavedResources(next);
  }, []);

  const load = useCallback((showLoading = false): Promise<boolean> => {
    if (!active || !userId) return Promise.resolve(false);
    if (inflightRef.current) return inflightRef.current;
    const epoch = ++epochRef.current;
    if (showLoading || !accessRef.current) setState("loading");
    setRefreshing(true);
    let task: Promise<boolean>;
    task = fetchPersonalCourseLibrary()
      .then((snapshot) => {
        if (epochRef.current !== epoch) return false;
        dataOwnerRef.current = userId;
        accessRef.current = snapshot.access;
        usageRef.current = snapshot.usage;
        modulesRef.current = snapshot.modules;
        savedRef.current = snapshot.savedResources;
        setAccess(snapshot.access);
        setUsage(snapshot.usage);
        setAllModules(snapshot.modules);
        setSavedResources(snapshot.savedResources);
        setError(null);
        setState("ready");
        libraryCache.set(userId, { ...snapshot, fetchedAt: Date.now() });
        return true;
      })
      .catch((reason: unknown) => {
        if (epochRef.current !== epoch) return false;
        const result = errorOf(reason);
        setError(result.message || "Could not load My Study Library.");
        setState(accessRef.current ? "ready" : "error");
        return false;
      })
      .finally(() => {
        if (epochRef.current === epoch) setRefreshing(false);
        if (inflightRef.current === task) inflightRef.current = null;
      });
    inflightRef.current = task;
    return task;
  }, [active, userId]);

  const ensureLoaded = useCallback(() => {
    if (accessRef.current) return Promise.resolve(true);
    return load(true);
  }, [load]);

  const reload = useCallback(() => { void load(!accessRef.current); }, [load]);

  useEffect(() => {
    epochRef.current += 1;
    inflightRef.current = null;
    dataOwnerRef.current = userId;
    if (!active || !userId) {
      accessRef.current = null;
      usageRef.current = null;
      modulesRef.current = [];
      savedRef.current = [];
      setState("idle");
      setAccess(null);
      setUsage(null);
      setAllModules([]);
      setSavedResources([]);
      setError(null);
      return;
    }
    const cached = libraryCache.get(userId);
    if (cached) {
      accessRef.current = cached.access;
      usageRef.current = cached.usage;
      modulesRef.current = cached.modules;
      savedRef.current = cached.savedResources;
      setAccess(cached.access);
      setUsage(cached.usage);
      setAllModules(cached.modules);
      setSavedResources(cached.savedResources);
      setState("ready");
      if (autoLoad && Date.now() - cached.fetchedAt > REVALIDATE_AFTER_MS) void load(false);
    } else if (autoLoad) {
      void load(true);
    } else {
      setState("idle");
    }
  }, [active, autoLoad, load, userId]);

  // Reconcile stale/concurrent tabs when the learner returns, without a live
  // listener and without a course refetch.
  useEffect(() => {
    if (!active) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const cached = userId ? libraryCache.get(userId) : null;
      if (accessRef.current && (!cached || Date.now() - cached.fetchedAt > REVALIDATE_AFTER_MS)) void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, load, userId]);

  const patchResource = useCallback((resource: PersonalCourseResource, options: { removeSavedIdentity?: boolean } = {}) => {
    commitModules((current) => current.map((module) => {
      const without = module.resources.filter((item) => item.id !== resource.id);
      if (resource.state === "module" && resource.personalModuleId === module.id) {
        const resources = [...without, resource].sort((a, b) => a.sortOrder - b.sortOrder);
        return { ...module, resources, resourceCount: resources.length, updatedAt: resource.updatedAt };
      }
      if (without.length !== module.resources.length) return { ...module, resources: without, resourceCount: without.length };
      return module;
    }));
    commitSaved((current) => {
      let next = current.filter((item) => item.id !== resource.id);
      if (options.removeSavedIdentity) next = next.filter((item) => item.identityKey !== resource.identityKey);
      return resource.state === "saved"
        ? [...next, resource].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
        : next;
    });
  }, [commitModules, commitSaved]);

  const runMutation = useCallback(async (
    mutation: () => Promise<PersonalCourseMutationData>,
    patch?: (data: PersonalCourseMutationData) => void,
  ): Promise<PersonalModulesResult> => {
    try {
      const data = await mutation();
      patch?.(data);
      commitUsage(data.usage);
      writeCache();
      return { ok: true, alreadyExists: Boolean(data.alreadyExists), data };
    } catch (reason) {
      const result = errorOf(reason);
      if ([
        "MODULE_NOT_FOUND",
        "RESOURCE_NOT_FOUND",
        "MODULE_DELETING",
        "DUPLICATE_RESOURCE",
        "MODULE_LIMIT",
        "RESOURCE_LIMIT",
        "PER_MODULE_LIMIT",
        "EMBED_LIMIT",
        "TYPE_NOT_ALLOWED",
        "PLAN_REQUIRED",
        "FEATURE_DISABLED",
        "NETWORK_ERROR",
        "UNCONFIRMED_RESULT",
      ].includes(result.code || "")) void load(false);
      return result;
    }
  }, [commitUsage, load, writeCache]);

  const sortedAllModules = useMemo(
    () => [...allModules].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.createdAt - b.createdAt),
    [allModules],
  );
  const ownsRenderedData = dataOwnerRef.current === userId;
  const renderedAllModules = ownsRenderedData ? sortedAllModules : [];
  const renderedSavedResources = ownsRenderedData ? savedResources : [];
  const scopedModules = useMemo(
    () => scope === "all" || !productId ? renderedAllModules : renderedAllModules.filter((module) => module.productId === productId),
    [productId, scope, renderedAllModules],
  );

  return {
    uid: userId,
    productId: productId || null,
    state: ownsRenderedData ? state : "idle",
    loaded: ownsRenderedData && Boolean(access),
    error: ownsRenderedData ? error : null,
    refreshing: ownsRenderedData && refreshing,
    access: ownsRenderedData ? access : null,
    usage: ownsRenderedData ? usage : null,
    modules: scopedModules,
    allModules: renderedAllModules,
    savedResources: renderedSavedResources,
    hasModules: scopedModules.length > 0,
    moduleCount: ownsRenderedData ? usage?.moduleCount ?? renderedAllModules.length : 0,
    resourceCount: ownsRenderedData ? usage?.resourceCount ?? renderedAllModules.reduce((sum, module) => sum + module.resources.length, renderedSavedResources.length) : 0,
    reload,
    ensureLoaded,
    createModule: (title, description) => runMutation(
      () => createPersonalModule(productId || "__library__", title, description, productDocumentId),
      (data) => {
        if (data.module) commitModules((current) => [...current, data.module!]);
      },
    ),
    updateModule: (moduleId, title, description) => runMutation(
      () => updatePersonalModule(moduleId, title, description),
      (data) => {
        if (data.module) commitModules((current) => current.map((module) => module.id === moduleId ? { ...module, ...data.module, resources: module.resources } : module));
      },
    ),
    deleteModule: (moduleId) => runMutation(
      () => deletePersonalModule(moduleId),
      () => commitModules((current) => current.filter((module) => module.id !== moduleId)),
    ),
    moveModule: (moduleId, toIndex) => runMutation(
      () => movePersonalModule(moduleId, toIndex, scope === "context" ? productId || undefined : undefined),
      (data) => {
        const order = data.orderedIds || [];
        if (!order.length) return;
        commitModules((current) => {
          const rank = new Map(order.map((item, index) => [item, index]));
          const orders = current.filter((item) => rank.has(item.id)).map((item) => item.sortOrder).sort((a, b) => a - b);
          return current.map((item) => rank.has(item.id) ? { ...item, sortOrder: orders[rank.get(item.id)!] ?? rank.get(item.id)! * 1024 } : item);
        });
      },
    ),
    createResource: (moduleId, fields) => runMutation(
      () => createPersonalResource(moduleId, fields, { productId: productId || "__library__", productDocumentId }),
      (data) => { if (data.resource && !data.alreadyExists) patchResource(data.resource); },
    ),
    updateResource: (storageModuleId, resourceId, fields) => runMutation(
      () => updatePersonalResource(storageModuleId, resourceId, fields),
      (data) => { if (data.resource) patchResource(data.resource); },
    ),
    deleteResource: (storageModuleId, resourceId) => runMutation(
      () => deletePersonalResource(storageModuleId, resourceId),
      () => {
        commitModules((current) => current.map((module) => {
          const resources = module.resources.filter((item) => item.id !== resourceId);
          return resources.length === module.resources.length ? module : { ...module, resources, resourceCount: resources.length };
        }));
        commitSaved((current) => current.filter((item) => item.id !== resourceId));
      },
    ),
    moveResource: (storageModuleId, resourceId, toIndex) => runMutation(
      () => movePersonalResource(storageModuleId, resourceId, toIndex),
      (data) => {
        const order = data.orderedIds || [];
        const reorder = (items: PersonalCourseResource[]) => order.length
          ? [...items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((item, index) => ({ ...item, sortOrder: index * 1024 }))
          : movePersonalLibraryItem(items, items.findIndex((item) => item.id === resourceId), toIndex);
        commitModules((current) => current.map((module) => module.id === storageModuleId ? { ...module, resources: reorder(module.resources) } : module));
        commitSaved((current) => current.some((item) => item.storageModuleId === storageModuleId) ? reorder(current) : current);
      },
    ),
    moveResourceTo: (resource, moduleId) => runMutation(
      () => movePersonalResourceToDestination(resource, moduleId),
      (data) => { if (data.resource) patchResource(data.resource, { removeSavedIdentity: resource.state === "saved" }); },
    ),
    addOfficial: (official, destination) => runMutation(
      () => addOfficialResource(official, destination),
      (data) => {
        if (data.module && !modulesRef.current.some((module) => module.id === data.module!.id)) commitModules((current) => [...current, data.module!]);
        if (data.resource && !data.alreadyExists) patchResource(data.resource, { removeSavedIdentity: Boolean(data.movedFromSaved) });
      },
    ),
    markOpened: (resource) => runMutation(
      () => markPersonalResourceOpened(resource),
      (data) => {
        if (!data.lastOpenedAt) return;
        patchResource({ ...resource, lastOpenedAt: data.lastOpenedAt, updatedAt: resource.updatedAt });
      },
    ),
  };
}
