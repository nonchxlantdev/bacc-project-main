import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  overlayChecklistPdf,
  submissionToOverlayValues,
  dataUriToBytes,
} from '../server/overlayChecklistPdf.js';
import {
  LIMITS,
  capArray,
  enforceBodySize,
  rateLimit,
  readApprovedBasePdf,
  rejectClientBasePdf,
  requireUser,
  resolveFieldMap,
  sendError,
} from './_shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    enforceBodySize(req);
    rateLimit(req, { limit: 20 });
    await requireUser(req);
    const body = req.body ?? {};
    const { bytes, filename } = await buildExport(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    sendError(res, err);
  }
}

export async function buildExport(body) {
  rejectClientBasePdf(body);
  const templateKey = body.templateKey || 'annex-d-drainage';
  const templateVersion = body.templateVersion || 'ed01';
  // Always resolve server-side — ignore client fieldMap.basePdf for filesystem access.
  const fieldMap = resolveFieldMap(templateKey, templateVersion);
  const basePdfBytes = readApprovedBasePdf(fieldMap);

  const record = body.submission ?? body;
  const schemaForMapping = hasMappingMetadata(record.schema ?? record.content_schema)
    ? record.schema ?? record.content_schema
    : loadSchema(fieldMap.templateKey) ?? record.schema ?? record.content_schema;

  const values = body.values ?? submissionToOverlayValues({ ...record, schema: schemaForMapping });
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }
  if (Object.keys(images).length > LIMITS.images) {
    const err = new Error(`images exceeds limit of ${LIMITS.images}`);
    err.status = 400;
    throw err;
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

function loadSchema(templateKey) {
  if (!templateKey) return null;
  try {
    return JSON.parse(readFileSync(path.join(root, 'src/data/checklists', `${templateKey}.json`), 'utf8'));
  } catch {
    return null;
  }
}
