import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error boundary for the 3D Study Sanctuary route.
 *
 * Before this boundary existed, ANY render error inside the Sanctuary tree
 * (a WebGL hiccup surfaced through React, a transient null on a board panel,
 * a bad state transition when the Settings overlay opened) unmounted the
 * whole React root: the screen went black and, because the app is hash-routed
 * through that same tree, the user was effectively thrown out of the sanctuary
 * — the exact "settings pe click karte hi screen black + home pe chala jaata
 * hai" report.
 *
 * With the boundary in place a crash is contained to the Sanctuary subtree:
 * the learner stays on the route and gets a readable recovery card with a
 * working "Try again" (re-mounts the world) and "Back to Home". The boundary
 * also resets itself on any hash change so a later visit starts clean.
 *
 * This mirrors the protection FlowPath and Study Library already have.
 */

interface SanctuaryErrorBoundaryProps {
  children: ReactNode;
}

interface SanctuaryErrorBoundaryState {
  error: Error | null;
}

const HOME_HASH = "#/home";

export class SanctuaryErrorBoundary extends Component<
  SanctuaryErrorBoundaryProps,
  SanctuaryErrorBoundaryState
> {
  state: SanctuaryErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SanctuaryErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[sanctuary] render error caught by boundary", error, info?.componentStack);
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
    this.setState({ error: null });
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.hash = HOME_HASH;
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="grid min-h-[100dvh] place-items-center px-6 text-center text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-white/[0.05] p-6 backdrop-blur-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-2xl">
            🌿
          </span>
          <h1 className="mt-4 text-xl font-black tracking-tight">
            The sanctuary needs a moment
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            The 3D world hit a snag. Nothing was lost — tap Try again to walk
            back in, or head home.
          </p>
          <p className="mt-3 break-words rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/50">
            {error.message || "Unknown error"}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="w-full rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/12"
            >
              Back to Home
            </button>
          </div>
        </div>
      </main>
    );
  }
}

export default SanctuaryErrorBoundary;
