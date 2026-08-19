import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
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
import PremiumGate from "../components/subscription/PremiumGate";

/**
 * Daily Test & Revision feature shell – updated flow:
 * - Dashboard / Bank / Weak Topics / Progress / Profile are ALWAYS visible
 *   even without a subscription (so user can explore the product)
 * - Subscription gate appears ONLY when the user tries to DO an activity:
 *   Start test, Start revision session, Revise Now, Continue test etc.
 * - Direct deep-link to a protected player (#/revision/test/play or
 *   #/revision/session/:id) also triggers the gate and redirects back to
 *   dashboard instead of hard-locking the whole feature.
 */

export default function RevisionApp() {
  const { user } = useAuth();
  const { cartIds } = useCommerce();
  const { hasAccess: hasRevisionAccess, loading: revisionAccessLoading } = useRevisionAccess();
  const [route, setRoute] = useState(() => window.location.hash);
  const [syncKey, setSyncKey] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const uid = user?.id ?? "guest";
  const userName = user?.name?.split(" ")[0] || "Learner";

  useEffect(() => {
    let cancelled = false;
    void syncRevisionCatalog(uid).then((changed) => {
      if (!cancelled && changed) setSyncKey((k) => k + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const requireAccess = useCallback(() => {
    if (hasRevisionAccess) return true;
    setGateOpen(true);
    return false;
  }, [hasRevisionAccess]);

  // Strip query params so deep links like #/revision?x=1 still route.
  const path = route.split("?")[0];

  const sessionMatch = path.match(/^#\/revision\/session\/(\d+)(\/result)?$/);
  const resultMatch = path.match(/^#\/revision\/test\/result\/(\d+)$/);
  const reviewMatch = path.match(/^#\/revision\/test\/review\/(\d+)$/);

  const isPlayAttempt = path === "#/revision/test/play";
  const isSessionPlayAttempt = Boolean(sessionMatch && !sessionMatch[2]); // /session/:id (without /result)

  // If user directly lands on a protected player without access, intercept:
  // show gate and bounce to dashboard after a tick.
  useEffect(() => {
    if (revisionAccessLoading) return;
    if (!hasRevisionAccess && (isPlayAttempt || isSessionPlayAttempt)) {
      setGateOpen(true);
      // Keep URL clean – push user back to dashboard after gate opens
      // so back button does not loop on protected route.
      if (window.location.hash !== "#/revision") {
        window.location.hash = "#/revision";
      }
    }
  }, [revisionAccessLoading, hasRevisionAccess, isPlayAttempt, isSessionPlayAttempt, path]);

  let page: ReactNode;

  if (path === "#/revision/test/play") {
    // If no access, still render dashboard (gate will overlay)
    if (!revisionAccessLoading && !hasRevisionAccess) {
      page = (
        <DashboardPage
          uid={uid}
          route={"#/revision"}
          userName={userName}
          hasAccess={hasRevisionAccess}
          onRequireAccess={requireAccess}
        />
      );
    } else {
      page = <TestPlayerPage uid={uid} route={path} />;
    }
  } else if (resultMatch) {
    page = <TestResultPage uid={uid} route={path} attemptId={Number(resultMatch[1])} />;
  } else if (reviewMatch) {
    page = <TestReviewPage uid={uid} route={path} attemptId={Number(reviewMatch[1])} />;
  } else if (sessionMatch && sessionMatch[2]) {
    page = <RevisionSessionResultPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
  } else if (sessionMatch) {
    if (!revisionAccessLoading && !hasRevisionAccess) {
      page = (
        <RevisionBankPage
          uid={uid}
          route={"#/revision/bank"}
          hasAccess={hasRevisionAccess}
          onRequireAccess={requireAccess}
        />
      );
    } else {
      page = <RevisionSessionPage uid={uid} route={path} sessionId={Number(sessionMatch[1])} />;
    }
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
    page = (
      <WeakTopicsPage
        uid={uid}
        route={path}
        hasAccess={hasRevisionAccess}
        onRequireAccess={requireAccess}
      />
    );
  } else if (path.startsWith("#/revision/progress")) {
    page = <ProgressPage uid={uid} route={path} />;
  } else if (path.startsWith("#/revision/profile")) {
    page = <RevisionProfilePage uid={uid} route={path} userName={userName} />;
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
          ) : (
            <Fragment key={syncKey}>{page}</Fragment>
          )}
        </ExitGuardProvider>

        {/* Subscription gate that appears ONLY on activity attempt */}
        <PremiumGate
          variant="revision"
          userName={userName}
          open={gateOpen}
          onClose={() => setGateOpen(false)}
          onViewSubscription={() => {
            setGateOpen(false);
            window.location.hash = "#/subscription";
          }}
        />
      </div>
    </div>
  );
}
