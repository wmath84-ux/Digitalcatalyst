import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/auth/AuthForm";

export default function AuthPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05060f] px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl float-anim" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl float-anim" />

      <Link
        href="/"
        className="glass-panel absolute left-6 top-6 rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 transition hover:text-white"
      >
        ← Back to Landing
      </Link>

      <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
        <AuthForm />
      </Suspense>
    </main>
  );
}
