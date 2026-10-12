import { useCallback, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
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
    <main className="dc-auth-page" data-auth-page>
      <button type="button" onClick={leaveAuthSafely} data-auth-back className="dc-auth-back" aria-label="Go back to the previous page">
        <ArrowLeft size={18} aria-hidden="true" /><span>Back</span>
      </button>
      <AuthForm />
    </main>
  );
}
