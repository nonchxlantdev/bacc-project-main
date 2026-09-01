import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'bacc-theme';
const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Light/dark theme, applied as `data-theme` on <html> and persisted to
 * localStorage — a per-device preference, not a synced setting, so this is
 * a small standalone context rather than a section of SettingsContext.
 *
 * Defaults to light and ignores `prefers-color-scheme` deliberately: this is
 * a work tool used for regulatory sign-off, so what it looks like should be
 * a choice the person made on purpose, not something that changes on its
 * own because their OS theme did.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme still works for this
      // session, it just won't be remembered next time.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
