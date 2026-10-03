"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBranding } from "@/context/BrandingContext";
import BrandMark from "@/components/BrandMark";
import { hasNativeGoogleAuth, isCapacitorNative, isEmbeddedWebView, warmNativeGoogleAuth } from "@/utils/nativeRuntime";
import { resolveAuthSuccessDestination } from "@/utils/appRoutes";

type Mode = "login" | "signup";

const readAuthParams = () =>
  new URLSearchParams(typeof window === "undefined" ? "" : window.location.hash.split("?")[1] || "");

/**
 * One shared answer for "where does a successful login land?" — the `?return=`
 * on this hash, then the route the auth guard parked in sessionStorage, then
 * the store. (`resolveAuthSuccessDestination` is the same helper the app shell
 * uses when a Google redirect signs the learner in without this form being
 * involved, so the two can never disagree.)
 */
const destinationAfterAuth = (fallback = "#/store") =>
  resolveAuthSuccessDestination(
    typeof window === "undefined" ? "" : window.location.hash,
    typeof window === "undefined" ? null : window.sessionStorage,
    fallback,
  );

export default function AuthForm() {
  const { appName } = useBranding();
  const [mode, setMode] = useState<Mode>(() =>
    readAuthParams().get("mode") === "signup" ? "signup" : "login",
  );
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [highlightGoogle, setHighlightGoogle] = useState(false);
  const { login, signup, loginWithGoogle, resetPassword, restoringSession, googleNotice, dismissGoogleNotice } = useAuth();

  // Google sign-in cannot complete inside an embedded WebView unless a native
  // plugin takes over — Google's Secure Browser Policy blocks the OAuth page
  // there. This guard is therefore ONLY for other apps' in-app browsers
  // (Instagram / Facebook / Line), where no native fallback exists.
  //
  // Inside the Capacitor shell the button must stay live: `loginWithGoogle()`
  // always takes the native Play Services path there, and `hasNativeGoogleAuth()`
  // can still read FALSE on a cold screen because the plugin's JS module — the
  // thing that registers the proxy on `Capacitor.Plugins` — is imported lazily.
  // Greying the button out on that reading is exactly what made the APK show
  // "Google sign-in उपलब्ध नहीं है" and never open the account picker at all.
  // See src/utils/nativeRuntime.ts.
  const [insideApp] = useState(() => isCapacitorNative());
  const [googleBlocked, setGoogleBlocked] = useState(
    () => !isCapacitorNative() && isEmbeddedWebView() && !hasNativeGoogleAuth(),
  );

  useEffect(() => {
    if (!insideApp) return;
    setGoogleBlocked(false);
    // Register the native plugin proxy now so the first tap goes straight to
    // the Play Services account picker instead of waiting on the import.
    void warmNativeGoogleAuth();
  }, [insideApp]);

  const clearMessages = () => {
    setError(null);
    setSignupNotice(null);
    setSuccess(null);
    setHighlightGoogle(false);
  };

  const completeSuccess = (message: string, fallback?: string) => {
    setSuccess(message);
    window.setTimeout(() => {
      const destination = destinationAfterAuth(fallback);
      sessionStorage.removeItem("authReturnHash");
      window.location.hash = destination;
    }, 350);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobile.replace(/\D/g, "").slice(-10);
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("कृपया valid email address डालें।");
      return;
    }
    if (password.length < 6) {
      setError("Password कम से कम 6 characters का होना चाहिए।");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      setError("कृपया अपना पूरा नाम डालें।");
      return;
    }
    if (mode === "signup" && normalizedMobile.length !== 10) {
      setError("कृपया valid 10 digit mobile number डालें।");
      return;
    }

    setSubmitting(true);
    try {
      const result = mode === "signup"
        ? await signup({ name: name.trim(), email: normalizedEmail, mobile: normalizedMobile, password })
        : await login(normalizedEmail, password);

      if (!result.success) {
        if (mode === "login" && result.code === "auth/user-not-found") {
          setMode("signup");
          setPassword("");
          setSignupNotice("इस email का account नहीं मिला। नए users को पहले Sign Up करना होगा — हमने Sign Up form खोल दिया है।");
          return;
        }
        setError(result.message);
        // A Google-created account has no password to check, so nudge the
        // learner straight at the button that will actually sign them in.
        if (result.code === "auth/google-only-account") setHighlightGoogle(true);
        return;
      }
      completeSuccess(result.message, "#/store");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessages();
    dismissGoogleNotice();
    // The redirect fallback navigates the tab away and never returns control,
    // so this only completes for the popup / native-picker paths.
    setGoogleSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        setError(result.message);
        return;
      }
      completeSuccess(result.message, "#/store");
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    clearMessages();
    // Reset uses whatever is in the email field, so tell the learner to fill
    // it in rather than firing a request that can only fail.
    if (!email.trim()) {
      setError("पहले ऊपर अपना email address डालें, फिर Forgot password दबाएँ।");
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetPassword(email);
      if (result.success) setSuccess(result.message);
      else setError(result.message);
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setPassword("");
    clearMessages();
  };

  const busy = submitting || googleSubmitting || restoringSession;
  // While the return leg of a Google redirect is being resolved the button
  // keeps its spinner: showing a normal, tappable "Continue with Google" for
  // that second is what made learners tap again and report a broken login.
  const googleBusy = googleSubmitting || restoringSession;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-[430px]"
    >
      {/* Balanced Card Container: Solid slate backdrop + subtle glass rim */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0c111e]/90 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
        {/* Subtle decorative ambient lights */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

        {/* Brand header on mobile/tablet */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 rounded-xl" fallbackLetter />
            <div>
              <span className="block text-base font-bold text-white leading-tight">{appName}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-emerald-300">
                <ShieldCheck size={12} /> Secured by Firebase
              </span>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/60">
            {mode === "login" ? "Sign In" : "Register"}
          </span>
        </div>

        {/* Segmented Mode Switcher */}
        <div
          className="mb-5 flex rounded-xl border border-white/[0.08] bg-black/40 p-1"
          role="tablist"
          aria-label="Log in or sign up"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            disabled={busy}
            onClick={() => { if (!busy) changeMode("login"); }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all sm:text-sm ${
              mode === "login"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-white/60 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Log In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            disabled={busy}
            onClick={() => { if (!busy) changeMode("signup"); }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all sm:text-sm ${
              mode === "signup"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-white/60 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Sign Up
          </button>
        </div>

        {/* Title */}
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white sm:text-2xl">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-xs text-white/55 sm:text-sm">
            {mode === "login"
              ? "Sign in to access your courses, quizzes, and synced notes."
              : "Create your free learner account to get started."}
          </p>
        </div>

        {/* Google Authentication Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={busy || googleBlocked}
          aria-disabled={googleBlocked}
          className="group relative flex w-full items-center justify-center gap-3 rounded-xl border border-white/20 bg-white px-4 py-2.5 font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:py-3"
          style={highlightGoogle ? { boxShadow: "0 0 0 2px rgba(66,133,244,0.85), 0 0 26px rgba(66,133,244,0.55)", borderRadius: 12 } : undefined}
        >
          {googleBusy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-900" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 sm:h-5 sm:w-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.66l-3.57-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.82 6.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
          )}
          <span className="text-xs font-bold text-slate-800 sm:text-sm">
            {googleBusy
              ? restoringSession
                ? "Google session wapas aa रहा है…"
                : "Google से connect हो रहा है…"
              : "Continue with Google"}
          </span>
        </button>

        {googleNotice && !googleBusy && (
          <div
            role="status"
            className="mt-3 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-100"
          >
            <p>{googleNotice}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white underline-offset-2 transition hover:bg-white/25"
              >
                Google से फिर कोशिश करें
              </button>
              <button
                type="button"
                onClick={dismissGoogleNotice}
                className="rounded-full px-3 py-1.5 text-[11px] font-bold text-amber-100/70 underline underline-offset-2 transition hover:text-amber-50"
              >
                ठीक है
              </button>
            </div>
          </div>
        )}

        {googleBlocked && (
          <p className="mt-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-100">
            यह in-app browser Google sign-in block करता है। ऊपर ⋮ menu से “Open in Chrome” चुनें, या नीचे email + password इस्तेमाल करें।
          </p>
        )}

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">or continue with email</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {/* Form fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <AnimatePresence initial={false} mode="popLayout">
            {mode === "signup" && (
              <motion.div
                key="signup-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3.5 overflow-hidden"
              >
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/70">
                    <User className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Full Name</span>
                  </label>
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your full name"
                    className="dc-field w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-indigo-400/80 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/70">
                    <Phone className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Mobile Number</span>
                  </label>
                  <div className="dc-field flex overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] transition focus-within:border-indigo-400/80 focus-within:bg-white/[0.08] focus-within:ring-2 focus-within:ring-indigo-500/20">
                    <span className="grid place-items-center border-r border-white/10 bg-white/[0.03] px-3 text-xs font-bold text-white/60">+91</span>
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="tel"
                      value={mobile}
                      onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10 digit number"
                      className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/70">
              <Mail className="h-3.5 w-3.5 text-indigo-400" />
              <span>Email</span>
            </label>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="dc-field w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-indigo-400/80 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/70">
              <Lock className="h-3.5 w-3.5 text-indigo-400" />
              <span>Password</span>
            </label>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                className="dc-field w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 pr-11 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-indigo-400/80 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode !== "signup" && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={busy}
                className="text-xs font-semibold text-indigo-400 underline underline-offset-2 transition hover:text-indigo-300 disabled:opacity-60"
              >
                {submitting ? "Reset link भेजा जा रहा है…" : "Forgot password? Reset link भेजें"}
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              <p>{error}</p>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setPassword("");
                    setError(null);
                    setSignupNotice("नए user हैं? पहले Sign Up करके अपना account बनाएं।");
                  }}
                  className="mt-2 block font-black text-white underline underline-offset-2"
                >
                  New user? Sign Up करें
                </button>
              )}
            </div>
          )}

          {signupNotice && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              role="status"
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-2.5 text-xs font-semibold leading-5 text-cyan-100"
            >
              {signupNotice}
            </motion.div>
          )}

          {success && (
            <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
              {success}
            </div>
          )}

          <motion.button
            whileHover={{ scale: busy ? 1 : 1.01 }}
            whileTap={{ scale: busy ? 1 : 0.99 }}
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Please wait…</span>
              </>
            ) : mode === "login" ? (
              "Log In"
            ) : (
              "Create Account"
            )}
          </motion.button>
        </form>

        {/* Security & Legal Footnote */}
        <div className="mt-5 space-y-2 border-t border-white/[0.08] pt-4 text-center">
          <p className="text-[11px] leading-relaxed text-white/50">
            Firebase securely manages your credentials and persistent login session. Your password is never stored in this app.
          </p>
          <p className="text-[11px] leading-relaxed text-white/50">
            By continuing you agree to our{" "}
            <a href="/terms-of-service.html" className="font-semibold text-indigo-300 underline underline-offset-2 hover:text-indigo-200">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy-policy.html" className="font-semibold text-indigo-300 underline underline-offset-2 hover:text-indigo-200">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </motion.div>
  );
}
