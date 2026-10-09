import {
  overlayChecklistPdf,
  submissionToOverlayValues,
  dataUriToBytes,
} from '../server/overlayChecklistPdf.js';
import { HttpError, LIMITS, capArray, rejectClientBasePdf } from './_shared.js';

/** POST /api/export-checklist-pdf */
export async function buildExport(body, { forms }) {
  rejectClientBasePdf(body);
  const templateKey = body.templateKey || 'annex-d-drainage';
  const templateVersion = body.templateVersion || 'ed01';
  // Always resolved server-side from the allow-listed form store.
  const fieldMap = forms.resolveFieldMap(templateKey, templateVersion);
  const basePdfBytes = forms.readApprovedBasePdf(fieldMap);

  const record = body.submission ?? body;
  const schemaForMapping = hasMappingMetadata(record.schema ?? record.content_schema)
    ? record.schema ?? record.content_schema
    : forms.loadSchema(fieldMap.templateKey) ?? record.schema ?? record.content_schema;

  const values = body.values ?? submissionToOverlayValues({ ...record, schema: schemaForMapping });
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    throw new HttpError(400, `images exceeds limit of ${LIMITS.images}`);
  }

  const photos = [];
  for (const photo of capArray(body.photos ?? [], LIMITS.photos, 'photos')) {
    const bytes = dataUriToBytes(photo.dataUri);
    if (bytes) photos.push({ bytes, label: photo.label, caption: photo.caption, contentType: photo.contentType });
  }

  const pdfBytes = await overlayChecklistPdf({
    basePdfBytes,
    fieldMap,
    values,
    images,
    meta: {
      formCode: record.template_code || fieldMap.templateKey,
      templateVersion,
      submissionId: record.id,
      photos,
    },
  });

  const filename = `${fieldMap.templateKey}-${templateVersion}-${record.id || 'draft'}.pdf`.replace(
    /[^\w.\-]+/g,
    '_',
  );
  return { bytes: pdfBytes, filename, fieldMap };
}

function hasMappingMetadata(schema) {
  return (schema?.headerFields ?? []).some((f) => f.markPrefix || f.mapKey);
}
