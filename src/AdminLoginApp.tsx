import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { APPROVED_ADMIN_EMAIL, createAdminSession } from "./utils/adminSession";

export default function AdminLoginApp() {
  const { user, loginAdmin, loginAdminWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // If a signed-in Firebase user is already the approved admin (email + role),
  // open the admin session and enter the dashboard automatically. This also
  // covers the Google redirect return path where onAuthStateChanged restores
  // the user but no session was created yet.
  useEffect(() => {
    if (!user) return;
    if (String(user.email || "").trim().toLowerCase() !== APPROVED_ADMIN_EMAIL || user.role !== "admin") return;
    createAdminSession(user.id, user.email);
    window.location.hash = "#/admin";
  }, [user]);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || !password) { setError("Enter the approved admin email and password."); return; }
    setSubmitting(true);
    try {
      const result = await loginAdmin(email, password);
      if (!result.success) { setError(result.message); return; }
      window.location.hash = "#/admin";
    } finally { setSubmitting(false); }
  };

  const submitGoogle = async () => {
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const result = await loginAdminWithGoogle();
      if (!result.success) { setError(result.message); return; }
      window.location.hash = "#/admin";
    } finally { setSubmitting(false); }
  };

  const sendReset = async () => {
    setError("");
    setInfo("");
    const target = email.trim() || APPROVED_ADMIN_EMAIL;
    setResetting(true);
    try {
      const result = await resetPassword(target);
      if (!result.success) { setError(result.message); return; }
      setInfo(result.message);
    } finally {
      setResetting(false);
    }
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-[#05060f] px-4 py-8 text-white">
    <button onClick={() => { window.location.hash = "#/landing"; }} className="absolute left-4 top-4 flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300"><ArrowLeft size={15} /> Landing</button>
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-950"><LockKeyhole size={22} /></div>
      <p className="mt-5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><ShieldCheck size={13} /> Session-only access</p>
      <h1 className="mt-2 text-2xl font-black">Open dashboard</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Sign in as <span className="text-slate-200">wmath84@gmail.com</span> with an <span className="text-slate-200">admin</span> role. No password needed — use Google.</p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => void submitGoogle()}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.66l-3.57-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.82 6.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
          )}
          {submitting ? "Connecting…" : "Continue with Google"}
        </button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">or email + password</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={submitPassword} className="space-y-4">
        <label className="block"><span className="text-xs font-bold text-slate-400">Admin email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-400" placeholder="Approved admin email" /></label>
        <label className="block"><span className="text-xs font-bold text-slate-400">Password</span><span className="relative mt-1.5 block"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-violet-400" placeholder="Firebase password (optional)" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">{error}</div>}
        {info && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">{info}</div>}
        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3.5 text-sm font-black text-white ring-1 ring-white/15 disabled:opacity-60">{submitting && <LoaderCircle size={17} className="animate-spin" />}{submitting ? "Verifying…" : "Log in with password"}</button>
        <button type="button" disabled={resetting} onClick={() => void sendReset()} className="w-full text-center text-xs font-bold text-violet-300 disabled:opacity-60">{resetting ? "Sending reset link…" : "Reset Firebase password"}</button>
      </form>
      <p className="mt-5 text-center text-[10px] leading-5 text-slate-500">Use #/admin-login. Google sign-in is the most secure — it verifies you own wmath84@gmail.com without a remembered password. Dashboard access is not remembered after this session closes.</p>
    </section>
  </main>;
}
