/**
 * Overlay an empty (and a sample filled) Annex H work order onto the approved PDF.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayChecklistPdf } from '../server/overlayChecklistPdf.js';
import { workOrderToOverlayValues } from '../server/overlayWorkOrderPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fieldMap = JSON.parse(
  readFileSync(path.join(root, 'src/data/field-maps/annex-h-work-order-ed01.json'), 'utf8'),
);
const basePdfBytes = readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));
const outDir = path.join(root, 'tmp-pdf-diff');
mkdirSync(outDir, { recursive: true });

const blank = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: {},
  images: {},
  meta: { formCode: 'PGIA-PMM-F08', templateVersion: fieldMap.templateVersion },
});
writeFileSync(path.join(outDir, 'overlay-h-blank.pdf'), blank);

const sample = await overlayChecklistPdf({
  basePdfBytes,
  fieldMap,
  values: workOrderToOverlayValues({
    work_order_number: 'WO-2026-0001',
    date_issued: '2026-08-15',
    issued_by_name: 'Local Inspector',
    assigned_to_name: 'CEC',
    noc_reference_no: '0047',
    deficiency_level: 2,
    description_of_work: 'Clear debris from runway 07 swale.',
    location_text: 'Runway West Edge',
    target_completion_date: '2026-08-22',
    notam_required: false,
    notam_ref: '',
    date_works_completed: '2026-08-18',
    completed_by: 'CEC crew',
    description_of_work_performed: 'Debris removed and channel flushed.',
    materials_used: 'None',
    test_verification_results: 'Visual — flow restored',
    area_cleared_for_operations: true,
    cec_clearance_issued: true,
    cec_clearance_date: '2026-08-18',
    signoffs: [
      { role: 'om_coo_verification', name: 'OM', signed_at: '2026-08-18' },
      { role: 'cec_clearance', name: 'CEC', signed_at: '2026-08-18' },
    ],
  }),
  images: {},
  meta: { formCode: 'PGIA-PMM-F08', templateVersion: fieldMap.templateVersion, submissionId: 'WO-2026-0001' },
});
writeFileSync(path.join(outDir, 'overlay-h-sample.pdf'), sample);

console.log(`Wrote ${path.join(outDir, 'overlay-h-blank.pdf')} and overlay-h-sample.pdf`);
