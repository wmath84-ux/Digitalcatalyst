// src/MyDayApp.tsx
//
// The `#/my-day` route adapter.
//
// This file used to be the planner: Overview, Tasks, Schedule, Reminders and
// Quick Notes, with their own side rail, bottom pill, glass surfaces and
// localStorage-first save path. All of that is retired (Phase D): My Day is now
// ONE personal workspace — the Joplin workspace host — and this component's only
// jobs are the ones the workspace must not own:
//
//   1. AUTH BOUNDARY (§12, §111) — nothing personal is created until Firebase
//      identity is resolved. No anonymous workspace that could later be attached
//      to the wrong account.
//   2. ENTITLEMENT (§57, §58) — the existing subscription / free-creation policy
//      still governs the feature. It is not re-implemented here: the gate below
//      renders the SAME `useMyDayAccess` state that governed the old planner, and
//      creations are still charged on the server.
//   3. MIGRATION (§8–§11) — the one-time, idempotent, resumable migration of the
//      learner's legacy tasks, notes, reminders and schedule events into the
//      canonical workspace model, before the workspace is handed their data.
//   4. DEEP LINKS (§28, §116) — a legacy notification URL is translated into a
//      canonical workspace target and forwarded into the frame.
//
// It deliberately renders NO task/schedule/note UI of its own: there is one
// workspace, and the frame owns its interface (Joplin's).

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useMyDayAccess } from "./hooks/useMyDayAccess";
import { usePublishFeatureVisibility } from "./context/FeatureVisibilityContext";
import PremiumGate from "./components/subscription/PremiumGate";
import { parseMyDayHash, buildMyDayDeepLink } from "./joplin/joplinDeepLinks";
import { JoplinWorkspaceBoundary } from "./joplin/JoplinWorkspace";
import { trackMyDayEvent } from "./joplin/joplinAnalytics";
import { isMigrationComplete, loadMigrationMarker, runMyDayMigrationV1, skipLegacyMigration } from "./joplin/joplinMigrationBridge";
import BottomNav, { type TabKey } from "./components/BottomNav";

/**
 * The workspace host is its own chunk.
 *
 * §88/§133: Joplin-scale code must never be part of the app's first load. The
 * route itself is already lazy (`lazyRoute(() => import("./MyDayApp"))` in
 * `src/main.tsx`); this second boundary keeps the host + bridge out of the My Day
 * chunk until identity and access are resolved, so a paywalled learner never
 * downloads it.
 */
const JoplinWorkspace = lazy(() => import("./joplin/JoplinWorkspace"));

export default function MyDayApp() {
  const { user } = useAuth();
  const myDay = useMyDayAccess();
  const [gateOpen, setGateOpen] = useState(false);
  const startedForUser = useRef<string | null>(null);

  const uid = user?.id ?? null;

  // Phase-1 visibility contract is preserved: the rail/nav removes the My Day
  // entry when the admin hides the feature from non-subscribers.
  usePublishFeatureVisibility("myday", { hidden: Boolean(myDay.hidden) });

  // ── data migration V1 ─────────────────────────────────────────────────────
  // Staged, idempotent and resumable: it writes per section, verifies each write,
  // and never deletes legacy data (§11). A failure leaves the affected phase
  // pending and the next visit resumes from it.
  useEffect(() => {
    if (!uid || myDay.loading) return undefined;
    if (!myDay.unlimited && !myDay.paid && !myDay.canCreate) return undefined;
    if (startedForUser.current === uid) return undefined;
    startedForUser.current = uid;

    let cancelled = false;
    (async () => {
      const existing = await loadMigrationMarker(uid);
      if (cancelled) return;
      if (isMigrationComplete(existing)) return;
      trackMyDayEvent("myday_migration_started", { hasMarker: Boolean(existing) });
      const result = await runMyDayMigrationV1({
        uid,
        onProgress: (update) => {
          if (cancelled) return;
          trackMyDayEvent("myday_migration_phase", { phase: update.phase, status: update.status });
        },
      });
      if (cancelled) return;
      if (result.ok) {
        trackMyDayEvent("myday_migration_complete", {
          notes: result.marker?.counts.notes ?? 0,
          todos: result.marker?.counts.todos ?? 0,
          schedules: result.marker?.counts.schedules ?? 0,
        });
      } else {
        // Test / invalid leftover rows (JOPLIN_BAD_ID) are not restored — the
        // workspace is the product now, and there is no user-base data to keep.
        await skipLegacyMigration(uid, result.error || "legacy_not_needed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [myDay.canCreate, myDay.loading, myDay.paid, myDay.unlimited, uid]);

  // ── deep links ────────────────────────────────────────────────────────────
  // A legacy URL (an armed Android alarm, a Web Push payload already in flight,
  // an old notification document) is translated to a canonical workspace target
  // — never to the retired sections (§28, §128).
  const deepLinkFromHash = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const intent = parseMyDayHash(window.location.hash);
    if (intent.kind === "target" && intent.source === "legacy") {
      return buildMyDayDeepLink({ noteId: intent.noteId, notebookId: intent.notebookId, scheduleId: intent.scheduleId });
    }
    if (intent.kind === "target") {
      return buildMyDayDeepLink({
        noteId: intent.noteId,
        notebookId: intent.notebookId,
        tagId: intent.tagId,
        resourceId: intent.resourceId,
        scheduleId: intent.scheduleId,
        view: intent.view as "agenda" | "search" | "tags" | "trash" | undefined,
        action: intent.action,
      });
    }
    return null;
  }, []);

  // A notification tapped while the workspace is ALREADY open changes the hash
  // without remounting the route (the shell keeps rendering `#/my-day`). The
  // target is therefore tracked, not read once: the workspace host re-sends the
  // open message when it changes, so an armed alarm or a push tap keeps landing
  // on the migrated object instead of doing nothing.
  const [deepLink, setDeepLink] = useState<string | null>(() => deepLinkFromHash());
  useEffect(() => {
    const onHashChange = () => setDeepLink(deepLinkFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [deepLinkFromHash]);


  const handleNavigate = useCallback((hash: string) => {
    if (hash.startsWith("#/")) {
      window.location.hash = hash;
      return;
    }
    window.location.assign(hash);
  }, []);

  const getToken = useCallback(async () => {
    try {
      const current = user;
      if (!current) return null;
      const { auth } = await import("../firebase");
      return (await auth.currentUser?.getIdToken()) ?? null;
    } catch {
      return null;
    }
  }, [user]);

  // ── auth boundary ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <WorkspaceNotice
        title="Sign in to open My Day"
        body="My Day is your personal workspace — notebooks, notes, to-dos, tags and schedules. It is tied to your account so it stays private and syncs across your devices."
        actionLabel="Go to sign in"
        onAction={() => {
          window.location.hash = "#/auth";
        }}
      />
    );
  }

  // ── entitlement boundary (§57, §58) ───────────────────────────────────────
  // Browse stays open for everyone, exactly as before: the workspace renders, and
  // the server refuses CREATES when the allowance is spent. A direct deep link
  // into a paywalled workspace still lands on the gate.
  const blocked = !myDay.loading && !myDay.unlimited && !myDay.paid && !myDay.canCreate;

  if (myDay.loading && !myDay.unlimited && !myDay.paid) {
    return <WorkspaceNotice title="Opening My Day…" body="Checking your access and preparing your workspace." />;
  }

  return (
    <div // The route paints NO page plate of its own: the shared backdrop behind the
    // app is the surface while the bundle loads, and the workspace brings
    // Joplin's own canvas once it mounts (no Digitalcatalyst glass on top of it).
    className="myday-workspace-root relative flex min-h-[100dvh] w-full flex-col">
      {blocked ? (
        <PremiumGate
          variant="myday"
          userName={user.name}
          open
          asPage
          onClose={() => {
            window.location.hash = "#/home";
          }}
          onViewSubscription={() => {
            window.location.hash = "#/subscription";
          }}
          subtitle="Your My Day workspace is ready — subscribe or use today's free creation to add notes, to-dos and schedules."
        />
      ) : (
        <>
          <JoplinWorkspaceBoundary
            onGoHome={() => {
              window.location.hash = "#/home";
            }}
          >
            <Suspense fallback={<WorkspaceNotice title="Opening your workspace…" body="Starting notebooks, notes and to-dos." />}>
              <JoplinWorkspace
                uid={user.id}
                email={user.email ?? null}
                displayName={user.name ?? null}
                getToken={getToken}
                onNavigate={handleNavigate}
                deepLink={deepLink}
                onScheduleMessage={() => {
                  // Schedule mutations from inside the frame are persisted by the
                  // frame through the bridge API. The host only needs to know so
                  // the delivery layer can re-arm (§52, §154-18) — the event is
                  // announced by `joplinSchedulerBridge`, so there is exactly one
                  // scheduler reacting to it.
                }}
              />
            </Suspense>
          </JoplinWorkspaceBoundary>
        </>
      )}
      {gateOpen ? (
        <PremiumGate
          variant="myday"
          userName={user.name}
          open
          onClose={() => setGateOpen(false)}
          onViewSubscription={() => {
            window.location.hash = "#/subscription";
          }}
        />
      ) : null}
      {!blocked ? (
        <BottomNav
          active="myday"
          peek
          onChange={(tab: TabKey) => {
            if (tab === "myday") return;
            if (tab === "home") window.location.hash = "#/home";
            else if (tab === "store") window.location.hash = "#/store";
            else if (tab === "purchases") window.location.hash = "#/store/purchases";
            else if (tab === "profile") window.location.hash = "#/profile";
            else if (tab === "study-library") window.location.hash = "#/study-library";
            else if (tab === "revision") window.location.hash = "#/revision";
            else if (tab === "flowpath") window.location.hash = "#/flowpath";
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceNotice({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="grid min-h-[100dvh] w-full place-items-center bg-neutral-100 px-4 dark:bg-neutral-900" data-myday-notice>
      <div className="max-w-md text-center">
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{body}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
