import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error boundary for the FlowPath route.
 *
 * Before this boundary existed, any render error inside the FlowPath
 * tree (e.g. a Firestore doc of an unmodelled kind) unmounted the
 * whole React root: the page went white and — because the app is
 * hash-routed through that same tree — every navigation (Home button,
 * browser Back) was dead too. The user was stuck.
 *
 * With the boundary in place, a crash is contained to the FlowPath
 * subtree: the user gets a readable recovery screen with working
 * Retry / Go back / Go home actions. The boundary also resets itself
 * whenever the URL hash changes, so navigating away and back starts
 * clean.
 */

interface FlowPathErrorBoundaryProps {
  children: ReactNode;
}

interface FlowPathErrorBoundaryState {
  error: Error | null;
}

const HOME_HASH = "#/home";

export class FlowPathErrorBoundary extends Component<
  FlowPathErrorBoundaryProps,
  FlowPathErrorBoundaryState
> {
  state: FlowPathErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FlowPathErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the crash visible in the console for debugging; the UI
    // stays interactive for the user.
    console.error("[flowpath] render error caught by boundary", error, info?.componentStack);
  }

  componentDidMount() {
    // Reset the error state whenever the route changes so a later
    // visit to FlowPath starts fresh instead of re-showing an old
    // crash screen.
    window.addEventListener("hashchange", this.handleHashChange);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.handleHashChange);
  }

  private handleHashChange = () => {
    if (this.state.error) this.setState({ error: null });
  };

  private handleRetry = () => {
    this.setState({ error: null });
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
      <main className="flowpath-error-screen grid min-h-[100dvh] place-items-center bg-[var(--fp-bg-0)] px-6 text-center">
        <div className="w-full max-w-sm">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 text-2xl">
            🌀
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight text-fp-text">
            FlowPath hit a snag
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-fp-muted">
            Something went wrong while drawing your flow. Your data is safe —
            retry below or head back to the home page.
          </p>
          <p className="mt-3 break-words rounded-lg border border-fp-text-15 bg-fp-text-5 px-3 py-2 text-[11px] text-fp-muted">
            {error.message || "Unknown error"}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(139,123,255,0.85)] transition hover:brightness-110"
            >
              Try again
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={this.handleGoBack}
                className="flex-1 rounded-xl border border-fp-border bg-fp-surface px-4 py-2.5 text-sm font-medium text-fp-muted transition hover:bg-fp-surface-hover hover:text-fp-text"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 rounded-xl border border-fp-border bg-fp-surface px-4 py-2.5 text-sm font-medium text-fp-muted transition hover:bg-fp-surface-hover hover:text-fp-text"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }
}
