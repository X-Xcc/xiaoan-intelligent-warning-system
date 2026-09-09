import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  declare state: State;
  declare props: Readonly<Props>;

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#fff", background: "#1a1a2e", fontFamily: "monospace" }}>
          <h2>渲染错误</h2>
          <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
            {import.meta.env.DEV && this.state.error.stack && (
              <>
                {"\n"}
                {this.state.error.stack}
              </>
            )}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
