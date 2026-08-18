import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  overlayChecklistPdf,
  submissionToOverlayValues,
  dataUriToBytes,
} from '../server/overlayChecklistPdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: '12mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const { bytes, filename } = await buildExport(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'PDF export failed' });
  }
}

export async function buildExport(body) {
  const templateKey = body.templateKey || 'annex-d-drainage';
  const templateVersion = body.templateVersion || 'ed01';
  const fieldMap = body.fieldMap || loadFieldMap(templateKey, templateVersion);
  const basePdfBytes = body.basePdfBase64
    ? Buffer.from(body.basePdfBase64, 'base64')
    : readFileSync(path.join(root, 'src/assets/forms', fieldMap.basePdf));

  const record = body.submission ?? body;

  // A submission carries a SNAPSHOT of its schema, pinned at creation. That is
  // right for content (item wording and order must never shift under a record),
  // but header->field-map mapping is a pipeline concern, and older snapshots
  // predate `mapKey` / `markPrefix`. Without this, a draft created before those
  // were added silently drops values that have nowhere to go — e.g. C-8's
  // Systems Affected / AOC Impact never stamps its checkbox.
  const schemaForMapping = hasMappingMetadata(record.schema ?? record.content_schema)
    ? record.schema ?? record.content_schema
    : loadSchema(fieldMap.templateKey) ?? record.schema ?? record.content_schema;

  const values = body.values ?? submissionToOverlayValues({ ...record, schema: schemaForMapping });
  const images = {};
  for (const [key, uri] of Object.entries(body.images ?? {})) {
    const bytes = dataUriToBytes(uri);
    if (bytes) images[key] = bytes;
  }

  const photos = [];
  for (const photo of body.photos ?? []) {
    const bytes = dataUriToBytes(photo.dataUri);
    if (bytes) photos.push({ bytes, label: photo.label, contentType: photo.contentType });
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

function loadFieldMap(templateKey, version) {
  const file = path.join(root, 'src/data/field-maps', `${templateKey}-${version}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** A schema knows how to map its header fields only if it declares mapKey/markPrefix. */
function hasMappingMetadata(schema) {
  return (schema?.headerFields ?? []).some((f) => f.markPrefix || f.mapKey);
}

/** Content schemas are named for their template key: src/data/checklists/<key>.json */
function loadSchema(templateKey) {
  if (!templateKey) return null;
  try {
    return JSON.parse(readFileSync(path.join(root, 'src/data/checklists', `${templateKey}.json`), 'utf8'));
  } catch {
    return null;
  }
}
