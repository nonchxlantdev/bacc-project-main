import {
  overlayRegisterPdf,
  incidentToRegisterRow,
  filterIncidentsForPeriod,
  currentMonthRange,
} from '../server/overlayRegisterPdf.js';
import { LIMITS, capArray, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-noc-register */
export async function buildNocRegisterExport(body, { forms }) {
  rejectClientBasePdf(body);
  const fieldMap = forms.resolveFieldMap('annex-g-noc-register', 'ed01');
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);
  const range = currentMonthRange();
  const from = body.from || range.from;
  const to = body.to || range.to;
  const incidents = filterIncidentsForPeriod(
    capArray(body.incidents ?? [], LIMITS.incidents, 'incidents'),
    from,
    to,
  );
  const rows = incidents.map(incidentToRegisterRow);
  const pdfBytes = await overlayRegisterPdf({ basePdfBytes, fieldMap, rows });
  const filename = `PGIA-PMM-F07-NOC-register-${from}_to_${to}.pdf`.replace(/[^\w.\-]+/g, '_');
  return { bytes: pdfBytes, filename };
}
