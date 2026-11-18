import { Component, type ReactNode } from "react";

interface Props {
  /** Changing this value clears a previous error (e.g. when the user switches views). */
  resetKey?: unknown;
  /** Called from the fallback's action button. */
  onFallback?: () => void;
  fallbackLabel?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a failing panel (such as the graph) from taking the whole app down. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="empty-state" role="alert" data-testid="panel-error">
        <p>This view failed to render: {error.message || String(error)}</p>
        {this.props.onFallback ? (
          <button type="button" onClick={this.props.onFallback}>
            {this.props.fallbackLabel ?? "Go back"}
          </button>
        ) : null}
      </div>
    );
  }
}
