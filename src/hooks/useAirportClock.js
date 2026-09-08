import { useEffect, useMemo, useState } from 'react';
import { AIRPORT_TZ } from '../lib/belizeTime.js';
import { useDisplayPrefs } from '../context/DisplayPrefsContext.jsx';

/**
 * The real wall clock at PGIA, ticking every second — separate from the
 * app's seeded "airport date" (`getRepos().instances.getClock()`) used
 * elsewhere for due-date math. This one just answers "what time is it",
 * for the top bar and the sign-in screen.
 *
 * Hour cycle follows the per-device Appearance preference (12h / 24h).
 */

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: AIRPORT_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function useAirportClock() {
  const { timeFormat } = useDisplayPrefs();
  const [now, setNow] = useState(() => new Date());

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: AIRPORT_TZ,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: timeFormat !== '24h',
      }),
    [timeFormat],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return { time: timeFmt.format(now), date: dateFmt.format(now) };
}
