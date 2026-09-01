import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import FaqAccordion from '../components/help/FaqAccordion.jsx';
import { FAQ_GROUPS } from '../content/faq.js';

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

      <label className="relative block max-w-md">
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
