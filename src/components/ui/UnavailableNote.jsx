import { Paperclip } from 'lucide-react';
import { ATTACHMENTS_UNAVAILABLE } from '../../lib/unavailable.js';

/**
 * A plain "not available right now" marker where an attachment control would
 * be. Deliberately reads like a normal production state — no pilot/test talk.
 * `compact` fits inline next to buttons (verification panel).
 */
export default function UnavailableNote({ text = ATTACHMENTS_UNAVAILABLE, compact = false }) {
  if (compact) {
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted xl:min-h-9">
        <Paperclip size={14} aria-hidden /> {text}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-line/20 bg-surface-2 px-3 py-2.5 text-sm text-muted">
      <Paperclip size={16} aria-hidden className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}
