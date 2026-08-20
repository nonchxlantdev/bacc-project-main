import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  getSettings,
  resetSection as resetSectionStore,
  saveSection as saveSectionStore,
  subscribeSettings,
} from '../lib/settingsStore.js';

const SettingsContext = createContext(null);

/**
 * React's view of the settings cache.
 *
 * `useSyncExternalStore` rather than state plus an effect: the cache is read
 * synchronously by helpers outside React, so React must subscribe to it rather
 * than keep a second copy that can disagree. `getSettings` returns the same
 * object identity until a save, so this does not re-render on every commit.
 */
export function SettingsProvider({ children }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);

  const value = useMemo(
    () => ({
      settings,
      saveSection: saveSectionStore,
      resetSection: resetSectionStore,
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** One section, plus a save bound to it. */
export function useSettingsSection(section) {
  const { settings, saveSection, resetSection } = useSettings();
  const save = useCallback((value, actor) => saveSection(section, value, actor), [saveSection, section]);
  const reset = useCallback((actor) => resetSection(section, actor), [resetSection, section]);
  return { value: settings[section], save, reset };
}
