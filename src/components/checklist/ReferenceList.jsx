import { FileText } from 'lucide-react';

/**
 * A reference sheet, shown exactly as it is printed.
 *
 * Annex L is not an inspection — every line on the approved sheet is
 * pre-printed and nothing is ever filled in or overlaid. So the portal renders
 * it read-only: same headings, same reference codes, same wording, in the same
 * order. There are no inputs because the approved document has none, and adding
 * any would be a change to an approved form under §14.
 *
 * The reference column is fixed-width at `sm` and up so the codes line up as a
 * scannable column, which is how the printed sheet reads and how someone
 * looking for "BCAR-139" actually uses it.
 */
export default function ReferenceList({ schema }) {
  const groups = schema.referenceGroups ?? [];
  if (!groups.length) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-navy/10 bg-white shadow-sm">
      <header className="border-b border-navy/10 bg-navy px-4 py-3 text-white">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <FileText className="h-4 w-4" aria-hidden />
          {schema.sectionHeading ?? schema.title}
        </h2>
        <p className="mt-0.5 text-xs text-white/70">
          Reproduced from the approved sheet. Nothing on this document is filled in.
        </p>
      </header>

      <div className="divide-y divide-navy/10">
        {groups.map((group) => (
          <section key={group.heading}>
            <h3 className="bg-stripe px-4 py-2.5 text-[13px] font-bold text-navy">{group.heading}</h3>
            <dl className="divide-y divide-navy/5">
              {group.entries.map((entry, i) => (
                <div
                  key={`${entry.ref}-${i}`}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-5"
                >
                  <dt className="text-[13px] font-semibold text-navy">{entry.ref}</dt>
                  <dd className="text-[13px] leading-relaxed text-ink">{entry.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
