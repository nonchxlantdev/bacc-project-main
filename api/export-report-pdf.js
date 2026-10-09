import { buildReportPdf } from '../server/reportPdf.js';
import { LIMITS, capArray } from './_shared.js';

/** POST /api/export-report-pdf — house-style report, not an approved annex. */
export async function buildReportExport(body) {
  return buildReportPdf({
    ...body,
    teams: capArray(body.teams ?? [], LIMITS.teams, 'teams'),
    weeks: capArray(body.weeks ?? [], LIMITS.weeks, 'weeks'),
    late: capArray(body.late ?? [], LIMITS.late, 'late'),
  });
}
