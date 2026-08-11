import AuthForm from "./components/auth/AuthForm";

export default function AuthApp() {
  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#05060f] px-4 py-8 sm:px-6 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl float-anim" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl float-anim" />

      <button
        type="button"
        onClick={() => window.history.back()}
        className="glass-panel absolute left-4 top-4 z-10 rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 transition hover:text-white sm:left-6 sm:top-6"
      >
        ← Back
      </button>

      <div className="relative z-10 w-full">
        <AuthForm />
      </div>
    </main>
  );
}
