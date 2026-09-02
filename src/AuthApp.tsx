import { useCallback, useEffect } from "react";
import { GlassButton } from "./components/ui/glass-button";
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
      {/* Wave 12: no grid wash / aurora blobs — only the shared backdrop shows
          through; the top bar is the chrome-glass material (pack GlassSurface
          dark at tint 0.5) and Back is a pack GlassButton capsule. */}
      <header className="relative z-20 shrink-0 border-b border-white/10 bg-[var(--dc-chrome-glass)] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] [backdrop-filter:var(--dc-chrome-glass-blur)] sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center">
          <GlassButton
            variant="capsule"
            type="button"
            onClick={leaveAuthSafely}
            data-auth-back
            className="[&>span>div]:h-10 [&>span>div]:px-3 [&>span>div]:font-bold"
            aria-label="Go back to the previous page"
          >
            <span className="inline-flex items-center gap-2"><span aria-hidden className="text-lg">←</span><span>Back</span></span>
          </GlassButton>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-6 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full">
          <AuthForm />
        </div>
      </div>
      <button type="button" onClick={() => { window.location.hash = "#/admin-login"; }} className="mx-auto mt-7 block text-[9px] font-medium tracking-wide text-white/85 transition hover:text-white/55">Open dashboard</button>
    </main>
  );
}
