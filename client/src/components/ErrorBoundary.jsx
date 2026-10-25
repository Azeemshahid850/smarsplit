import { Component } from 'react';
import { AlertCircle } from 'lucide-react';

// A fresh deploy renames the hashed chunks. A tab that was open before it
// still asks for the old Reports-xxxx.js, gets a 404, and the lazy import
// throws. Without a boundary React unmounts everything and the page goes
// blank — this is what that looks like after a redeploy.
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i;
const RELOADED_KEY = 'smartsplit:reloaded-for-chunk';

// Error boundaries are the one thing React still only offers as a class.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (STALE_CHUNK.test(String(error?.message))) {
      // One automatic reload picks up the new index.html; a second failure shows the message.
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(RELOADED_KEY) === '1';
        if (!reloaded) sessionStorage.setItem(RELOADED_KEY, '1');
      } catch {
        /* storage blocked — fall through to the message */
      }
      if (!reloaded) window.location.reload();
      return;
    }
    console.error(error);
  }

  componentDidUpdate(prevProps) {
    // Navigating somewhere else gets a clean slate.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const stale = STALE_CHUNK.test(String(this.state.error.message));
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 px-6 py-10 text-center text-sm text-red-700">
        <AlertCircle className="h-5 w-5" />
        <p>{stale ? 'SmartSplit was just updated. Reload to get the new version.' : 'Something went wrong on this page.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs hover:bg-red-100"
        >
          Reload
        </button>
      </div>
    );
  }
}
