import { Component, type ErrorInfo, type ReactNode } from "react";
import { Library, RefreshCw, ArrowLeft, Home } from "lucide-react";
import { GlassSurface } from "../components/ui/glass";
import { GlassButton } from "../components/ui/glass-button";

/**
 * Error boundary for the My Study Library route.
 *
 * This app is hash-routed through a single React root: a render error in any
 * route unmounts the whole tree and the learner is left staring at a bare,
 * dark canvas with dead navigation (the same failure mode FlowPath hit and
 * fixed in PR #521). Without a boundary around the library route, ANY future
 * crash in the library tree — a malformed snapshot from the shared serverless
 * function, a legacy Firestore row, a vendor component edge case — reproduces
 * exactly the reported "Study Library opens to a black screen and we can't
 * navigate away" symptom.
 *
 * With this boundary, a crash is contained to the Study Library subtree: the
 * user gets a readable recovery screen with working Retry / Go back /
 * Go to Home actions, and the boundary resets whenever the URL hash changes
 * so navigating away and back starts clean.
 */

interface StudyLibraryErrorBoundaryProps {
  children: ReactNode;
}

interface StudyLibraryErrorBoundaryState {
  error: Error | null;
}

const HOME_HASH = "#/home";

export class StudyLibraryErrorBoundary extends Component<
  StudyLibraryErrorBoundaryProps,
  StudyLibraryErrorBoundaryState
> {
  state: StudyLibraryErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StudyLibraryErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the crash visible in the console for debugging; the UI stays
    // interactive for the user.
    console.error("[study-library] render error caught by boundary", error, info?.componentStack);
  }

  componentDidMount() {
    // A route change is a natural reset: the next visit starts fresh instead
    // of re-showing an old crash screen.
    window.addEventListener("hashchange", this.handleHashChange);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.handleHashChange);
  }

  private handleHashChange = () => {
    if (this.state.error) this.setState({ error: null });
  };

  private handleRetry = () => {
    // A render crash can be caused by a snapshot already sitting in state /
    // the in-memory cache; re-rendering the children would reuse that same
    // snapshot and crash again. A reload boots the app fresh: the session is
    // restored, the in-memory library cache is empty, and the page fetches the
    // snapshot from the server again — a real recovery for a transient or
    // malformed snapshot (and an honest retry loop only if the server itself
    // keeps sending broken data, which the page's own error card then reports).
    this.setState({ error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.hash = HOME_HASH;
  };

  private handleGoBack = () => {
    this.setState({ error: null });
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = HOME_HASH;
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        className="grid min-h-[100dvh] place-items-center px-6 text-center text-white"
        data-study-library-error=""
      >
        <GlassSurface radius={24} className="w-full max-w-sm" contentClassName="p-6">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/25">
            <Library size={26} />
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight">
            Your study library hit a snag
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Something went wrong while drawing your library. Your data is safe —
            retry below, go back, or head to the home page.
          </p>
          <p className="mt-3 break-words rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/50">
            {error.message || "Unknown error"}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-500"
            >
              <RefreshCw size={15} /> Try again
            </button>
            <div className="flex gap-2">
              <GlassButton
                variant="capsule"
                onClick={this.handleGoBack}
                className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4"
              >
                <ArrowLeft size={14} /> Go back
              </GlassButton>
              <GlassButton
                variant="capsule"
                onClick={this.handleGoHome}
                className="flex-1 [&>span]:w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:rounded-full [&>span>div]:px-4"
              >
                <Home size={14} /> Go to Home
              </GlassButton>
            </div>
          </div>
        </GlassSurface>
      </main>
    );
  }
}
