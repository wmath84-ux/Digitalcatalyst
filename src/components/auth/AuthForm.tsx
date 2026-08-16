"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Mode = "login" | "signup";

const readAuthParams = () =>
  new URLSearchParams(typeof window === "undefined" ? "" : window.location.hash.split("?")[1] || "");

const destinationAfterAuth = (fallback = "#/store") => {
  const returnTo = readAuthParams().get("return");
  return returnTo && returnTo.startsWith("#/") ? returnTo : fallback;
};

export default function AuthForm() {
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
  const { login, signup, loginWithGoogle, resetPassword } = useAuth();

  const clearMessages = () => {
    setError(null);
    setSignupNotice(null);
    setSuccess(null);
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
        return;
      }
      completeSuccess(result.message, "#/store");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessages();
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

  const busy = submitting || googleSubmitting;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-panel mx-auto w-full max-w-md rounded-3xl p-6 shadow-2xl shadow-black/40 sm:p-8"
    >
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-lg font-black text-white">
          E
        </span>
        <div>
          <span className="block text-lg font-bold text-white">Eduvora</span>
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <ShieldCheck size={12} /> Secured by Firebase
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 rounded-2xl bg-white/5 p-1">
        {(["login", "signup"] as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => changeMode(item)}
            disabled={busy}
            className={`rounded-xl py-2 text-sm font-semibold capitalize transition ${
              mode === item
                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {item === "signup" ? "Sign Up" : item}
          </button>
        ))}
      </div>

      <h1 className="text-2xl font-black text-white">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        {mode === "login"
          ? "Log in securely and continue your Eduvora journey."
          : "Create your Firebase-secured learner account."}
      </p>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {googleSubmitting ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.66l-3.57-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83Z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.82 6.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
          </svg>
        )}
        {googleSubmitting ? "Google से connect हो रहा है…" : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">or continue with email</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {mode === "signup" && (
            <motion.div
              key="signup-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Full Name</label>
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Mobile Number</label>
                <div className="flex overflow-hidden rounded-xl border border-white/10 bg-white/5 focus-within:border-violet-400">
                  <span className="grid place-items-center border-r border-white/10 px-3 text-sm font-semibold text-slate-400">+91</span>
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="tel"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10 digit number"
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white placeholder-slate-500 outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-violet-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <div className="relative">
            <input
              required
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              minLength={6}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-white placeholder-slate-500 outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {mode !== "signup" && (
          <div className="text-right">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              className="text-xs font-semibold text-cyan-300 transition hover:text-cyan-200 disabled:opacity-60"
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <p>{error}</p>
            {mode === "login" && (
              <button type="button" onClick={() => { setMode("signup"); setPassword(""); setError(null); setSignupNotice("नए user हैं? पहले Sign Up करके अपना account बनाएं।"); }} className="mt-2 font-black text-white underline underline-offset-2">New user? Sign Up करें</button>
            )}
          </div>
        )}
        {signupNotice && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} role="status" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold leading-5 text-cyan-100">
            {signupNotice}
          </motion.div>
        )}
        {success && (
          <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        )}

        <motion.button
          whileHover={{ scale: busy ? 1 : 1.02 }}
          whileTap={{ scale: busy ? 1 : 0.98 }}
          type="submit"
          disabled={busy}
          className="pulse-glow w-full rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 py-3.5 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30 transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-slate-500">
        Firebase securely manages your credentials and persistent login session. Your password is never stored in this app.
      </p>

      <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
        By continuing you agree to our{" "}
        <a href="/terms-of-service.html" className="font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy-policy.html" className="font-semibold text-slate-300 underline-offset-2 hover:text-white hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </motion.div>
  );
}
