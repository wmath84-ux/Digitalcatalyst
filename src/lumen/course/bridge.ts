import { useCallback, useSyncExternalStore } from "react";
import { getAdapter } from "./adapters";
import { PHYSICS_COURSE, RESOURCE_NOTES } from "./library";
import type { CourseFile } from "../../types/course";
import type {
  Course, CourseModule, CourseResource, CurrentResourceContext, LocationState, PlaybackState, ResourceNote, ResourceType, ViewportState,
} from "./types";

/* ─────────────────────────────────────────────────────────────
   COURSE CONTEXT BRIDGE
   The Course Player stays authoritative — it *publishes* here.
   The AI layer subscribes to a read-only normalized projection.

   Two-speed design (critical for performance):
   · High-frequency signals (media currentTime) mutate a mutable
     cell and DO NOT notify React. The AI reads them on demand.
   · Structural events (resource/page/slide/viewport changes)
     bump a version counter that React subscribers observe.
   Result: a playing video never re-renders the chat.
   ───────────────────────────────────────────────────────────── */

let liveCourse: Course = PHYSICS_COURSE;
let liveModule: CourseModule = PHYSICS_COURSE.modules[0];

const FALLBACK_RESOURCE: CourseResource = {
  resourceId: "none",
  resourceName: "No lesson open",
  resourceType: "embed",
  resourceUrl: "",
  provider: "",
  availability: "unavailable",
  availabilityNote: "Open a lesson to ground the assistant.",
  accessState: "granted",
};

const asResourceType = (type?: string | null): ResourceType => {
  const value = String(type || "");
  const allowed: ResourceType[] = [
    "youtube", "video", "audio", "pdf", "doc", "sheet", "slides", "ebook",
    "image", "google_form", "embed", "mindmap",
  ];
  return (allowed as string[]).includes(value) ? (value as ResourceType) : "embed";
};

const fileToResource = (
  file: CourseFile | null | undefined,
  accessState: CourseResource["accessState"],
): CourseResource => {
  if (!file) return { ...FALLBACK_RESOURCE, accessState };
  const url = file.url || file.embedUrl || file.youtubeUrl || "";
  return {
    resourceId: file.id,
    resourceName: file.name,
    resourceType: asResourceType(file.type),
    resourceUrl: url,
    provider: file.provider || "",
    availability: url ? "available" : "unavailable",
    availabilityNote: url ? undefined : "This resource has no readable URL yet.",
    accessState,
  };
};

interface BridgeState {
  resourceId: string;
  playback: PlaybackState;
  location: LocationState;
  viewport: ViewportState;
  active: boolean;
  loading: boolean;
  failed: boolean;
  lastInteraction: string;
  notes: ResourceNote[];
  updatedAt: number;
}

const state: BridgeState = {
  resourceId: liveModule.resources[0].resourceId,
  playback: { playing: false, currentTime: 1105, duration: liveModule.resources[0].duration },
  location: { currentPage: 17, currentSlide: 4, currentSheet: "Readings", currentChapter: "Chapter 4" },
  viewport: { playerMode: "split", viewportMode: "desktop", aiOpen: true },
  active: true,
  loading: false,
  failed: false,
  lastInteraction: "opened the lesson",
  notes: RESOURCE_NOTES,
  updatedAt: Date.now(),
};

let version = 0;
const subs = new Set<() => void>();
const notify = () => {
  version += 1;
  snapshotCache = null;
  subs.forEach((s) => s());
};

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/* ── the normalized projection (memoized per version) ─────── */

let snapshotCache: CurrentResourceContext | null = null;

export function getActiveContext(): CurrentResourceContext {
  if (snapshotCache) {
    // Refresh only the cheap live fields; identity stays stable so
    // React consumers don't re-render on playback ticks.
    snapshotCache.playbackState = state.playback;
    snapshotCache.lastUpdated = state.updatedAt;
    return snapshotCache;
  }
  const resource = liveModule.resources.find((r) => r.resourceId === state.resourceId) ?? liveModule.resources[0] ?? FALLBACK_RESOURCE;
  const adapter = getAdapter(resource.resourceType);
  snapshotCache = {
    course: { courseId: liveCourse.courseId, courseTitle: liveCourse.courseTitle, subject: liveCourse.subject },
    module: { moduleId: liveModule.moduleId, moduleTitle: liveModule.moduleTitle },
    lesson: { lessonId: liveModule.lessonId, lessonTitle: liveModule.lessonTitle },
    resource,
    sourceType: resource.resourceType,
    provider: resource.provider,
    canonicalUrl: resource.resourceUrl,
    activeState: { active: state.active, loading: state.loading, failed: state.failed },
    playbackState: state.playback,
    locationState: state.location,
    capabilities: adapter.capabilities(resource),
    availability: resource.availability,
    availabilityNote: resource.availabilityNote,
    viewport: state.viewport,
    notes: state.notes.filter((n) => n.resourceId === resource.resourceId),
    lastInteraction: state.lastInteraction,
    lastUpdated: state.updatedAt,
  };
  return snapshotCache;
}

/* ── publishers (called by the Course Player) ─────────────── */

export const courseBridge = {
  /** Structural: student switched resource. */
  setResource(resourceId: string) {
    if (state.resourceId === resourceId) return;
    const r = liveModule.resources.find((x) => x.resourceId === resourceId);
    state.resourceId = resourceId;
    state.playback = {
      playing: false,
      currentTime: r?.duration ? Math.round(r.duration * 0.48) : undefined,
      duration: r?.duration,
    };
    state.loading = true;
    state.failed = false;
    state.lastInteraction = `opened ${r?.resourceName ?? "a resource"}`;
    state.updatedAt = Date.now();
    notify();
    // Viewer "load" completes on the next frame — mirrors real player behaviour.
    window.setTimeout(() => {
      state.loading = false;
      state.updatedAt = Date.now();
      notify();
    }, 260);
  },

  /** HIGH FREQUENCY — intentionally does not notify React. */
  setPlaybackTime(currentTime: number, playing = state.playback.playing) {
    state.playback = { ...state.playback, currentTime, playing };
    state.updatedAt = Date.now();
    if (snapshotCache) snapshotCache.playbackState = state.playback;
  },

  /** Structural: play/pause is meaningful, so it does notify. */
  setPlaying(playing: boolean) {
    if (state.playback.playing === playing) return;
    state.playback = { ...state.playback, playing };
    state.lastInteraction = playing ? "started playback" : "paused playback";
    state.updatedAt = Date.now();
    notify();
  },

  setLocation(patch: Partial<LocationState>, interaction?: string) {
    const next = { ...state.location, ...patch };
    const changed = (Object.keys(patch) as (keyof LocationState)[]).some((k) => state.location[k] !== next[k]);
    if (!changed) return;
    state.location = next;
    if (interaction) state.lastInteraction = interaction;
    state.updatedAt = Date.now();
    notify();
  },

  setViewport(patch: Partial<ViewportState>) {
    const next = { ...state.viewport, ...patch };
    const changed = (Object.keys(patch) as (keyof ViewportState)[]).some((k) => state.viewport[k] !== next[k]);
    if (!changed) return;
    state.viewport = next;
    state.updatedAt = Date.now();
    notify();
  },

  noteInteraction(what: string) {
    state.lastInteraction = what;
    state.updatedAt = Date.now();
  },

  addNote(note: ResourceNote) {
    state.notes = [note, ...state.notes];
    state.lastInteraction = "wrote a note";
    state.updatedAt = Date.now();
    notify();
  },

  getVersion: () => version,
  getResources: () => liveModule.resources,
  getCourse: () => liveCourse,
  getModule: () => liveModule,

  /** Replace the ZIP physics demo with the live Course Player lesson. */
  hydrate(input: {
    courseId: string;
    courseTitle: string;
    subject?: string;
    moduleId: string;
    moduleTitle: string;
    file?: CourseFile | null;
    notes?: ResourceNote[];
    accessState?: CourseResource["accessState"];
  }) {
    const accessState = input.accessState ?? "granted";
    const resource = fileToResource(input.file, accessState);
    liveModule = {
      moduleId: input.moduleId,
      moduleTitle: input.moduleTitle,
      lessonId: input.moduleId,
      lessonTitle: input.moduleTitle,
      resources: [resource],
    };
    liveCourse = {
      courseId: input.courseId,
      courseTitle: input.courseTitle,
      subject: input.subject || input.courseTitle,
      modules: [liveModule],
    };
    const sameResource = state.resourceId === resource.resourceId;
    state.resourceId = resource.resourceId;
    state.notes = input.notes ?? [];
    state.active = true;
    state.loading = false;
    state.failed = false;
    if (!sameResource) {
      state.playback = { playing: false };
      state.location = {};
      state.lastInteraction = `opened ${resource.resourceName}`;
    }
    state.updatedAt = Date.now();
    notify();
  },
};

/* ── React binding: re-renders only on STRUCTURAL changes ─── */

export function useCourseContextVersion(): number {
  return useSyncExternalStore(subscribe, courseBridge.getVersion, courseBridge.getVersion);
}

export function useActiveLearningContext(): CurrentResourceContext {
  useCourseContextVersion();
  return getActiveContext();
}

export function useBridgePublisher() {
  return useCallback(<K extends keyof typeof courseBridge>(fn: K) => courseBridge[fn], []);
}
