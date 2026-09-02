import { useEffect, useState } from 'react';
import { AIRPORT_TZ } from '../lib/belizeTime.js';

/**
 * The real wall clock at PGIA, ticking every second — separate from the
 * app's seeded "airport date" (`getRepos().instances.getClock()`) used
 * elsewhere for due-date math. This one just answers "what time is it",
 * for the top bar and the sign-in screen.
 *
 * Always 12-hour with AM/PM, to match every other time shown in the app
 * (see `fmtDateTime` in lib/airportFormat.js) — this used to be its own
 * 24-hour formatter, the one place on the portal that didn't read like
 * the rest of it.
 */

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TZ,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: AIRPORT_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function useAirportClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return { time: timeFmt.format(now), date: dateFmt.format(now) };
}
