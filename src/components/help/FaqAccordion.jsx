import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDismissable } from '../ui/useDismissable.js';

function FaqItem({ item, forceOpen }) {
  const [open, setOpen] = useState(forceOpen);
  const ref = useDismissable(open && !forceOpen, () => setOpen(false));

  useEffect(() => {
    setOpen(forceOpen);
  }, [forceOpen]);

  function onSummaryClick(event) {
    event.preventDefault();
    setOpen((was) => !was);
  }

  return (
    <details ref={ref} open={open} className="group px-4">
      <summary
        onClick={onSummaryClick}
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium text-navy marker:hidden hover:text-primary"
      >
        {item.q}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <p className="pb-3.5 pr-7 text-sm leading-relaxed text-muted">{item.a}</p>
    </details>
  );
}

/**
 * One group of questions.
 *
 * Each answer opens on its own and closes when you click outside it or press
 * Escape, so an expanded item does not stay open after you move on.
 */
export default function FaqAccordion({ group, openAll }) {
  return (
    <section
      id={group.id}
      className="scroll-mt-4 rounded-lg border border-navy/10 bg-white shadow-sm"
    >
      <h2 className="border-b border-navy/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-navy">
        {group.title}
      </h2>
      <div className="divide-y divide-navy/5">
        {group.questions.map((item) => (
          <FaqItem key={item.q} item={item} forceOpen={openAll} />
        ))}
      </div>
    </section>
  );
}
