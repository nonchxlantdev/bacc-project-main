import { signatureImages } from './signoffFields.js';
import { getSubmission } from './submissions.js';

/** POST the overlay export and return the PDF blob. */
export async function requestChecklistPdf({ templateKey, templateVersion, submission, images, photos }) {
  const { apiFetch } = await import('./apiFetch.js');
  const res = await apiFetch('/api/export-checklist-pdf', {
    method: 'POST',
    body: JSON.stringify({
      templateKey: templateKey || submission?.print_template_key || 'annex-d-drainage',
      templateVersion: templateVersion || submission?.template_version || 'ed01',
      submission,
      images: images ?? {},
      photos: photos ?? [],
    }),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('pdf')) {
    let message = `Export failed (${res.status})`;
    try {
      const payload = await res.clone().json();
      if (payload?.error) message = payload.error;
    } catch {
      const text = await res.text();
      if (text) message = text.slice(0, 280);
    }
    throw new Error(message);
  }
  return res.blob();
}

export function savePdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Download the filed PDF. Loads the full record so row signatures are present. */
export async function downloadChecklistPdf(record) {
  const full = record?.schema && record?.signoffs?.some((s) => s.signature_data_uri) ? record : await getSubmission(record.id);
  const images = signatureImages(full, full.field_map);
  const blob = await requestChecklistPdf({
    templateKey: full.print_template_key,
    templateVersion: full.template_version,
    submission: full,
    images,
    photos: [],
  });
  const code = full.schema?.code || full.template_code || 'checklist';
  savePdfBlob(blob, `${code}-${full.template_version || 'ed01'}-${full.inspection_date || 'record'}.pdf`);
}
