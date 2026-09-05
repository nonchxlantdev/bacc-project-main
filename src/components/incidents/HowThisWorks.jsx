import { Check, CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INCIDENT_STAGES } from '../../content/incidentGuide.js';
import { INCIDENT_STATUSES, incidentStepIndex, itemResolutionState } from '../../lib/incidentLifecycle.js';
import { fmtDate } from '../../lib/airportFormat.js';
import { Card } from './detailUi.jsx';

/**
 * What happens next, and what it will do to the checklist this came from.
 *
 * The stepper in Status & Workflow already shows where the incident is; it does
 * not say what any stage means or what closing one does. That matters most at
 * the last stage, because confirming SAT reaches back and changes an item on a
 * checklist somebody else filed — behaviour nobody would guess, and the whole
 * reason this portal exists rather than a folder of PDFs.
 */
export default function HowThisWorks({ incident }) {
  const step = incidentStepIndex(incident?.status);
  const resolution = itemResolutionState(incident);
  const cleared = resolution?.tone === 'cleared';

  return (
    <Card title="How this works">
      <ol className="space-y-2.5">
        {INCIDENT_STATUSES.map((status, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={status.value} className="flex gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  done
                    ? 'border-success bg-success text-white'
                    : current
                      ? 'border-primary bg-primary text-white'
                      : 'border-line/20 bg-line/15 text-muted'
                }`}
              >
                {done ? <Check size={11} aria-hidden /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${current ? 'text-ink' : 'text-muted'}`}>
                  {status.label}
                  {current && <span className="ml-1.5 font-normal text-primary">— you are here</span>}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{INCIDENT_STAGES[status.value]}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {incident?.source_item_code && (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-xs leading-relaxed ${
            cleared ? 'border-success bg-success-soft text-ink' : 'border-line/15 bg-stripe text-muted'
          }`}
        >
          {cleared ? (
            <>
              <Check size={12} className="mr-1 inline text-success" aria-hidden />
              Item {incident.source_item_code} now reads SAT on the original checklist.
            </>
          ) : (
            <>
              Raised from item {incident.source_item_code} on {incident.source_template_code}
              {incident.source_inspection_date ? `, filed ${fmtDate(incident.source_inspection_date)}` : ''}.
            </>
          )}
        </p>
      )}

      <Link
        to="/help#incidents"
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary hover:underline desk:min-h-0"
      >
        <CircleHelp size={13} aria-hidden />
        More about incidents
      </Link>
    </Card>
  );
}
