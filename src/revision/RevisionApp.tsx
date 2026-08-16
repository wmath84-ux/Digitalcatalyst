import { useEffect, useState } from "react";
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
  const [route, setRoute] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const uid = user?.id ?? "guest";
  const userName = user?.name?.split(" ")[0] || "Learner";

  // Strip query params so deep links like #/revision?x=1 still route.
  const path = route.split("?")[0];

  let page: React.ReactNode;
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
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white shadow-xl shadow-slate-200 sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200">
        <ExitGuardProvider onNavigate={(href) => { window.location.hash = href; }}>
          <StoreHeader
            cartCount={cartIds.size}
            notifCount={1}
            onNavigateToSubscription={() => { window.location.hash = "#/subscription"; }}
            onNavigateToCart={() => { window.location.hash = "#/cart"; }}
            onNavigateToNotifications={() => { window.location.hash = "#/notifications"; }}
          />
          {page}
        </ExitGuardProvider>
      </div>
    </div>
  );
}
