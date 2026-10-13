import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';
import FaqAccordion from '../components/help/FaqAccordion.jsx';
import { FAQ_GROUPS } from '../content/faq.js';
import { useTour } from '../components/tour/TourProvider.jsx';

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();

  // Arriving from a deep link — "More about incidents" on an incident page —
  // opens that group. Landing on a heading with every answer still folded away
  // is a link that technically worked and practically did not.
  const target = useLocation().hash.replace('#', '');

  const groups = useMemo(() => {
    if (!term) return FAQ_GROUPS;
    return FAQ_GROUPS.map((group) => ({
      ...group,
      questions: group.questions.filter(
        (item) => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term),
      ),
    })).filter((group) => group.questions.length > 0);
  }, [term]);

  const hits = groups.reduce((n, group) => n + group.questions.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">Help</h1>
        <p className="mt-1 text-sm text-muted">
          Guidance on using the portal. If anything here does not match what you see on screen, contact the Operations Manager.
        </p>
      </div>

      <GuidedTours />

      <label data-tour="help-search" className="relative block max-w-md">
        <span className="sr-only">Search help</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search help (for example "signature" or "NO SAT")'
          className="min-h-11 w-full rounded-md border border-line/20 bg-surface pl-9 pr-3 text-sm"
        />
      </label>

      {term && (
        <p className="text-sm text-muted" role="status">
          {hits === 0 ? 'Nothing matched that.' : `${hits} ${hits === 1 ? 'answer' : 'answers'} matched.`}
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <FaqAccordion key={group.id} group={group} openAll={Boolean(term) || group.id === target} />
        ))}
      </div>
    </div>
  );
}

/**
 * Replays. The welcome tour plus a guide for every screen this role can open;
 * record screens (a checklist, an incident) are replayed from the Help menu
 * while the record is open, since they need a record to point at.
 */
function GuidedTours() {
  const { replayable, replay, activeId } = useTour();
  if (replayable.length === 0) return null;
  const [welcome, ...screens] = replayable;
  return (
    <section data-tour="help-tours" className="rounded-lg border border-line/12 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal/15 text-teal">
            <Compass className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Guided tours</h2>
            <p className="mt-0.5 text-sm text-muted">
              A short walk through the portal, or a guide to one screen. To see the guide for a checklist or an
              incident, open it and choose Show me around this page from the Help menu.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => replay(welcome.id)}
          disabled={Boolean(activeId)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 sm:w-auto desk:min-h-10"
        >
          Take the welcome tour
        </button>
      </div>
      {screens.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Screen guides">
          {screens.map((tour) => (
            <li key={tour.id}>
              <button
                type="button"
                onClick={() => replay(tour.id)}
                disabled={Boolean(activeId)}
                className="inline-flex min-h-11 items-center rounded-md border border-line/20 bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50 desk:min-h-9"
              >
                {tour.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
