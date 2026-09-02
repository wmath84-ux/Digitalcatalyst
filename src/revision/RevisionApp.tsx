import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import StoreHeader from "../components/Header";
import PageTabs, { type PageTabItem } from "../components/ui/PageTabs";
import { useRegisterTopBarTabs, useTopBarTabsHost } from "../components/TopBarTabsContext";
import { ExitGuardProvider, useExitGuard } from "./components/ExitGuardContext";
import { RevisionHeaderProvider, useRevisionHeader } from "./components/RevisionHeaderContext";
import DashboardPage from "./pages/DashboardPage";
import RevisionBankPage from "./pages/RevisionBankPage";
import RevisionSessionPage from "./pages/RevisionSessionPage";
import RevisionSessionResultPage from "./pages/RevisionSessionResultPage";
import TestPlayerPage from "./pages/TestPlayerPage";
import TestResultPage from "./pages/TestResultPage";
import TestReviewPage from "./pages/TestReviewPage";
import WeakTopicsPage from "./pages/WeakTopicsPage";
import ProgressPage from "./pages/ProgressPage";
import RevisionProfilePage from "./pages/RevisionProfilePage";
import AiSettingsPage from "./pages/AiSettingsPage";
import AiGeneratePage from "./pages/AiGeneratePage";
import BulkImportPage from "./pages/BulkImportPage";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { useCommerce } from "../context/CommerceContext";
import { useRevisionAccess } from "../hooks/useRevisionAccess";
import { usePublishFeatureVisibility } from "../context/FeatureVisibilityContext";
import { syncRevisionCatalog } from "./engine/catalogService";
import { hydrateRevisionFromCloud, queueRevisionCloudPersistence } from "./engine/cloudRevisionService";
import PremiumGate from "../components/subscription/PremiumGate";

/**
 * Daily Test & Revision feature shell.
 *
 * Same behaviour as My Day: the app is always rendered so the learner can
 * browse, and the subscription gate only appears as a floating modal when a
 * paid creation action is attempted. Saved tests, results, retakes and Smart
 * Revision remain available after expiry/downgrade. The gate applies only
 * while the `revision` feature doc is active in the subscription catalog.
 */

/**
 * The shared website header. Top-level tab pages merge their section header
 * into it (e.g. Dashboard shows "<AppName> Revision" with its user-name
 * greeting; Test Bank shows "<AppName> Test Bank" with its saved-count), so
 * only one headers renders at a time. Sub-pages with back buttons keep their
 * own feature header and this header shows the default store branding.
 */
function RevisionStoreHeader({ cartCount }: { cartCount: number }) {
  const { appName } = useBranding();
  const header = useRevisionHeader();
  return (
    <StoreHeader
      cartCount={cartCount}
      notifCount={1}
      onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
      onNavigateToCart={() => { window.location.hash = "#/cart"; }}
      onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
      title={header.title ? `${appName} ${header.title}` : undefined}
      subtitle={header.subtitle}
      action={header.rightSlot}
    />
  );
}

/**
 * The Revision page-switcher for tablet + desktop.
 *
 * The revision footer pill carries these destinations on a phone and is
 * hidden from 768 px up, so a wide screen needs the same pages reachable in
 * one click. Each tab opens its own route — the same `#/revision/...` hashes
 * the footer uses — through the feature's exit guard so an in-progress test
 * still asks before the learner walks away.
 *
 * Where the row renders depends on which chrome is on screen:
 *   • Tablet portrait (768–959 px) — the phone header is the chrome, so the
 *     tabs render as a text row in the page body (src/components/ui/PageTabs).
 *   • Tablet landscape + desktop — the desktop shell owns the header, so the
 *     SAME tabs are published into that header as its second row (see
 *     `useRegisterTopBarTabs`) and the in-body strip is skipped. They live
 *     there only while Revision is mounted, so no other page shows them.
 */
const REVISION_TABS: PageTabItem[] = [
  { id: "dashboard", label: "Dashboard", href: "#/revision", hint: "Today's revision overview" },
  { id: "bank", label: "Test Bank", href: "#/revision/bank", hint: "Saved tests and questions due today" },
  { id: "weak", label: "Weak Topics", href: "#/revision/weak-topics", hint: "Where to focus next" },
  { id: "progress", label: "Progress", href: "#/revision/progress", hint: "Scores over time" },
  { id: "profile", label: "Profile", href: "#/revision/profile", hint: "Plan, subjects and AI settings" },
];

/** Which tab the current route belongs to (`null` = none of them). */
export function resolveRevisionTabId(path: string): string | null {
  // Test Bank stays highlighted while a Smart Revision session is open, since
  // sessions are driven by the bank (same pairing as the footer's matcher).
  if (path.startsWith("#/revision/bank") || path.startsWith("#/revision/session")) return "bank";
  if (path.startsWith("#/revision/weak-topics")) return "weak";
  if (path.startsWith("#/revision/progress")) return "progress";
  // The generator, bulk import and AI config screens are reached from the
  // revision profile, so the row keeps Profile lit while they are open.
  if (
    path.startsWith("#/revision/profile")
    || path.startsWith("#/revision/customize")
    || path.startsWith("#/revision/ai-")
    || path.startsWith("#/revision/bulk-import")
  ) {
    return "profile";
  }
  if (path === "#/revision" || path === "#/revision/") return "dashboard";
  return null;
}

/**
 * True on sub-pages that render their own feature header (the back-button
 * `AppHeader` from PageShell): AI settings / generator, bulk import, the test
 * player / test result / test review and the Smart Revision session. On
 * tablet the tab strip is only meant to switch the five top-level tab pages,
 * so stacking it above the feature header pushed that header down and left a
 * redundant row between the site header and the page. Sub-pages skip the
 * in-body strip; the desktop shell's top-bar tab row is unaffected (it is
 * published separately via `useRegisterTopBarTabs`).
 */
export function isRevisionSubPage(path: string): boolean {
  if (path === "#/revision" || path === "#/revision/") return false;
  if (path.startsWith("#/revision/bank")) return false;
  if (path.startsWith("#/revision/weak-topics")) return false;
  if (path.startsWith("#/revision/progress")) return false;
  if (path.startsWith("#/revision/profile")) return false;
  return true;
}

/**
 * True on the focused test-taking surfaces, where the feature also hides its
 * own bottom nav (`PageShell hideNav`): a running test and an in-progress
 * Smart Revision session. The tab row steps out of the way there too, so the
 * learner is never one mis-click away from leaving an attempt.
 */
export function isRevisionFocusRoute(path: string): boolean {
  return /^#\/revision\/test\/play(?:-attempt)?(?:\/\d+)?$/.test(path)
    || /^#\/revision\/session\/\d+$/.test(path);
}

export function RevisionPageTabs({ path }: { path: string }) {
  const { navigate } = useExitGuard();
  const activeId = resolveRevisionTabId(path);
  // `null` unless the desktop shell is mounted and owns the header.
  const topBarHost = useTopBarTabsHost();
  const focusRoute = isRevisionFocusRoute(path);
  const subPage = isRevisionSubPage(path);

  // Publish the row into the desktop header. Registering `null` on the focused
  // test-taking surfaces — and clearing on unmount, which `useRegisterTopBarTabs`
  // does for us — is what keeps the tabs inside the header ONLY on Revision.
  useRegisterTopBarTabs(
    topBarHost && !focusRoute
      ? {
          feature: "revision",
          ariaLabel: "Revision pages",
          items: REVISION_TABS,
          activeId,
          onSelect: (id) => {
            const href = REVISION_TABS.find((tab) => tab.id === id)?.href;
            if (href && href !== path) navigate(href);
          },
          onHome: () => navigate("#/home"),
        }
      : null,
  );

  // The desktop header already shows them; the focused routes show neither;
  // and sub-pages (AI settings, bulk import, …) render their own feature
  // header, so the strip would only push that header down below the tabs.
  if (topBarHost || focusRoute) return null;
  if (subPage) return null;

  return (
    <PageTabs
      items={REVISION_TABS}
      activeId={activeId}
      ariaLabel="Revision pages"
      feature="revision"
      onSelect={(id) => {
        const href = REVISION_TABS.find((tab) => tab.id === id)?.href;
        if (href && href !== path) navigate(href);
      }}
      onHome={() => navigate("#/home")}
    />
  );
}

export default function RevisionApp() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { hasAccess: hasRevisionAccess, loading: revisionAccessLoading, hidden: revisionHidden } = useRevisionAccess();
  const [route, setRoute] = useState(() => window.location.hash);
  const [syncKey, setSyncKey] = useState(0);
  const [revisionDataLoading, setRevisionDataLoading] = useState(Boolean(user));
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Phase-1: publish Revision's visibility into the shared context so the
  // desktop rail can remove the entry when admin has set the feature to
  // "hide" mode AND the user is not a subscriber.
  usePublishFeatureVisibility("revision", { hidden: Boolean(revisionHidden) });

  const uid = user?.id ?? "guest";
  const userName = user?.name?.split(" ")[0] || "Learner";

  useEffect(() => {
    let cancelled = false;
    setRevisionDataLoading(uid !== "guest");
    void (async () => {
      let changed = false;
      if (uid !== "guest") {
        try {
          await hydrateRevisionFromCloud(uid);
          changed = true;
        } catch (error) {
          // Keep the local cache usable during a temporary network outage. The
          // next launch retries cloud hydration/migration automatically.
          console.warn("[revision] cloud hydration skipped", error);
        }
      }
      try {
        changed = (await syncRevisionCatalog(uid)) || changed;
      } catch {
        // Catalog sync is independent of learner progress persistence.
      }
      if (!cancelled) {
        if (changed) setSyncKey((key) => key + 1);
        setRevisionDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    if (uid === "guest") return undefined;
    const onRevisionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      if (detail?.uid === uid) queueRevisionCloudPersistence(uid);
    };
    window.addEventListener("revision-db-changed", onRevisionChange);
    return () => window.removeEventListener("revision-db-changed", onRevisionChange);
  }, [uid]);

  const requireAccess = useCallback(() => {
    // Gate appears ONLY when the learner tries a paywalled action (same as
    // My Day). If they already have access, let the action proceed.
    if (hasRevisionAccess) return true;
    setPaywallOpen(true);
    return false;
  }, [hasRevisionAccess]);

  // Strip query params so deep links like #/revision?x=1 still route.
  const path = route.split("?")[0];

  const sessionMatch = path.match(/^#\/revision\/session\/(\d+)(\/result)?$/);
  const resultMatch = path.match(/^#\/revision\/test\/result\/(\d+)$/);
  const reviewMatch = path.match(/^#\/revision\/test\/review\/(\d+)$/);
  const attemptPlayMatch = path.match(/^#\/revision\/test\/play-attempt\/(\d+)$/);
  const playMatch = path.match(/^#\/revision\/test\/play(?:\/(\d+))?$/);

  let page: ReactNode;

  if (attemptPlayMatch || playMatch) {
    // Existing saved tests and in-progress attempts remain usable after a
    // downgrade or expiry. Entitlement is checked only when creating tests.
    page = (
      <TestPlayerPage
        uid={uid}
        route={path}
        testId={playMatch?.[1] ? Number(playMatch[1]) : null}
        attemptId={attemptPlayMatch?.[1] ? Number(attemptPlayMatch[1]) : null}
      />
    );
  } else if (resultMatch) {
    page = <TestResultPage uid={uid} route={path} attemptId={Number(resultMatch[1])} />;
  } else if (reviewMatch) {
    page = <TestReviewPage uid={uid} route={path} attemptId={Number(reviewMatch[1])} />;
  } else if (sessionMatch && sessionMatch[2]) {
    page = <RevisionSessionResultPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
  } else if (sessionMatch) {
    // Smart Revision sessions operate on existing learner-owned data and stay
    // accessible after a downgrade/expiry, including sessions already in
    // progress when the entitlement changed.
    page = <RevisionSessionPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
  } else if (path.startsWith("#/revision/bank")) {
    page = (
      <RevisionBankPage
        uid={uid}
        route={path}
        hasAccess={hasRevisionAccess}
        onRequireAccess={requireAccess}
      />
    );
  } else if (path.startsWith("#/revision/weak-topics")) {
    page = <WeakTopicsPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/progress")) {
    page = <ProgressPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/profile")) {
    page = <RevisionProfilePage uid={uid} route={path} userName={userName} />;
  } else if (path.startsWith("#/revision/customize/ai-config")) {
    page = <AiSettingsPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/customize")) {
    // Legacy customization deep-links now land on the AI test generator —
    // customization is fully user-driven from the profile page.
    page = <AiGeneratePage uid={uid} route={path} hasAccess={hasRevisionAccess} onRequireAccess={requireAccess} />;
  } else if (path.startsWith("#/revision/ai-settings")) {
    page = <AiSettingsPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/ai-generate")) {
    page = <AiGeneratePage uid={uid} route={path} hasAccess={hasRevisionAccess} onRequireAccess={requireAccess} />;
  } else if (path.startsWith("#/revision/bulk-import")) {
    page = <BulkImportPage uid={uid} route={path} hasAccess={hasRevisionAccess} onRequireAccess={requireAccess} />;
  } else {
    page = (
      <DashboardPage
        uid={uid}
        route={path}
        userName={userName}
        hasAccess={hasRevisionAccess}
        onRequireAccess={requireAccess}
      />
    );
  }

  return (
    <div data-revision-app className="dc-app-shell min-h-screen sm:py-6">
      <div data-app-frame data-revision-frame className="dc-app-frame relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden sm:h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:h-[calc(100dvh-3rem)] sm:rounded-[2rem] md:max-w-none md:rounded-none md:bg-transparent md:shadow-none md:border-0">
        <ExitGuardProvider onNavigate={(href) => { window.location.hash = href; }}>
          <RevisionHeaderProvider>
            <RevisionStoreHeader cartCount={cartIds.size} />

            {/* The Revision page-switcher. It publishes itself into the desktop
                shell's header when the shell owns the chrome, and renders as a
                text row under the shared header otherwise. Either way it is
                skipped on the focused test-taking surfaces, exactly like the
                feature's own bottom nav. */}
            <RevisionPageTabs path={path} />

            {revisionAccessLoading || revisionDataLoading ? (
              <div data-revision-access-loading data-revision-content className="grid min-h-0 flex-1 place-items-center bg-transparent px-4">
                <div className="dc-glass flex flex-col items-center gap-2 rounded-3xl px-8 py-7 text-white/55">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-violet-500" />
                  <p className="text-xs font-semibold">{revisionAccessLoading ? "Checking your membership…" : "Syncing your Test Bank…"}</p>
                </div>
              </div>
            ) : (
              <div data-revision-content className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <Fragment key={syncKey}>
                  <div
                    key={path}
                    data-page-enter-panel=""
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                  >
                    {page}
                  </div>
                </Fragment>
              </div>
            )}

            {/* Floating subscription gate — appears when a paywalled action is
                attempted (same behaviour as My Day). */}
            <PremiumGate
              variant="revision"
              userName={userName}
              open={paywallOpen}
              onClose={() => setPaywallOpen(false)}
              onViewSubscription={() => {
                setPaywallOpen(false);
                window.location.hash = "#/subscription";
              }}
              subtitle="Naya AI ya imported revision test cloud Test Bank mein save karne ke liye active Revision Studio access chahiye. Aapke existing tests, results aur retakes hamesha available rahenge."
            />
          </RevisionHeaderProvider>
        </ExitGuardProvider>
      </div>
    </div>
  );
}
