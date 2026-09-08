import { useMemo, useState } from 'react';
import { CircleHelp, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import Dropdown from '../ui/Dropdown.jsx';
import { FAQ_GROUPS } from '../../content/faq.js';

/**
 * Quick-access Help menu. Lists FAQ group names (never individual answers) and
 * deep-links into `/help#<group-id>`, which already expands the matching group.
 */
export default function HelpDropdown() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const term = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!term) return FAQ_GROUPS;
    return FAQ_GROUPS.filter((group) => {
      if (group.title.toLowerCase().includes(term)) return true;
      return group.questions.some(
        (item) => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term),
      );
    });
  }, [term]);

  return (
    <Dropdown
      align="right"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Dropdown.Toggle
        className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink"
        aria-label="Help"
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </Dropdown.Toggle>
      <Dropdown.Menu className="w-72 max-w-[calc(100vw-1rem)] text-ink" offset="mt-2" panel>
        <div className="border-b border-line/15 p-2">
          <label className="relative block">
            <span className="sr-only">Search help</span>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help"
              className="min-h-11 w-full rounded-md border border-line/20 bg-surface pl-8 pr-2 text-sm desk:min-h-9"
            />
          </label>
        </div>

        <ul className="max-h-[min(20rem,50vh)] overflow-y-auto overscroll-contain py-1">
          {groups.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing matched that.</li>
          )}
          {groups.map((group) => (
            <li key={group.id}>
              <Dropdown.Item
                to={`/help#${group.id}`}
                className="font-medium"
                onClick={() => setOpen(false)}
              >
                {group.title}
              </Dropdown.Item>
            </li>
          ))}
        </ul>

        <div className="border-t border-line/15">
          <Link
            to="/help"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-primary hover:bg-surface-2"
          >
            View all Help
          </Link>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
