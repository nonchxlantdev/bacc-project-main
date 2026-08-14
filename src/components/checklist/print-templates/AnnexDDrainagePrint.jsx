/**
 * React wrapper around the Annex D print HTML builder.
 * The PDF pipeline posts the HTML string from `buildChecklistPrintHtml`;
 * this component is the on-screen / iframe preview of that same document.
 */
import { useEffect, useState } from 'react';
import { buildChecklistPrintHtml } from '../../../lib/printHtml.js';

export default function AnnexDDrainagePrint({ schema, submission }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    buildChecklistPrintHtml({
      schema,
      submission,
      printTemplateKey: 'annex-d-drainage',
    })
      .then((doc) => {
        if (!cancelled) setHtml(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [schema, submission]);

  if (error) {
    return <p className="text-alert">{error}</p>;
  }

  if (!html) {
    return <p className="text-muted">Preparing print preview…</p>;
  }

  return (
    <iframe
      title="Annex D print preview"
      srcDoc={html}
      className="h-[11in] w-full border border-navy/20 bg-white"
    />
  );
}
