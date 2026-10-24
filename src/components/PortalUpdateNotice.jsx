import { useEffect, useState } from 'react';
import { checklistHasUnsavedEdits } from '../lib/unsavedChecklist.js';
import { onPortalUpdate } from '../lib/portalUpdate.js';

/**
 * A new build is waiting. Reload immediately when nothing on screen would be
 * lost; otherwise leave the choice with the person who still has unsaved edits.
 */
export default function PortalUpdateNotice() {
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => onPortalUpdate(() => {
    if (!checklistHasUnsavedEdits()) {
      setWaiting(false);
      setOpen(true);
      window.setTimeout(() => location.reload(), 400);
      return;
    }
    setWaiting(true);
    setOpen(true);
  }), []);

  if (!open) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-navy px-4 py-3 text-sm text-white"
    >
      <span>{waiting ? 'Refresh when ready' : 'Portal updated — refreshing'}</span>
      {waiting && (
        <button
          type="button"
          className="min-h-11 rounded-md bg-white px-3 text-sm font-semibold text-navy"
          onClick={() => location.reload()}
        >
          Refresh
        </button>
      )}
    </div>
  );
}
