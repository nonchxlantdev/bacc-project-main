import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { prepareRepos } from './data/repositories/index.js';
import { loadSettings } from './lib/settingsStore.js';
import './index.css';

registerSW({ immediate: true });

// Settings are read synchronously by the deficiency-level and notification
// helpers, so they must be in memory before the first render — not fetched
// afterwards, which would flash the shipped defaults and then correct itself.
// prepareRepos() loads the mock catalogue only when VITE_DATA_SOURCE=mock.
//
// NO top-level await here. The mock/d1 repository chunks import shared code
// from this entry chunk; if this module were still suspended on a top-level
// await of that very import, the two would wait on each other forever and the
// production build would render a blank page (dev mode doesn't bundle, so it
// never shows). Booting inside a function lets this module finish evaluating
// first. tests/bootNoTopLevelAwait.test.js guards this.
async function boot() {
  await prepareRepos();
  await loadSettings();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

boot();
