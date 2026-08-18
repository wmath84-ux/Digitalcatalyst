import { Fragment, useEffect, useState, type ReactNode } from "react";
import StoreHeader from "../components/Header";
import { ExitGuardProvider } from "./components/ExitGuardContext";
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
import { useAuth } from "../context/AuthContext";
import { useCommerce } from "../context/CommerceContext";
import { useRevisionAccess } from "../hooks/useRevisionAccess";
import { syncRevisionCatalog } from "./engine/catalogService";
import RevisionLockScreen from "./components/RevisionLockScreen";

/**
 * Daily Test & Revision feature shell.
 *
 * Ported from the standalone reference app in daily-test-revision-system.zip
 * and integrated on the same pattern as the My Day feature:
 * - the website's own header (StoreHeader) stays on top;
 * - the feature's header sits sticky right below it (both always visible);
 * - the bottom navigation keeps ONLY the website's Home button and replaces
 *   every other slot with the feature's tabs (Bank / Weak Spots / Progress /
 *   Profile), exactly as designed in the reference BottomNav.
 *
 * All data runs on a local per-user engine (see ./engine) so the feature is
 * fully functional offline — the same optimisation approach as My Day.
 */
export default function RevisionApp() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { hasAccess: hasRevisionAccess, loading: revisionAccessLoading } = useRevisionAccess();
  const [route, setRoute] = useState(() => window.location.hash);
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const uid = user?.id ?? "guest";
  const userName = user?.name?.split(" ")[0] || "Learner";

  // Pull a newer admin-published catalog into the local engine when one
  // exists, then re-mount the page so every stat reflects the new content.
  useEffect(() => {
    let cancelled = false;
    void syncRevisionCatalog(uid).then((changed) => {
      if (!cancelled && changed) setSyncKey((k) => k + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Strip query params so deep links like #/revision?x=1 still route.
  const path = route.split("?")[0];

  let page: ReactNode;
  const sessionMatch = path.match(/^#\/revision\/session\/(\d+)(\/result)?$/);
  const resultMatch = path.match(/^#\/revision\/test\/result\/(\d+)$/);
  const reviewMatch = path.match(/^#\/revision\/test\/review\/(\d+)$/);

  if (path === "#/revision/test/play") {
    page = <TestPlayerPage uid={uid} route={path} />;
  } else if (resultMatch) {
    page = <TestResultPage uid={uid} route={path} attemptId={Number(resultMatch[1])} />;
  } else if (reviewMatch) {
    page = <TestReviewPage uid={uid} route={path} attemptId={Number(reviewMatch[1])} />;
  } else if (sessionMatch && sessionMatch[2]) {
    page = <RevisionSessionResultPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
  } else if (sessionMatch) {
    page = <RevisionSessionPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
  } else if (path.startsWith("#/revision/bank")) {
    page = <RevisionBankPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/weak-topics")) {
    page = <WeakTopicsPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/progress")) {
    page = <ProgressPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/profile")) {
    page = <RevisionProfilePage uid={uid} route={path} userName={userName} />;
  } else {
    page = <DashboardPage uid={uid} route={path} userName={userName} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 sm:py-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-xl shadow-slate-200 sm:h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:border sm:border-slate-200">
        <ExitGuardProvider onNavigate={(href) => { window.location.hash = href; }}>
          <StoreHeader
            cartCount={cartIds.size}
            notifCount={1}
            onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
            onNavigateToCart={() => { window.location.hash = "#/cart"; }}
            onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
          />
          {revisionAccessLoading ? (
            <div data-revision-access-loading className="grid min-h-0 flex-1 place-items-center bg-white">
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-violet-500" />
                <p className="text-xs font-semibold">Checking your membership…</p>
              </div>
            </div>
          ) : hasRevisionAccess ? (
            <Fragment key={syncKey}>{page}</Fragment>
          ) : (
            <RevisionLockScreen userName={userName} />
          )}
        </ExitGuardProvider>
      </div>
    </div>
  );
}
