import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; msg: string }
> {
  state = { hasError: false, msg: "" };
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, msg: e.message };
  }
  componentDidCatch(e: Error) {
    console.error("[ErrorBoundary]", e);
  }
  render() {
    if (this.state.hasError)
      return (
        this.props.fallback ?? (
          <div className="banner banner-error">
            Something crashed: {this.state.msg}{" "}
            <button
              type="button"
              className="change-source"
              onClick={() => this.setState({ hasError: false, msg: "" })}
            >
              Retry
            </button>
          </div>
        )
      );
    return this.props.children;
  }
}
