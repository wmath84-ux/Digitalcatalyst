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
    <main className="relative flex min-h-[100dvh] w-full items-start justify-center overflow-hidden bg-[#05060f] px-4 pb-8 pt-[calc(env(safe-area-inset-top)+5.5rem)] sm:items-center sm:px-6 sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl float-anim" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl float-anim" />

      <button
        type="button"
        onClick={handleBack}
        className="fixed left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-[100] inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-[#111321]/95 px-4 py-2 text-sm font-bold text-white shadow-xl shadow-black/30 backdrop-blur-xl transition hover:bg-[#191c2e] focus:outline-none focus:ring-2 focus:ring-violet-400 sm:left-6"
        aria-label="Go back to the previous page"
      >
        <span aria-hidden>←</span>
        <span>Back</span>
      </button>

      <div className="relative z-10 w-full">
        <AuthForm />
      </div>
    </main>
  );
}
