import { Component } from 'react';

/**
 * Catches render errors so production never shows a blank white page.
 * Logs a structured payload Vercel (or any log drain) can pick up.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(
      JSON.stringify({
        level: 'error',
        source: 'ErrorBoundary',
        msg: error?.message || String(error),
        stack: error?.stack,
        componentStack: info?.componentStack,
        href: typeof location !== 'undefined' ? location.href : null,
        at: new Date().toISOString(),
      }),
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy px-6 text-center text-white">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-white/80">
            The page hit an unexpected error. Your work in drafts should still be on this device —
            try reloading. If it keeps happening, tell your administrator.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-md bg-white px-4 text-sm font-semibold text-navy"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
