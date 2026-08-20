import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { loadSettings } from './lib/settingsStore.js';
import './index.css';

registerSW({ immediate: true });

// Settings are read synchronously by the deficiency-level and notification
// helpers, so they must be in memory before the first render — not fetched
// afterwards, which would flash the shipped defaults and then correct itself.
await loadSettings();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
