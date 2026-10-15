import { Component, type ErrorInfo, type ReactNode } from "react";

interface CoursePlayerErrorBoundaryProps {
  children: ReactNode;
  onBack: () => void;
}

interface CoursePlayerErrorBoundaryState {
  error: Error | null;
}

const HOME_HASH = "#/home";

/**
 * A crash in this single-root hash-routed app used to unmount the entire React
 * tree if the Course Player threw while rendering. Keep the failure local to
 * this route so the learner sees a useful recovery screen instead of a blank
 * page, and include the actual exception for diagnosis.
 */
export class CoursePlayerErrorBoundary extends Component<
  CoursePlayerErrorBoundaryProps,
  CoursePlayerErrorBoundaryState
> {
  state: CoursePlayerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): CoursePlayerErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[course-player] render error caught by boundary", error, info?.componentStack);
  }

  componentDidMount() {
    window.addEventListener("hashchange", this.handleHashChange);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.handleHashChange);
  }

  private handleHashChange = () => {
    if (this.state.error) this.setState({ error: null });
  };

  private handleRetry = () => {
    // A reload clears the failed render and any cached course snapshot that may
    // have triggered it, while restoring the learner's authenticated session.
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.hash = HOME_HASH;
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        className="fixed inset-0 z-[10000] grid min-h-[100dvh] place-items-center overflow-y-auto bg-white/70 px-5 py-8 text-slate-900 backdrop-blur-xl"
        data-course-player-error=""
      >
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-2xl" aria-hidden="true">
            !
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight" aria-live="assertive">Course Player hit a snag</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Something went wrong while opening this course. Your saved progress is safe.
            Reload to retry, or return to your purchases.
          </p>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">Technical details</summary>
            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">
              {error.message || "Unknown render error"}
            </pre>
          </details>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.handleRetry}
              className="min-h-11 flex-1 rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              Reload and retry
            </button>
            <button
              type="button"
              onClick={this.props.onBack}
              className="min-h-11 flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              Back to purchases
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="min-h-11 flex-1 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              Go to Home
            </button>
          </div>
        </section>
      </main>
    );
  }
}
