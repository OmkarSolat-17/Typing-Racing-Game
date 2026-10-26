import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in the header of the fallback so a crash report names the area that died. */
  label?: string;
  /** Offered as an escape hatch — the usual cause is poisoned local data. */
  onReset?: () => void;
  /** Optional reporter (e.g. a future Sentry binding). Must never throw. */
  onReport?: (error: Error, info: { componentStack: string | null }) => void;
}

interface State {
  error: Error | null;
  stack: string | null;
}

/**
 * The last line of defence.
 *
 * Without it, one unexpected value anywhere in the tree unmounts the whole app and the
 * user is left on a black screen with no way back — which is exactly what a single
 * malformed record in `localStorage` used to do, forever, because the bad payload was
 * re-read on every boot. This boundary keeps the session recoverable and tells the truth
 * about what happened.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, stack: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = typeof info.componentStack === "string" ? info.componentStack : null;
    this.setState({ stack: componentStack });
    // Console first: a reporting bug must not turn one crash into two.
    console.error(`[${this.props.label ?? "app"}] uncaught render error`, error, componentStack);
    try {
      this.props.onReport?.(error, { componentStack });
    } catch (reportError) {
      console.error("[reporting] failed", reportError);
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null, stack: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    const detail = `${this.state.error.name}: ${this.state.error.message}`;
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="grid h-full w-full place-items-center bg-ink px-4 py-8 text-cream"
      >
        <div className="panel w-full max-w-lg rounded-2xl p-6">
          <div className="label-xs text-coral">{this.props.label ?? "app"} · crashed</div>
          <h1 className="mt-2 font-display text-2xl leading-tight">The engine stopped.</h1>
          <p className="mt-2 text-sm text-mute">
            Nothing you typed was lost — race history lives in this browser. A recoverable state error is usually a
            corrupted saved record.
          </p>
          <pre className="mt-3 max-h-28 overflow-auto rounded-lg border border-line bg-ink-2 p-3 font-mono text-[11px] text-coral">
            {detail}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={this.reset}
              className="btn-3d rounded-xl bg-amber px-4 py-2.5 font-display text-sm text-ink"
            >
              TRY AGAIN
            </button>
            <button
              onClick={() => {
                this.reset();
                window.location.reload();
              }}
              className="btn-3d rounded-xl border border-line bg-panel-2 px-4 py-2.5 font-display text-sm text-cream"
            >
              RELOAD
            </button>
          </div>
          <p className="mt-3 font-mono text-[10px] text-mute">
            Stack traces are kept in the browser console only — this app sends nothing anywhere.
          </p>
        </div>
      </div>
    );
  }
}
