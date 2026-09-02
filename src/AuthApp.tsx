import { useCallback, useEffect } from "react";
import AuthForm from "./components/auth/AuthForm";
import { resolveBackDestination } from "./utils/routeHistory";

/**
 * The Back button returns the user to the page they actually came from.
 *
 * The app routes with hash navigation and the login screen can be reached
 * from anywhere (a protected deep link, the landing page, the header, the
 * subscription flow…), so a hard-coded destination was wrong: it sent
 * first-time visitors to the store instead of back where they were, and
 * protected destinations bounced straight back into the login screen.
 * `resolveBackDestination` reads the in-app route history recorded by the
 * app shell and skips protected routes, so Back always lands somewhere
 * usable — and the final fallback is the public home page.
 */
export default function AuthApp() {
  const leaveAuthSafely = useCallback(() => {
    // The user abandoned the pending auth flow — drop the remembered
    // return route so a later login doesn't resurrect it.
    sessionStorage.removeItem("authReturnHash");
    const destination = resolveBackDestination(window.sessionStorage);
    window.location.hash = destination;
  }, []);

  useEffect(() => {
    // Android's system Back button closes a standalone PWA when the auth page
    // is the first/only browser-history entry. Add a same-URL guard entry so
    // that hardware/system Back produces a popstate we can convert into the
    // same safe in-app navigation as the visible Back button.
    window.history.pushState({ ...(window.history.state || {}), eduvoraAuthBackGuard: true }, "", window.location.href);

    const handleSystemBack = () => {
      if (!window.location.hash.startsWith("#/auth")) return;
      leaveAuthSafely();
    };

    window.addEventListener("popstate", handleSystemBack);
    return () => window.removeEventListener("popstate", handleSystemBack);
  }, [leaveAuthSafely]);

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl float-anim" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl float-anim" />

      <header className="relative z-20 shrink-0 border-b border-white/10 bg-[#0a0c12]/60 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center">
          <button
            type="button"
            onClick={leaveAuthSafely}
            data-auth-back
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-slate-200 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            aria-label="Go back to the previous page"
          >
            <span aria-hidden className="text-lg">←</span>
            <span>Back</span>
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-6 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full">
          <AuthForm />
        </div>
      </div>
      <button type="button" onClick={() => { window.location.hash = "#/admin-login"; }} className="mx-auto mt-7 block text-[9px] font-medium tracking-wide text-slate-700 transition hover:text-slate-500">Open dashboard</button>
    </main>
  );
}
