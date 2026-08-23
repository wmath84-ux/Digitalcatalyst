import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import StoreHeader from "../components/Header";
import { ExitGuardProvider } from "./components/ExitGuardContext";
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

export default function RevisionApp() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { hasAccess: hasRevisionAccess, loading: revisionAccessLoading } = useRevisionAccess();
  const [route, setRoute] = useState(() => window.location.hash);
  const [syncKey, setSyncKey] = useState(0);
  const [revisionDataLoading, setRevisionDataLoading] = useState(Boolean(user));
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-xl shadow-slate-200 sm:h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:border sm:border-slate-200">
        <ExitGuardProvider onNavigate={(href) => { window.location.hash = href; }}>
          <RevisionHeaderProvider>
            <RevisionStoreHeader cartCount={cartIds.size} />
            {revisionAccessLoading || revisionDataLoading ? (
              <div data-revision-access-loading className="grid min-h-0 flex-1 place-items-center bg-white">
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-violet-500" />
                  <p className="text-xs font-semibold">{revisionAccessLoading ? "Checking your membership…" : "Syncing your Test Bank…"}</p>
                </div>
              </div>
            ) : (
              <Fragment key={syncKey}>{page}</Fragment>
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
