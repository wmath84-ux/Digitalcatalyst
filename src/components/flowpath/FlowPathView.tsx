import { toast as glassToast } from "../ui/glass-toast";

// pack `toast(input)` (websiteglass.com glass-toast) under the two verbs this
// view uses
const toast = {
  success: (title: string) => glassToast({ title, variant: "success" }),
  info: (title: string) => glassToast({ title }),
};
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, BookOpen } from "lucide-react";
import type {
  Activity,
  ActivityType,
  ActivityWithStatus,
  FlowPathActivity,
} from "../../flowpath/types/flowpath";
import { ACTIVITY_TYPE_META } from "../../flowpath/types/flowpath";
import { buildTimeLabel, deriveStatus } from "../../flowpath/lib/activityService";
import { useFlowPath } from "../../flowpath/hooks/useFlowPath";
import { useFlowPathFirestore } from "../../flowpath/hooks/useFlowPathFirestore";
import { useFlowPathSync } from "../../flowpath/hooks/useFlowPathSync";
import { useTheme } from "../../flowpath/hooks/useTheme";
import { LecturePicker, type LectureCourseOption, type LectureModuleOption } from "../../flowpath/components/LecturePicker";
import { flowpathLectureCourses, flowpathLectureModules, flowpathBulk } from "../../flowpath/lib/flowpathControlClient";
import { auth } from "../../../firebase";

/** The signed-in user's uid, fetched synchronously. The auth
 *  context is not imported here to keep FlowPathView's dep graph
 *  flat; firebase/auth keeps the currentUser reference live. */
const lecturePickerUid = (): string => {
  try { return auth?.currentUser?.uid || ""; } catch { return ""; }
};

/**
 * The kinds the LOCAL ActivityType union models. Anything else the
 * server can store (e.g. "lecture") is normalised to "other" for the
 * local type system while the original kind rides along in
 * `activity.flowKind` so cards/nodes still show the right label,
 * colour and icon. This is what prevents a merged server doc of an
 * unmodelled kind from crashing the whole FlowPath page.
 */
const LOCAL_ACTIVITY_TYPES: ReadonlySet<string> = new Set(Object.keys(ACTIVITY_TYPE_META));

/** Convert a server millis value (or a stray Timestamp-like object) to
 *  a valid ISO string. Never throws — invalid input falls back to now. */
function safeIsoFromMillis(value: unknown): string {
  let ms = NaN;
  if (typeof value === "number") ms = value;
  else if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    ms = (value as { toMillis: () => number }).toMillis();
  } else {
    ms = Number(value);
  }
  const date = new Date(Number.isFinite(ms) ? ms : NaN);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/** Map a server FlowPathActivity onto the local Activity shape used by
 *  the 3D flow. Every field is defaulted defensively so a corrupt or
 *  partial doc can never produce an undefined lookup in the cards /
 *  nodes (the former white-screen crash). */
function toLocalActivity(fp: FlowPathActivity, order: number, currentId: string | null): ActivityWithStatus {
  const datetime = fp.scheduledFor != null
    ? safeIsoFromMillis(fp.scheduledFor)
    : safeIsoFromMillis(fp.createdAt);
  const localType: ActivityType = LOCAL_ACTIVITY_TYPES.has(fp.kind)
    ? (fp.kind as ActivityType)
    : "other";
  const activity = {
    id: fp.id,
    type: localType,
    flowKind: fp.kind,
    title: fp.title,
    description: fp.description,
    datetime,
    timeLabel: buildTimeLabel(new Date(datetime)),
    createdAt: typeof fp.createdAt === "number" && Number.isFinite(fp.createdAt) ? fp.createdAt : Date.now(),
    order,
    ...(fp.completedAt ? { completedAt: fp.completedAt } : {}),
    ...(fp.taskPriority ? { priority: fp.taskPriority } : {}),
    ...(fp.taskStatus ? { status: fp.taskStatus } : {}),
    ...(fp.taskSubject ? { subject: fp.taskSubject } : {}),
    ...(fp.reminderTime ? { time: fp.reminderTime } : {}),
    ...(fp.scheduleStartTime ? { startTime: fp.scheduleStartTime, startLabel: fp.scheduleStartTime } : {}),
    ...(fp.scheduleEndTime ? { endTime: fp.scheduleEndTime, endLabel: fp.scheduleEndTime } : {}),
    ...(fp.noteColor ? { color: fp.noteColor } : {}),
    ...(fp.testConfig ? {
      totalQuestions: typeof fp.testConfig.totalQuestions === "number" ? fp.testConfig.totalQuestions : 0,
      difficulty: fp.testConfig.difficulty,
      questionMode: fp.testConfig.questionMode,
      estimatedMinutes: fp.testConfig.estimatedMinutes,
    } : {}),
    ...(fp.testId !== undefined ? { testId: fp.testId } : {}),
    ...(fp.progress !== undefined ? { progress: fp.progress } : {}),
    ...(fp.lectureModuleTitle !== undefined && fp.lectureModuleTitle !== null ? { lectureModuleTitle: fp.lectureModuleTitle } : {}),
    ...(fp.lectureProductTitle ? { lectureProductTitle: fp.lectureProductTitle } : {}),
    ...(fp.lectureEstimatedMinutes ? { lectureEstimatedMinutes: fp.lectureEstimatedMinutes } : {}),
    ...(fp.lecturePreviewOnly ? { lecturePreviewOnly: fp.lecturePreviewOnly } : {}),
  } as Activity;
  // Re-derive the display status from the merged datetime so overdue /
  // upcoming / completed all render correctly (the server's status enum
  // is wider than the local one).
  return { activity, status: deriveStatus(activity, currentId) };
}
import {
  buildRows,
  buildSmoothPath,
  chunkRows,
  getLayoutConfig,
  type FlowRow,
  type LayoutConfig,
} from "../../flowpath/lib/layout";
import { animateScrollTo, getScrollParent } from "../../flowpath/lib/scroll";
import type { CurveOverride } from "../../flowpath/types/curve";
import { DEFAULT_CURVE_OVERRIDE } from "../../flowpath/types/curve";
import { CurveSettingsModal } from "./CurveSettingsModal";
import { Ribbon } from "./Ribbon";
import { ActivityNode } from "./ActivityNode";
import { ActivityCard } from "./ActivityCard";
import { PlusNode } from "./PlusNode";
import { RadialMenu, type RadialItem } from "./RadialMenu";
import { CreateModal } from "./CreateModal";
import { EmptyState } from "./EmptyState";
import { BottomDock } from "./BottomDock";
import { ACTIVITY_ICONS } from "./icons";

const SCROLL_BUFFER = 2000;
const CHUNK_SIZE = 8;

/** localStorage key for the persisted flow curve customisation. */
const CURVE_OVERRIDE_STORAGE_KEY = "flowpath:curve-override";

function loadCurveOverride(): CurveOverride {
  if (typeof window === "undefined") return DEFAULT_CURVE_OVERRIDE;
  try {
    const raw = window.localStorage.getItem(CURVE_OVERRIDE_STORAGE_KEY);
    if (!raw) return DEFAULT_CURVE_OVERRIDE;
    const parsed = JSON.parse(raw) as Partial<CurveOverride> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_CURVE_OVERRIDE;
    return {
      amplitude:
        typeof parsed.amplitude === "number" ? parsed.amplitude : DEFAULT_CURVE_OVERRIDE.amplitude,
      frequency:
        typeof parsed.frequency === "number" ? parsed.frequency : DEFAULT_CURVE_OVERRIDE.frequency,
      spacing: typeof parsed.spacing === "number" ? parsed.spacing : DEFAULT_CURVE_OVERRIDE.spacing,
    };
  } catch {
    return DEFAULT_CURVE_OVERRIDE;
  }
}

function saveCurveOverride(value: CurveOverride) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CURVE_OVERRIDE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota) — silently ignore,
    // the in-memory state still reflects the user's last tweak for the session.
  }
}

const ACTIVITY_RADIAL_ITEMS: RadialItem[] = (() => {
  const items: RadialItem[] = (Object.keys(ACTIVITY_TYPE_META) as ActivityType[]).map((t) => ({
    id: t,
    label: ACTIVITY_TYPE_META[t].label,
    icon: ACTIVITY_ICONS[t],
    color: ACTIVITY_TYPE_META[t].color,
  }));
  // Append the "Lecture" entry that drives the 3-step picker
  // (course + module + schedule). Same radial menu surface so
  // the user can reach it from the same + button they use for
  // every other kind.
  items.push({
    id: "lecture",
    label: "Lecture",
    icon: BookOpen,
    color: "#22d3ee",
  });
  return items;
})();

interface PendingMenu {
  afterId: string | null;
  rect: DOMRect;
}

function PulseLight({ d, onDone }: { d: string; onDone: () => void }) {
  const [go, setGo] = useState(false);

  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setGo(true));
    });
    const t = setTimeout(onDone, 1350);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = {
    offsetPath: `path("${d}")`,
    offsetDistance: go ? "100%" : "0%",
    offsetRotate: "0deg",
    opacity: go ? 0 : 1,
    transition:
      "offset-distance 1.15s cubic-bezier(0.22,1,0.36,1), opacity 1.15s cubic-bezier(0.22,1,0.36,1)",
  } as unknown as React.CSSProperties;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        ...style,
        background: "radial-gradient(circle, #ffffff, #8b7bff 55%, transparent 75%)",
        boxShadow: "0 0 22px 8px rgba(139,123,255,0.75)",
      }}
    />
  );
}

interface FlowPathViewProps {
  onNavigateToHome?: () => void;
}

export function FlowPathView({ onNavigateToHome }: FlowPathViewProps = {}) {
  const {
    items,
    currentId,
    createActivity,
    completeActivity,
    uncompleteActivity,
    updateActivity,
    deleteActivity,
    pulseToken,
    justCreatedId,
    clearJustCreated,
  } = useFlowPath();
  const { items: firestoreItems } = useFlowPathFirestore();
  // Mirror every local change to the server multiplexer so the item
  // appears in the user's My Day / Revision pages + gets the FCM +
  // Web Push + local alarm treatment. See useFlowPathSync for the
  // offline replay queue.
  useFlowPathSync(items);
  // Merge Firestore activities (admin-created, server-created, or
  // cross-device edits) into the local items so the 3D flow shows
  // the full picture. The mapping goes through toLocalActivity(),
  // which normalises unmodelled kinds (e.g. "lecture") instead of
  // letting them crash the card/node meta lookups — the old
  // white-screen bug.
  const mergedItems = useMemo(() => {
    const seen = new Set(items.map((i) => i.activity.id));
    const merged = [...items];
    for (const fp of firestoreItems) {
      if (!fp || seen.has(fp.id)) continue;
      merged.push(toLocalActivity(fp, merged.length + 1, currentId));
    }
    return merged;
  }, [items, firestoreItems, currentId]);
  const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState({ top: -10000, bottom: 10000 });
  const [menu, setMenu] = useState<PendingMenu | null>(null);
  const [createType, setCreateType] = useState<{ type: ActivityType; afterId: string | null } | null>(
    null
  );
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [pulseSegment, setPulseSegment] = useState<{ key: number; d: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [curveOpen, setCurveOpen] = useState(false);
  const [curve, setCurve] = useState<CurveOverride>(loadCurveOverride);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [lecturePickerOpen, setLecturePickerOpen] = useState<boolean>(false);
  const [lectureSubmitting, setLectureSubmitting] = useState<boolean>(false);

  // Mirror every curve change to localStorage so the user's customisation
  // survives reloads and revisits. We persist on every change rather than
  // only on modal close so background saves (rare browser crashes, etc.)
  // don't drop the user's tweaks.
  useEffect(() => {
    saveCurveOverride(curve);
  }, [curve]);

  const hasAutoScrolled = useRef(false);
  const isEmpty = mergedItems.length === 0;

  // measure container width responsively — useLayoutEffect so the width is
  // known BEFORE the first paint: the Ribbon and the row layout are correct
  // on frame one instead of popping in after a ResizeObserver tick.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const config = useMemo(() => getLayoutConfig(width, curve), [width, curve]);
  const { rows, totalHeight } = useMemo(() => buildRows(mergedItems, config), [mergedItems, config]);

  const chunks = useMemo(() => chunkRows(rows, CHUNK_SIZE), [rows]);

  // scroll-driven virtualization window
  useEffect(() => {
    let raf = 0;
    let ticking = false;

    function measure() {
      ticking = false;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setVisible({
        top: -rect.top - SCROLL_BUFFER,
        bottom: -rect.top + window.innerHeight + SCROLL_BUFFER,
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(measure);
    }

    measure();
    // capture: true so scroll events from ANY scroller reach us — the
    // standalone page scrolls the window, but inside the desktop shell
    // the page column scrolls [data-desktop-content] (scroll events do
    // not bubble, they only pass through the capture phase).
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [totalHeight]);

  const visibleChunkPoints = useMemo(() => {
    return chunks
      .filter((chunk) => {
        if (!chunk.length) return false;
        const first = chunk[0];
        const last = chunk[chunk.length - 1];
        return !(last.y + last.height < visible.top || first.y > visible.bottom);
      })
      .map((chunk) => chunk.map((r) => ({ x: r.x, y: r.y })));
  }, [chunks, visible]);

  const visibleRows = useMemo(
    () => rows.filter((r) => r.y + r.height >= visible.top && r.y <= visible.bottom),
    [rows, visible]
  );

  // cinematic auto-focus on the current activity, once per session
  useEffect(() => {
    if (hasAutoScrolled.current) return;
    if (!rows.length || !currentId || width <= 0) return;
    const row = rows.find((r) => r.activity?.activity.id === currentId);
    if (!row) return;
    hasAutoScrolled.current = true;

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    const opts = { once: true, passive: true } as AddEventListenerOptions;
    window.addEventListener("wheel", cancel, opts);
    window.addEventListener("touchstart", cancel, opts);
    window.addEventListener("keydown", cancel, opts);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !containerRef.current) return;
        const scroller = getScrollParent(containerRef.current);
        const rect = containerRef.current.getBoundingClientRect();
        const originTop = scroller ? scroller.getBoundingClientRect().top : 0;
        const scrollY = scroller ? scroller.scrollTop : window.scrollY;
        const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
        const targetAbsolute = rect.top - originTop + scrollY + row.y + row.height / 2;
        const targetScroll = Math.max(0, targetAbsolute - viewportH / 2);
        if (reduced) {
          if (scroller) scroller.scrollTo(0, targetScroll);
          else window.scrollTo(0, targetScroll);
        } else {
          animateScrollTo(targetScroll, 950, () => cancelled, scroller);
        }
      })
    );

    return () => {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [rows, currentId, width]);

  // focus newly created nodes
  useEffect(() => {
    if (!justCreatedId) return;
    const row = rows.find((r) => r.id === justCreatedId);
    setHighlightId(justCreatedId);
    if (row && containerRef.current) {
      const scroller = getScrollParent(containerRef.current);
      const rect = containerRef.current.getBoundingClientRect();
      const originTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const scrollY = scroller ? scroller.scrollTop : window.scrollY;
      const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
      const targetAbsolute = rect.top - originTop + scrollY + row.y + row.height / 2;
      const targetScroll = Math.max(0, targetAbsolute - viewportH / 2);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        if (scroller) scroller.scrollTo(0, targetScroll);
        else window.scrollTo(0, targetScroll);
      } else {
        animateScrollTo(targetScroll, 800, () => false, scroller);
      }
    }
    const t1 = setTimeout(() => clearJustCreated(), 400);
    const t2 = setTimeout(() => setHighlightId(null), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreatedId]);

  // completion pulse along the path
  useEffect(() => {
    if (!pulseToken) return;
    const idx = rows.findIndex((r) => r.id === pulseToken.id);
    if (idx === -1) return;
    const start = Math.max(0, idx - 1);
    const end = Math.min(rows.length - 1, idx + 2);
    const pts = rows.slice(start, end + 1).map((r) => ({ x: r.x, y: r.y }));
    if (pts.length < 2) return;
    setPulseSegment({ key: pulseToken.key, d: buildSmoothPath(pts) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseToken]);

  const handleOpenMenu = useCallback((afterId: string | null, rect: DOMRect) => {
    setMenu({ afterId, rect });
  }, []);

  const handleSelectType = useCallback(
    (id: string) => {
      const afterId = menu?.afterId ?? null;
      setMenu(null);
      // Lecture: open the 3-step picker instead of the regular
      // CreateModal. The picker drives a separate flow that picks
      // the course + module + schedule, then submits a bulk create.
      if (id === "lecture") {
        setLecturePickerOpen(true);
        return;
      }
      setCreateType({ type: id as ActivityType, afterId });
    },
    [menu]
  );

  const handleCreate = useCallback(
    (data: { title: string; description?: string; datetime: string; extra?: Record<string, unknown> }) => {
      // If we are editing an existing activity, route the modal submit through
      // the update path so the same form can both create and edit.
      if (editingActivity) {
        updateActivity(editingActivity.id, {
          title: data.title,
          description: data.description,
          datetime: data.datetime,
          extra: data.extra,
        });
        setEditingActivity(null);
        setCreateType(null);
        return;
      }
      if (!createType) return;
      createActivity({
        type: createType.type,
        title: data.title,
        description: data.description,
        datetime: data.datetime,
        extra: data.extra,
        afterId: createType.afterId,
      });
      setCreateType(null);
    },
    [createType, createActivity, editingActivity, updateActivity]
  );

  const handleEditActivity = useCallback((activity: Activity) => {
    setEditingActivity(activity);
    setCreateType({ type: activity.type, afterId: null });
  }, []);

  const handleUncompleteActivity = useCallback(
    (id: string) => {
      uncompleteActivity(id);
    },
    [uncompleteActivity]
  );

  const closeCreateModal = useCallback(() => {
    setCreateType(null);
    setEditingActivity(null);
  }, []);

  const handleComplete = useCallback(
    (id: string) => {
      setArmedDeleteId(null);
      setCompletingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        completeActivity(id);
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 480);
    },
    [completeActivity]
  );

  const handleNodeClick = useCallback((id: string) => {
    setArmedDeleteId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setArmedDeleteId(null);
      deleteActivity(id);
    },
    [deleteActivity]
  );

  return (
    <div className="relative">
      {/* The old fixed FLOWPATH title bar is gone — its controls (theme
          toggle + flow-curve settings) now live behind the Settings gear
          in the bottom dock, so the home-style header above stays the
          only page chrome. */}

      <main
        ref={containerRef}
        className="relative mx-auto w-full max-w-3xl px-4 pt-6 pb-44 sm:px-8 sm:pt-8"
        style={{ minHeight: totalHeight }}
      >
        <Ribbon width={width} height={totalHeight} visibleChunks={visibleChunkPoints} theme={resolvedTheme} />

        {isEmpty && <EmptyState />}

        <AnimatePresence>
          {pulseSegment && (
            <PulseLight
              key={pulseSegment.key}
              d={pulseSegment.d}
              onDone={() => setPulseSegment(null)}
            />
          )}
        </AnimatePresence>

        {visibleRows.map((row) =>
          row.kind === "plus" ? (
            <PlusRowItem
              key={row.id}
              row={row}
              active={menu?.afterId === row.afterId}
              onOpen={(rect) => handleOpenMenu(row.afterId, rect)}
            />
          ) : (
            <ActivityRowItem
              key={row.id}
              row={row}
              config={config}
              width={width}
              onComplete={() => handleComplete(row.activity!.activity.id)}
              onEdit={() => handleEditActivity(row.activity!.activity)}
              onUncomplete={() => handleUncompleteActivity(row.activity!.activity.id)}
              completing={completingIds.has(row.activity!.activity.id)}
              highlighted={highlightId === row.id}
              armed={armedDeleteId === row.id}
              onNodeClick={() => handleNodeClick(row.activity!.activity.id)}
              onDelete={() => handleDelete(row.activity!.activity.id)}
            />
          )
        )}
      </main>

      {/* backdrop to disarm delete when tapping elsewhere */}
      {armedDeleteId && (
        <div
          className="fixed inset-0 z-[55]"
          onClick={() => setArmedDeleteId(null)}
          aria-hidden
        />
      )}

      <RadialMenu
        anchor={menu?.rect ?? null}
        items={ACTIVITY_RADIAL_ITEMS}
        onClose={() => setMenu(null)}
        onSelect={handleSelectType}
      />

      <CreateModal
        type={createType?.type ?? null}
        onClose={closeCreateModal}
        onCreate={handleCreate}
        editing={editingActivity}
      />

      <LecturePicker
        open={lecturePickerOpen}
        onClose={() => setLecturePickerOpen(false)}
        fetchCourses={async (q: string) => {
          const res = await flowpathLectureCourses(lecturePickerUid(), q);
          if (!res.ok) return [];
          return ((res as { courses?: LectureCourseOption[] }).courses || []) as LectureCourseOption[];
        }}
        fetchModules={async (productId: string) => {
          const res = await flowpathLectureModules(productId);
          if (!res.ok) return [];
          return ((res as { modules?: LectureModuleOption[] }).modules || []) as LectureModuleOption[];
        }}
        submitting={lectureSubmitting}
        onSubmit={async (lectures) => {
          setLectureSubmitting(true);
          try {
            const res = await flowpathBulk(lecturePickerUid(), lectures as Array<Record<string, unknown>>);
            if (res.ok) {
              toast.success(`Scheduled ${lectures.length} lecture${lectures.length === 1 ? "" : "s"}`);
              return { ok: true };
            }
            return { ok: false, error: res.error || "Failed." };
          } finally {
            setLectureSubmitting(false);
          }
        }}
      />

      <CurveSettingsModal
        open={curveOpen}
        onClose={() => setCurveOpen(false)}
        value={curve}
        onChange={setCurve}
      />

      <BottomDock
        onCreateType={(type) => {
          if (type === ("lecture" as unknown as ActivityType)) {
            setLecturePickerOpen(true);
            return;
          }
          setCreateType({ type, afterId: currentId });
        }}
        onPlanLectures={() => setLecturePickerOpen(true)}
        onStub={(group, label) => toast.info(`${group} · ${label} — coming soon`)}
        onNavigateToHome={onNavigateToHome}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onOpenCurve={() => setCurveOpen(true)}
      />

    </div>
  );
}

function PlusRowItem({
  row,
  active,
  onOpen,
}: {
  row: FlowRow;
  active: boolean;
  onOpen: (rect: DOMRect) => void;
}) {
  return (
    <motion.div
      className="absolute left-0 w-full"
      initial={false}
      animate={{ top: row.y, height: row.height }}
      transition={{ type: "spring", stiffness: 240, damping: 30 }}
    >
      <div style={{ position: "absolute", left: row.x, top: "50%", transform: "translate(-50%, -50%)" }}>
        <PlusNode active={active} onOpen={onOpen} />
      </div>
    </motion.div>
  );
}

function ActivityRowItem({
  row,
  config,
  width,
  onComplete,
  onEdit,
  onUncomplete,
  completing,
  highlighted,
  armed,
  onNodeClick,
  onDelete,
}: {
  row: FlowRow;
  config: LayoutConfig;
  width: number;
  onComplete: () => void;
  onEdit: () => void;
  onUncomplete: () => void;
  completing: boolean;
  highlighted: boolean;
  armed: boolean;
  onNodeClick: () => void;
  onDelete: () => void;
}) {
  if (!row.activity) return null;
  const { activity, status } = row.activity;

  const rightLeft = Math.min(
    config.centerX + config.amplitude + config.cardGap,
    Math.max(0, width - config.cardWidth - 8)
  );
  const leftLeft = Math.max(8, config.centerX - config.amplitude - config.cardGap - config.cardWidth);

  const cardLeft = row.side === "right" ? rightLeft : leftLeft;
  const connectorFrom = row.side === "right" ? row.x : cardLeft + config.cardWidth;
  const connectorTo = row.side === "right" ? cardLeft : row.x;

  return (
    <motion.div
      className="absolute left-0 w-full"
      initial={false}
      animate={{ top: row.y, height: row.height }}
      transition={{ type: "spring", stiffness: 240, damping: 30 }}
      style={{ zIndex: armed ? 70 : undefined }}
    >
      {/* connector line */}
      <div
        className="pointer-events-none absolute h-px opacity-30"
        style={{
          top: "50%",
          left: Math.min(connectorFrom, connectorTo),
          width: Math.max(0, Math.abs(connectorTo - connectorFrom)),
          background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0))",
        }}
      />

      <div
        style={{ position: "absolute", left: row.x, top: "50%", transform: "translate(-50%, -50%)", zIndex: 2 }}
      >
        <div className={`relative ${highlighted ? "fp-pulse rounded-full" : ""}`}>
          <ActivityNode
            type={activity.type}
            flowKind={activity.flowKind}
            status={status}
            onClick={onNodeClick}
          />
          {armed && (
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete activity"
              className="absolute -right-2.5 -top-2.5 z-[60] grid h-7 w-7 place-items-center rounded-full bg-rose-600 text-white"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
            </motion.button>
          )}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: "50%",
          transform: "translateY(-50%)",
          width: config.cardWidth,
          zIndex: 1,
        }}
      >
        <ActivityCard
          activity={activity}
          status={status}
          side={row.side}
          onComplete={onComplete}
          onEdit={onEdit}
          onUncomplete={onUncomplete}
          completing={completing}
        />
      </div>
    </motion.div>
  );
}
