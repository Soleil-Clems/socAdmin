import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDisconnect = () => {
    sessionStorage.removeItem("socadmin_conn");
    document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict";
    document.cookie = "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict";
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center text-destructive text-2xl font-bold">
            !
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              An unexpected error occurred. This is usually temporary — try reloading the page.
            </p>
          </div>

          {this.state.error && (
            <pre className="text-left text-[11px] text-muted-foreground bg-muted rounded-lg p-4 max-h-32 overflow-auto">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Reload page
            </button>
            <button
              onClick={this.handleDisconnect}
              className="h-9 px-4 rounded-md border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Reset &amp; logout
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground/60">
            If this keeps happening, check your server logs or restart the backend.
          </p>
        </div>
      </div>
    );
  }
}
