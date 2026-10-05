/**
 * Revision feature shell — the ported Recall application.
 * ======================================================
 *
 * This file replaces the retired five-tab Liquid-Glass Revision shell. What is
 * on screen from here down is Recall's own UI (MIT — see THIRD_PARTY_NOTICES.md),
 * ported file-for-file into `src/revision/recall/**` and driven by
 * Digitalcatalyst data through `src/revision/integrations/**`.
 *
 * Responsibilities, in order:
 *
 *   1. Own the feature's chrome: the Recall root element, its theme/variant
 *      attributes and the ported `AppShell` (sidebar + mobile tabs + command
 *      palette).
 *   2. Bootstrap the data path exactly once: register the Digitalcatalyst
 *      repository (§13), run the versioned migration (§12), hydrate the
 *      existing Firebase documents (§14), keep the legacy engine and the
 *      ported store in sync (§18) and arm reminders through the existing
 *      notification stack (§20).
 *   3. Route: `#/revision` and every legacy deep link (§21). Recall views are
 *      the ported in-component `view` state mirrored into the hash; the
 *      Digitalcatalyst surfaces Recall has no equivalent for (Daily Test,
 *      Test Bank, Weak Topics, Progress, plan/AI settings, Bulk Import) are
 *      rendered in the SAME design language by `pages/**`.
 *   4. Keep the business safeguards of the old shell that are not visual:
 *      `useRevisionAccess` entitlement checks, the floating `PremiumGate`,
 *      feature visibility for the host rail, cloud persistence on
 *      `revision-db-changed`, and `ExitGuard` for in-flight tests.
 *
 * Nothing here reads or writes global CSS: `recall-theme.css` is imported here
 * (the only entry point of the Revision chunk) and every token inside it is
 * scoped to `[data-recall-root]` (§22).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import "./recall-theme.css";

import PremiumGate from "../components/subscription/PremiumGate";
import { useAuth } from "../context/AuthContext";
import { useCommerce } from "../context/CommerceContext";
import { usePublishFeatureVisibility } from "../context/FeatureVisibilityContext";
import { useRevisionAccess } from "../hooks/useRevisionAccess";

import { ExitGuardProvider } from "./components/ExitGuardContext";
import { RevisionTabs } from "./components/RevisionTabs";
import { RevisionDashboardExtras } from "./components/RevisionDashboardExtras";
import { RecallLoading } from "./components/recall-ui";
import { bootstrapRevisionFeature, disposeRevisionFeature } from "./integrations/bootstrap";
import { RevisionRouteProvider } from "./integrations/route-context";
import {
  hashForRecallView,
  parseRevisionRoute,
  recallViewForPage,
  type RevisionRoute,
} from "./integrations/routes";

import { ErrorBoundary } from "./recall/components/error-boundary";
import { PWAUpdatePrompt } from "./recall/components/pwa-update-prompt";
import { QuickAddDialog } from "./recall/components/quick-add";
import { AppShell } from "./recall/components/app-shell";
import { Dashboard } from "./recall/components/dashboard";
import {
  applyAccentColor,
  applyDyslexiaFont,
  applyTheme,
  registerRecallThemeRoot,
} from "./recall/services/storage";
import { Toaster } from "./recall/shims/toast";
import { useRecallStore } from "./recall/stores/recall-store";
import { useTranslation } from "./recall/shims/i18n";

import { hydrateRevisionFromCloud, queueRevisionCloudPersistence } from "./engine/cloudRevisionService";
import { syncRevisionCatalog } from "./engine/catalogService";

/* ── Ported Recall views, lazy like upstream ─────────────────────────────── */
const DeckBrowser = lazy(() => import("./recall/components/deck-browser").then((m) => ({ default: m.DeckBrowser })));
const DeckDetail = lazy(() => import("./recall/components/deck-detail").then((m) => ({ default: m.DeckDetail })));
const CardBrowser = lazy(() => import("./recall/components/card-browser").then((m) => ({ default: m.CardBrowser })));
const MatchGame = lazy(() => import("./recall/components/match-game").then((m) => ({ default: m.MatchGame })));
const Onboarding = lazy(() => import("./recall/components/onboarding").then((m) => ({ default: m.Onboarding })));
const RecallSettings = lazy(() => import("./recall/components/settings").then((m) => ({ default: m.Settings })));
const ShortcutOverlay = lazy(() => import("./recall/components/shortcut-help").then((m) => ({ default: m.ShortcutHelp })));
const Stats = lazy(() => import("./recall/components/stats").then((m) => ({ default: m.Stats })));
const StudyMode = lazy(() => import("./recall/components/study-mode").then((m) => ({ default: m.StudyMode })));
const TagManager = lazy(() => import("./recall/components/tag-manager").then((m) => ({ default: m.TagManager })));
const ImportHub = lazy(() => import("./recall/components/import-hub").then((m) => ({ default: m.ImportHub })));
const FocusTimer = lazy(() => import("./recall/components/focus-timer").then((m) => ({ default: m.FocusTimer })));

/* ── Digitalcatalyst surfaces, rendered in the ported design language ────── */
const TestBankPage = lazy(() => import("./pages/TestBankPage"));
const TestPlayerPage = lazy(() => import("./pages/TestPlayerPage"));
const TestResultPage = lazy(() => import("./pages/TestResultPage"));
const TestReviewPage = lazy(() => import("./pages/TestReviewPage"));
const RevisionSessionPage = lazy(() => import("./pages/RevisionSessionPage"));
const RevisionSessionResultPage = lazy(() => import("./pages/RevisionSessionResultPage"));
const WeakTopicsPage = lazy(() => import("./pages/WeakTopicsPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const RevisionProfilePage = lazy(() => import("./pages/RevisionProfilePage"));
const AiGeneratePage = lazy(() => import("./pages/AiGeneratePage"));
const AiSettingsPage = lazy(() => import("./pages/AiSettingsPage"));
const BulkImportPage = lazy(() => import("./pages/BulkImportPage"));

const REVISION_HASH = "#/revision";

interface RevisionAppProps {
  /** Overridden in tests; production reads the signed-in learner. */
  uidOverride?: string;
}

export default function RevisionApp({ uidOverride }: RevisionAppProps = {}) {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { hasAccess, loading: accessLoading, hidden } = useRevisionAccess();
  const { t } = useTranslation();

  const uid = uidOverride ?? user?.id ?? "guest";
  const userName = user?.name?.split(" ")[0] || "Learner";

  const [route, setRoute] = useState<RevisionRoute>(() => parseRevisionRoute(window.location.hash));
  const [dataLoading, setDataLoading] = useState(uid !== "guest");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const initialize = useRecallStore((state) => state.initialize);
  const view = useRecallStore((state) => state.view);
  const selectedDeckId = useRecallStore((state) => state.selectedDeckId);
  const isLoading = useRecallStore((state) => state.isLoading);
  const storeError = useRecallStore((state) => state.error);
  const showDashboard = useRecallStore((state) => state.showDashboard);
  const showDeck = useRecallStore((state) => state.showDeck);
  const showStats = useRecallStore((state) => state.showStats);
  const showBrowser = useRecallStore((state) => state.showBrowser);
  const showDeckBrowser = useRecallStore((state) => state.showDeckBrowser);
  const showTags = useRecallStore((state) => state.showTags);
  const showSettings = useRecallStore((state) => state.showSettings);
  const showImportHub = useRecallStore((state) => state.showImportHub);
  const showFocusTimer = useRecallStore((state) => state.showFocusTimer);
  const settings = useRecallStore((state) => state.settings);

  /* ── 1. Feature visibility for the host rail (unchanged behaviour) ─────── */
  usePublishFeatureVisibility("revision", { hidden: Boolean(hidden) });

  /* ── 2. Hash ⇄ route ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onHashChange = () => setRoute(parseRevisionRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((href: string) => {
    if (window.location.hash === href) return;
    window.location.hash = href;
  }, []);

  /* ── 3. Bootstrap: repository, migration, cloud, legacy sync, reminders ── */
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    void (async () => {
      try {
        if (uid !== "guest") {
          try {
            await hydrateRevisionFromCloud(uid);
          } catch (error) {
            // Local cache stays usable through an outage; the next launch
            // retries hydration.
            console.warn("[revision] cloud hydration skipped", error);
          }
        }
        try {
          await syncRevisionCatalog(uid);
        } catch {
          /* catalog sync is independent of learner progress */
        }
        if (!cancelled) {
          await bootstrapRevisionFeature(uid);
          setSyncKey((key) => key + 1);
        }
      } catch (error) {
        console.error("[revision] bootstrap failed", error);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      disposeRevisionFeature();
    };
  }, [uid]);

  /* ── 4. Load the ported store once the repository is registered ────────── */
  useEffect(() => {
    if (dataLoading) return;
    void initialize();
  }, [dataLoading, initialize]);

  /* ── 5. Legacy writes keep flowing to the cloud (unchanged behaviour) ──── */
  useEffect(() => {
    if (uid === "guest") return undefined;
    const onRevisionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (detail?.uid === uid) queueRevisionCloudPersistence(uid);
    };
    window.addEventListener("revision-db-changed", onRevisionChange);
    return () => window.removeEventListener("revision-db-changed", onRevisionChange);
  }, [uid]);

  /* ── 6. Theme root: the feature owns its own theme state ───────────────── */
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    registerRecallThemeRoot(element);
    applyTheme(settings.theme);
    applyAccentColor(settings.accentColor);
    applyDyslexiaFont(settings.dyslexiaFont);
    return () => registerRecallThemeRoot(null);
  }, [settings.theme, settings.accentColor, settings.dyslexiaFont]);

  /* ── 7. Route → ported view ───────────────────────────────────────────── */
  const recallView = recallViewForPage(route.page);
  useEffect(() => {
    if (!recallView) return;
    if (recallView === view) return;
    switch (recallView) {
      case "dashboard":
        showDashboard();
        break;
      case "deck-browser":
        showDeckBrowser();
        break;
      case "deck":
        if (route.id) showDeck(String(route.id));
        else showDeckBrowser();
        break;
      case "stats":
        showStats();
        break;
      case "browser":
        showBrowser();
        break;
      case "tags":
        showTags();
        break;
      case "settings":
        // The ported settings screen is the Revision profile (§5).
        if (route.page === "profile") showSettings();
        else showSettings();
        break;
      case "import-hub":
        showImportHub();
        break;
      case "focus-timer":
        showFocusTimer();
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recallView, route.id, route.page]);

  /* ── 8. Ported view → hash (back button, refresh and shared links work) ── */
  const lastMirrored = useRef<string>("");
  useEffect(() => {
    if (!recallView) return;
    const target = hashForRecallView(
      recallView === "deck" && selectedDeckId ? "deck" : recallView,
      selectedDeckId,
    );
    if (target === lastMirrored.current) return;
    lastMirrored.current = target;
    if (window.location.hash !== target && !window.location.hash.startsWith(`${REVISION_HASH}/test`)) {
      window.location.hash = target;
    }
  }, [recallView, selectedDeckId]);

  /* ── 9. Global shortcuts owned by upstream's App ───────────────────────── */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setShowQuickAdd(true);
        return;
      }
      if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShowShortcuts((previous) => !previous);
        return;
      }
      if (event.key.toLowerCase() === "i" && view !== "study" && view !== "match") {
        event.preventDefault();
        showImportHub();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showImportHub, view]);

  const requireAccess = useCallback(() => {
    if (hasAccess) return true;
    setPaywallOpen(true);
    return false;
  }, [hasAccess]);

  /* ── Render ────────────────────────────────────────────────────────────── */
  const dcPage = useMemo<ReactNode>(() => {
    switch (route.page) {
      case "dashboard":
      case "decks":
      case "browser":
      case "tags":
      case "stats":
      case "settings":
      case "import-hub":
      case "focus-timer":
      case "study":
        return null;
      case "bank":
        return <TestBankPage uid={uid} hasAccess={hasAccess} onRequireAccess={requireAccess} />;
      case "test-play":
        return <TestPlayerPage uid={uid} testId={route.id} />;
      case "test-play-attempt":
        return <TestPlayerPage uid={uid} attemptId={route.id} />;
      case "test-result":
        return <TestResultPage uid={uid} attemptId={route.id} />;
      case "test-review":
        return <TestReviewPage uid={uid} attemptId={route.id} />;
      case "session":
        return route.id === null ? null : <RevisionSessionPage uid={uid} sessionId={route.id} />;
      case "session-result":
        return route.id === null ? null : <RevisionSessionResultPage uid={uid} route={route.hash} sessionId={route.id} />;
      case "weak-topics":
        return <WeakTopicsPage uid={uid} />;
      case "progress":
        return <ProgressPage uid={uid} />;
      case "profile":
        return <RevisionProfilePage uid={uid} userName={userName} />;
      case "ai-generate":
        return <AiGeneratePage uid={uid} route={route.hash} hasAccess={hasAccess} onRequireAccess={requireAccess} />;
      case "ai-settings":
        return <AiSettingsPage uid={uid} route={route.hash} />;
      case "bulk-import":
        return <BulkImportPage uid={uid} route={route.hash} hasAccess={hasAccess} onRequireAccess={requireAccess} />;
      default:
        return null;
    }
  }, [hasAccess, requireAccess, route.id, route.page, uid, userName]);

  const isFocused = route.page === "test-play" || route.page === "test-play-attempt";
  const isStudy = view === "study" || view === "match";

  const recallContent = (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <RecallLoading label={t("app.loadingView", "Loading…")} />
        </div>
      }
    >
      {view === "dashboard" ? (
        <ErrorBoundary viewName="Dashboard" onRecover={showDashboard}>
          <Dashboard />
          <RevisionDashboardExtras uid={uid} hasAccess={hasAccess} onRequireAccess={requireAccess} />
        </ErrorBoundary>
      ) : null}
      {view === "deck" ? (
        <ErrorBoundary viewName="DeckDetail" onRecover={showDashboard}>
          <DeckDetail />
        </ErrorBoundary>
      ) : null}
      {view === "settings" ? (
        <ErrorBoundary viewName="Settings" onRecover={showDashboard}>
          <RecallSettings />
        </ErrorBoundary>
      ) : null}
      {view === "stats" ? (
        <ErrorBoundary viewName="Stats" onRecover={showDashboard}>
          <Stats />
        </ErrorBoundary>
      ) : null}
      {view === "browser" ? (
        <ErrorBoundary viewName="CardBrowser" onRecover={showDashboard}>
          <CardBrowser />
        </ErrorBoundary>
      ) : null}
      {view === "tags" ? (
        <ErrorBoundary viewName="TagManager" onRecover={showDashboard}>
          <TagManager />
        </ErrorBoundary>
      ) : null}
      {view === "deck-browser" ? (
        <ErrorBoundary viewName="DeckBrowser" onRecover={showDashboard}>
          <DeckBrowser />
        </ErrorBoundary>
      ) : null}
      {view === "onboarding" ? (
        <ErrorBoundary viewName="Onboarding" onRecover={showDashboard}>
          <Onboarding />
        </ErrorBoundary>
      ) : null}
      {view === "import-hub" ? (
        <ErrorBoundary viewName="ImportHub" onRecover={showDashboard}>
          <ImportHub />
        </ErrorBoundary>
      ) : null}
      {view === "focus-timer" ? (
        <ErrorBoundary viewName="FocusTimer" onRecover={showDashboard}>
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="w-full max-w-md">
              <FocusTimer />
            </div>
          </div>
        </ErrorBoundary>
      ) : null}
    </Suspense>
  );

  const showOnboardingRequired =
    !isLoading && !storeError && settings.onboardingComplete === false && recallView === "dashboard";

  return (
    <RevisionRouteProvider route={route} navigate={navigate}>
      <div
        ref={rootRef}
        data-recall-root
        data-revision-app
        data-revision-frame
        className="min-h-dvh bg-background font-body text-on-surface antialiased"
      >
        <ExitGuardProvider onNavigate={navigate}>
          {isStudy ? (
            <main className="min-h-dvh bg-background px-4 py-5 text-on-surface sm:px-6 lg:px-8">
              <Suspense fallback={<RecallLoading />}>
                {view === "study" ? (
                  <ErrorBoundary viewName="StudyMode" onRecover={showDashboard}>
                    <StudyMode />
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary viewName="MatchGame" onRecover={showDashboard}>
                    <MatchGame />
                  </ErrorBoundary>
                )}
              </Suspense>
            </main>
          ) : (
            <AppShell>
              {/* The Digitalcatalyst destinations the ported nav does not carry.
                  Rendered in Recall's own secondary-tab language so the feature
                  keeps ONE chrome. Focused test-taking hides it. */}
              {!isFocused ? <RevisionTabs route={route} /> : null}

              {accessLoading || dataLoading || isLoading ? (
                <div className="py-16" data-revision-access-loading>
                  <RecallLoading
                    label={
                      accessLoading
                        ? "Checking your membership…"
                        : t("app.loading", "Loading your revision library…")
                    }
                  />
                </div>
              ) : (
                <>
                  {storeError ? (
                    <div className="rounded-2xl border border-error/40 bg-error-container p-5 text-on-error-container">
                      <p className="font-semibold">{t("app.couldNotLoad", "Could not load your revision data")}</p>
                      <p className="mt-1 text-sm opacity-90">{storeError}</p>
                    </div>
                  ) : null}

                  <div key={syncKey}>
                    {showOnboardingRequired ? (
                      <Suspense fallback={<RecallLoading />}>
                        <Onboarding />
                      </Suspense>
                    ) : dcPage ? (
                      <Suspense fallback={<RecallLoading />}>{dcPage}</Suspense>
                    ) : (
                      recallContent
                    )}
                  </div>
                </>
              )}
            </AppShell>
          )}

          <PremiumGate
            variant="revision"
            userName={userName}
            open={paywallOpen}
            onClose={() => setPaywallOpen(false)}
            onViewSubscription={() => {
              setPaywallOpen(false);
              window.location.hash = "#/subscription";
            }}
            subtitle="Naya AI ya imported revision test cloud Test Bank mein save karne ke liye active Roman AI Pro access chahiye. Aapke existing tests, results aur retakes hamesha available rahenge."
          />
        </ExitGuardProvider>

        <Toaster richColors closeButton position="top-right" />
        <QuickAddDialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
        {showShortcuts ? (
          <Suspense fallback={null}>
            <ShortcutOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          </Suspense>
        ) : null}
        <PWAUpdatePrompt />

        {/* Screen-reader announcement for view changes (upstream behaviour). */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {`${t("app.dashboardView", "Dashboard")} — ${view}`}
        </div>

        {/* Cart badge parity with the rest of the app shell. */}
        <span className="sr-only" data-revision-cart-count={cartIds.size} />
      </div>
    </RevisionRouteProvider>
  );
}

export { REVISION_HASH };
