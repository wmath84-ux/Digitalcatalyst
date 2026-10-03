import { useCallback, useEffect } from "react";
import { ArrowLeft, BookOpen, ShieldCheck, Sparkles, Star, Zap } from "lucide-react";
import AuthForm from "./components/auth/AuthForm";
import BrandMark from "./components/BrandMark";
import { useBranding } from "./context/BrandingContext";
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
  const { appName } = useBranding();

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
    <main className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden text-white">
      {/* Top Header with Safe Area support */}
      <header className="relative z-20 shrink-0 border-b border-white/10 bg-slate-950/70 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <button
            type="button"
            onClick={leaveAuthSafely}
            data-auth-back
            className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition hover:border-white/30 hover:bg-white/[0.14] active:scale-95"
            aria-label="Go back to the previous page"
          >
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <BrandMark className="h-7 w-7 rounded-lg" fallbackLetter />
              <span className="text-sm font-bold tracking-tight text-white">{appName}</span>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>256-Bit SSL</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">
            {/* Desktop Left Showcase - Eliminates vast void on desktop with purposeful content */}
            <section className="hidden flex-col justify-center space-y-6 pr-4 lg:col-span-6 lg:flex xl:col-span-7 xl:pr-8">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span>Learner Workspace</span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight xl:text-4xl">
                  Smarter study tools, focused practice & verified progress.
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-white/60 xl:text-base">
                  Access your personalized revision sets, test your knowledge with adaptive MCQs, and sync study notes securely across all devices.
                </p>
              </div>

              {/* Minimal feature cards: Solid cards with subtle borders */}
              <div className="grid max-w-lg grid-cols-1 gap-3 pt-1">
                <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.07]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">Adaptive Practice</h2>
                    <p className="text-xs text-white/55">Concept quizzes and active recall flashcard sets.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.07]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                    <Zap className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">Instant Cloud Sync</h2>
                    <p className="text-xs text-white/55">Seamless continuity between mobile and desktop devices.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 backdrop-blur-md transition hover:border-white/20 hover:bg-white/[0.07]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">Firebase Security</h2>
                    <p className="text-xs text-white/55">Direct bank-grade authentication with private account isolation.</p>
                  </div>
                </div>
              </div>

              {/* Social Proof strip */}
              <div className="flex items-center gap-3.5 pt-2">
                <div className="flex -space-x-2">
                  {["A", "P", "R", "S"].map((initial, idx) => (
                    <span
                      key={idx}
                      className="inline-grid h-8 w-8 place-items-center rounded-full border-2 border-slate-900 bg-gradient-to-tr from-indigo-600 to-cyan-500 text-[11px] font-bold text-white shadow"
                    >
                      {initial}
                    </span>
                  ))}
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-1 text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                    ))}
                    <span className="ml-1 font-bold text-white">4.9/5</span>
                  </div>
                  <span className="text-[11px] text-white/50">Trusted by 10,000+ active learners</span>
                </div>
              </div>
            </section>

            {/* Right Auth Card Column */}
            <div className="col-span-12 flex flex-col items-center justify-center lg:col-span-6 xl:col-span-5">
              <AuthForm />

              {/* Mobile / Tablet Trust badges */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-white/50 lg:hidden">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  ⚡ Instant Access
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  🔒 Firebase Secured
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                  📱 Multi-Device Sync
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin dashboard hint button (Preserved for test contracts) */}
      <footer className="relative z-10 shrink-0 pb-6 pt-2 text-center">
        <button
          type="button"
          onClick={() => { window.location.hash = "#/admin-login"; }}
          className="mx-auto block text-[9px] font-medium tracking-wide text-white/55 transition hover:text-white/85"
        >Open dashboard</button>
      </footer>
    </main>
  );
}
