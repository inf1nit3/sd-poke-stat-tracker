import { ButtonItem, PanelSection, PanelSectionRow } from "@decky/ui";
import { Component, ErrorInfo, ReactNode } from "react";
import { retryRefreshStatic } from "../store";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] view crashed:", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    retryRefreshStatic();
  };

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    const message = this.state.error.message || String(this.state.error);
    const stack = this.state.error.stack ?? "";

    return (
      <PanelSection title="Something went wrong">
        <PanelSectionRow>
          <div style={{ color: "#e87b7b", fontSize: 13, lineHeight: 1.4 }}>
            {message}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={this.handleReload}>
            Reload
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <details style={{ fontSize: 11, color: "#888" }}>
            <summary style={{ cursor: "pointer", color: "#aaa" }}>
              Stack trace
            </summary>
            <pre
              style={{
                marginTop: 6,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 4,
                fontSize: 10,
                color: "#ccc",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {stack}
            </pre>
          </details>
        </PanelSectionRow>
      </PanelSection>
    );
  }
}