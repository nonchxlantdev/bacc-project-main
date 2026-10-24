import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { layoutFittedText, submissionToOverlayValues } from '../server/overlayChecklistPdf.js';

async function font() {
  const doc = await PDFDocument.create();
  return doc.embedFont(StandardFonts.Helvetica);
}

test('a word wider than the cell is broken so no line exceeds the box', async () => {
  const face = await font();
  const field = {
    x: 10,
    y: 100,
    size: 9,
    width: 40,
    maxLines: 1,
    minSize: 5,
    _key: 'row_01_species',
    _continuationPage: 2,
  };
  const laid = layoutFittedText(face, 'TROGLODYTIDAE', field);
  assert.ok(laid.lines.length >= 1);
  for (const line of laid.lines) {
    assert.ok(
      face.widthOfTextAtSize(line, laid.size) <= field.width + 0.05,
      `"${line}" at ${laid.size}pt is wider than ${field.width}`,
    );
  }
});

test('text that already fits is not shrunk', async () => {
  const face = await font();
  const laid = layoutFittedText(face, '22/10/2026', {
    size: 7,
    width: 60,
    maxLines: 1,
    _key: 'date',
  });
  assert.equal(laid.size, 7);
  assert.deepEqual(laid.lines, ['22/10/2026']);
  assert.equal(laid.overflow, false);
});

test('header dates print day-first and a free-text time is left as typed', () => {
  const values = submissionToOverlayValues({
    header: { date: '2026-10-22', timeStart: '4:30pm', note: 'kept' },
    schema: {
      headerFields: [
        { key: 'date', type: 'date', mapKey: 'date' },
        { key: 'timeStart', type: 'time', mapKey: 'time_start' },
        { key: 'note', type: 'text', mapKey: 'note' },
      ],
    },
    items: {},
    summary: {},
    signoffs: [],
  });
  assert.equal(values.date, '22/10/2026');
  assert.equal(values.time_start, '16:30');
  assert.equal(values.note, 'kept');
});
