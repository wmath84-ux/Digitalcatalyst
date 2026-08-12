import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { hasAdminSession } from "./utils/adminSession";

export default function AdminLoginApp() {
  const { user, loginAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && hasAdminSession(user.id, user.email, user.role)) window.location.hash = "#/admin";
  }, [user]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Enter the approved admin email and password."); return; }
    setSubmitting(true);
    try {
      const result = await loginAdmin(email, password);
      if (!result.success) { setError(result.message); return; }
      window.location.hash = "#/admin";
    } finally { setSubmitting(false); }
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-[#05060f] px-4 py-8 text-white">
    <button onClick={() => { window.location.hash = "#/landing"; }} className="absolute left-4 top-4 flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-300"><ArrowLeft size={15} /> Landing</button>
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-950"><LockKeyhole size={22} /></div>
      <p className="mt-5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><ShieldCheck size={13} /> Session-only access</p>
      <h1 className="mt-2 text-2xl font-black">Open dashboard</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">A fresh Firebase email/password verification is required for this browser session.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block"><span className="text-xs font-bold text-slate-400">Admin email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-violet-400" placeholder="Approved admin email" /></label>
        <label className="block"><span className="text-xs font-bold text-slate-400">Password</span><span className="relative mt-1.5 block"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-violet-400" placeholder="Firebase password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">{error}</div>}
        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-black text-slate-950 disabled:opacity-60">{submitting && <LoaderCircle size={17} className="animate-spin" />}{submitting ? "Verifying…" : "Log in to dashboard"}</button>
      </form>
      <p className="mt-5 text-center text-[10px] leading-5 text-slate-500">Dashboard access is not remembered after this browser/app session closes.</p>
    </section>
  </main>;
}
