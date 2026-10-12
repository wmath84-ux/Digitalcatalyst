"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Mail, Phone, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { hasNativeGoogleAuth, isCapacitorNative, isEmbeddedWebView, warmNativeGoogleAuth } from "@/utils/nativeRuntime";
import { resolveAuthSuccessDestination } from "@/utils/appRoutes";

import "./auth-reference.css";

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
  const [remember, setRemember] = useState(true);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
  }, []);
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
    navigationTimer.current = setTimeout(() => {
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
        ? await signup({ name: name.trim(), email: normalizedEmail, mobile: normalizedMobile, password, remember })
        : await login(normalizedEmail, password, remember);

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
    } catch {
      setError("Could not finish. Please check your connection and try again.");
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
      const result = await loginWithGoogle(remember);
      if (!result.success) {
        setError(result.message);
        return;
      }
      completeSuccess(result.message, "#/store");
    } catch {
      setError("Google sign-in could not finish. Please try again.");
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
    } catch {
      setError("Could not finish. Please check your connection and try again.");
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
    <form className="dc-auth-form" onSubmit={handleSubmit} aria-label={mode === "login" ? "Sign in" : "Sign up"} aria-busy={busy}>
      {mode === "signup" && <>
        <label className="dc-auth-label" htmlFor="auth-name">Name</label>
        <div className="dc-auth-input-form">
          <User size={20} aria-hidden="true" />
          <input id="auth-name" name="name" autoComplete="name" placeholder="Enter your Name" value={name} onChange={e => setName(e.target.value)} required minLength={2} disabled={busy} />
        </div>
        <label className="dc-auth-label" htmlFor="auth-mobile">Mobile</label>
        <div className="dc-auth-input-form">
          <Phone size={20} aria-hidden="true" />
          <input id="auth-mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="Enter your Mobile Number" value={mobile} onChange={e => setMobile(e.target.value)} required disabled={busy} />
        </div>
      </>}
      <label className="dc-auth-label" htmlFor="auth-email">Email</label>
      <div className="dc-auth-input-form">
        <Mail size={20} aria-hidden="true" />
        <input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="Enter your Email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
      </div>
      <label className="dc-auth-label" htmlFor="auth-password">Password</label>
      <div className="dc-auth-input-form">
        <Lock size={20} aria-hidden="true" />
        <input id="auth-password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="Enter your Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} disabled={busy} />
        <button type="button" className="dc-auth-eye" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <div className="dc-auth-row dc-auth-options">
        <label className="dc-auth-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} disabled={busy} />Remember me</label>
        {mode === "login" && <button type="button" className="dc-auth-link" onClick={handleForgotPassword} disabled={busy}>Forgot password?</button>}
      </div>
      {error && <p role="alert" className="dc-auth-message dc-auth-error">{error}</p>}
      {signupNotice && <p role="status" className="dc-auth-message">{signupNotice}</p>}
      {success && <p role="status" className="dc-auth-message dc-auth-success">{success}</p>}
      {googleNotice && !error && <p role="alert" className="dc-auth-message">Sign-in did not finish. Please try Google again or use email.</p>}
      <button className="dc-auth-submit" type="submit" disabled={busy}>{submitting ? "Please wait…" : mode === "login" ? "Sign In" : "Sign Up"}</button>
      <p className="dc-auth-copy">
        {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
        <button type="button" className="dc-auth-link" disabled={busy} onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Sign Up" : "Sign In"}</button>
      </p>
      <p className="dc-auth-copy">Or With</p>
      <div className="dc-auth-row">
        <button type="button" className="dc-auth-social" data-auth-google data-highlight={highlightGoogle || undefined} onClick={handleGoogleLogin} disabled={busy || googleBlocked}>
          <GoogleIcon />{googleBusy ? "Connecting…" : "Google"}
        </button>
      </div>
      {googleBlocked && <p className="dc-auth-message">Open this page in your browser to use Google, or sign in with email.</p>}
    </form>
  );
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.66l-3.57-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.82 6.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
  </svg>;
}
