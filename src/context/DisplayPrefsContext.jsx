import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { setTimeFormatPreference } from '../lib/airportFormat.js';

const STORAGE_KEY = 'bacc-display-prefs';
const DisplayPrefsContext = createContext(null);

export const LANDING_OPTIONS = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/checklists/mine', label: 'My Checklists' },
  { value: '/incidents', label: 'Incidents' },
  { value: '/approvals', label: 'Approvals' },
  { value: '/reports', label: 'Reports' },
];

const ALLOWED_LANDING = new Set(LANDING_OPTIONS.map((o) => o.value));

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { landingPage: '/dashboard', timeFormat: '12h' };
    const parsed = JSON.parse(raw);
    return {
      landingPage: ALLOWED_LANDING.has(parsed.landingPage) ? parsed.landingPage : '/dashboard',
      timeFormat: parsed.timeFormat === '24h' ? '24h' : '12h',
    };
  } catch {
    return { landingPage: '/dashboard', timeFormat: '12h' };
  }
}

/**
 * Per-device display preferences (default landing page + 12h/24h clock).
 * Same reasoning as ThemeContext: personal to the device, not airport-wide
 * configuration, so they live outside SettingsContext's synced sections.
 */
export function DisplayPrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(readStored);

  useEffect(() => {
    setTimeFormatPreference(prefs.timeFormat);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Private browsing — prefs still apply for this session.
    }
  }, [prefs]);

  const setLandingPage = useCallback((landingPage) => {
    setPrefs((current) => ({
      ...current,
      landingPage: ALLOWED_LANDING.has(landingPage) ? landingPage : current.landingPage,
    }));
  }, []);

  const setTimeFormat = useCallback((timeFormat) => {
    setPrefs((current) => ({
      ...current,
      timeFormat: timeFormat === '24h' ? '24h' : '12h',
    }));
  }, []);

  const setDisplayPrefs = useCallback((next) => {
    setPrefs((current) => ({
      landingPage: ALLOWED_LANDING.has(next.landingPage) ? next.landingPage : current.landingPage,
      timeFormat: next.timeFormat === '24h' ? '24h' : '12h',
    }));
  }, []);

  return (
    <DisplayPrefsContext.Provider
      value={{
        landingPage: prefs.landingPage,
        timeFormat: prefs.timeFormat,
        setLandingPage,
        setTimeFormat,
        setDisplayPrefs,
      }}
    >
      {children}
    </DisplayPrefsContext.Provider>
  );
}

export function useDisplayPrefs() {
  const ctx = useContext(DisplayPrefsContext);
  if (!ctx) throw new Error('useDisplayPrefs must be used inside DisplayPrefsProvider');
  return ctx;
}
