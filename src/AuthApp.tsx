import AuthForm from "./components/auth/AuthForm";

const readReturnDestination = () => {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const requested = params.get("return") || sessionStorage.getItem("authReturnHash") || "";
  if (requested.startsWith("#/") && !requested.startsWith("#/auth") && !requested.startsWith("#/admin")) return requested;
  return "#/store";
};

export default function AuthApp() {
  const handleBack = () => {
    const destination = readReturnDestination();
    sessionStorage.removeItem("authReturnHash");
    window.location.hash = destination;
  };

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#05060f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl float-anim" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl float-anim" />

      <header className="relative z-20 shrink-0 border-b border-white/10 bg-[#05060f]/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-md items-center">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-slate-200 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            aria-label="Go back to the previous page"
          >
            <span aria-hidden className="text-lg">←</span>
            <span>Back</span>
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-6 sm:items-center sm:px-6 sm:py-10">
        <div className="w-full">
          <AuthForm />
        </div>
      </div>
    </main>
  );
}
