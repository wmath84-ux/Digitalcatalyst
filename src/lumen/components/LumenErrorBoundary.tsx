import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Catches render errors inside the Lumen chat so a single bad message or
 * state corruption never takes down the entire course player. Shows a
 * friendly recovery UI with a "Reload chat" button that resets state.
 */
export default class LumenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || "Something went wrong in the AI chat.",
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Log to console for debugging — no external crash reporting needed.
    console.error("[Lumen ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    // Reset the error state and force React to remount the chat tree.
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-400">
            <AlertTriangle size={28} />
          </div>
          <div className="max-w-[380px]">
            <h2 className="text-[16px] font-bold text-white">Roman AI Pro encountered an error</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/70">
              {this.state.errorMessage}
            </p>
            <p className="mt-1 text-[12px] text-white/50">
              Your conversation is saved. Try reloading the chat below.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-500 active:scale-95"
          >
            <RotateCcw size={15} />
            Reload Roman AI Pro
          </button>
          <a
            href="#/home"
            className="text-[12px] font-medium text-white/40 underline-offset-2 hover:underline"
          >
            Go back to Home
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
