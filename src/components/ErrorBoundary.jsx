import { Component } from 'react';
import { Link } from 'react-router-dom';
import { reportClientError } from '../lib/reportClientError.js';

/**
 * Catches a render error. The top-level boundary replaces the whole page.
 * The route boundary (variant="route") leaves the shell in place.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, ref: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportClientError({
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: info?.componentStack,
    }).then((ref) => {
      if (ref) this.setState({ ref });
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const route = this.props.variant === 'route';
    return (
      <div
        className={
          route
            ? 'flex min-h-[40vh] flex-col items-start gap-4 rounded-md border border-line/20 bg-surface p-6 text-ink'
            : 'flex min-h-screen flex-col items-center justify-center gap-4 bg-navy px-6 text-center text-white'
        }
      >
        <h1 className="text-xl font-semibold">{route ? 'This screen hit an error' : 'Something went wrong'}</h1>
        <p className={`max-w-md text-sm ${route ? 'text-muted' : 'text-white/80'}`}>
          {route
            ? 'The rest of the portal is still open. Try this screen again, or go back to the Dashboard.'
            : 'The page hit an unexpected error. Your work in drafts should still be on this device — try reloading. If it keeps happening, tell your administrator.'}
        </p>
        {this.state.ref && (
          <p className={`text-sm font-medium ${route ? 'text-ink' : 'text-white'}`}>
            Reference: {this.state.ref}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`min-h-11 rounded-md px-4 text-sm font-semibold ${
              route ? 'bg-navy text-white' : 'bg-white text-navy'
            }`}
            onClick={() => {
              if (route) this.setState({ error: null, ref: null });
              else location.reload();
            }}
          >
            {route ? 'Try again' : 'Reload'}
          </button>
          {route && (
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center rounded-md border border-line/30 px-4 text-sm font-semibold text-ink"
            >
              Back to Dashboard
            </Link>
          )}
        </div>
      </div>
    );
  }
}
