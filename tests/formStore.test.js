import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormStore } from '../api/_formStore.js';
import { loadFormSources, createNodeFormStore } from '../scripts/lib/nodeFormStore.mjs';

const sources = loadFormSources();
const store = createNodeFormStore();

test('every field map resolves and its approved base PDF is present', () => {
  const stems = Object.keys(sources.fieldMaps);
  assert.ok(stems.length >= 36, `expected at least 36 field maps, found ${stems.length}`);
  for (const stem of stems) {
    const [, key, ver] = stem.match(/^(.*)-(ed\d+)$/i);
    const map = store.resolveFieldMap(key, ver);
    const bytes = store.readApprovedBasePdf(map);
    assert.ok(bytes instanceof Uint8Array, `${stem}: base PDF not bytes`);
    assert.equal(
      new TextDecoder().decode(bytes.slice(0, 5)),
      '%PDF-',
      `${stem}: ${map.basePdf} is not a PDF`,
    );
  }
});

test('the register and work-order forms resolve by their fixed keys', () => {
  assert.equal(store.resolveFieldMap('annex-g-noc-register', 'ed01').basePdf, 'annex-g-noc-register-ed01.pdf');
  assert.equal(store.resolveFieldMap('annex-h-work-order', 'ed01').basePdf, 'annex-h-work-order-ed01.pdf');
});

test('rejects traversal, separators and unknown keys with HTTP 400', () => {
  for (const bad of ['../annex-d-drainage', 'annex/d', 'annex\\d', 'x\0y', '', 'not-a-form']) {
    assert.throws(() => store.resolveFieldMap(bad, 'ed01'), (err) => err.status === 400, `accepted ${JSON.stringify(bad)}`);
  }
  assert.throws(() => store.resolveFieldMap('annex-d-drainage', '../ed01'), (err) => err.status === 400);
  assert.throws(() => store.resolveFieldMap('annex-d-drainage', 'ed99'), (err) => err.status === 400);
});

test('base PDF lookup ignores inherited object keys', () => {
  for (const name of ['constructor', '__proto__', 'toString']) {
    assert.throws(() => store.readApprovedBasePdf({ basePdf: name }), (err) => err.status === 400);
  }
});

test('schemas load by template key; unknown keys give null', () => {
  assert.ok(Array.isArray(store.loadSchema('annex-d-drainage').sections));
  assert.equal(store.loadSchema('nope'), null);
  assert.equal(store.loadSchema(''), null);
});

test('returned field maps and schemas are copies', () => {
  store.resolveFieldMap('annex-d-drainage', 'ed01').fields = null;
  assert.ok(store.resolveFieldMap('annex-d-drainage', 'ed01').fields);
  store.loadSchema('annex-d-drainage').sections = null;
  assert.ok(store.loadSchema('annex-d-drainage').sections);
});

test('accepts ArrayBuffer PDFs (the Worker manifest imports .bin as ArrayBuffer)', () => {
  const pdf = sources.basePdfs['annex-d-drainage-ed01.pdf'];
  const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
  const s = createFormStore({
    fieldMaps: { 'annex-d-drainage-ed01': sources.fieldMaps['annex-d-drainage-ed01'] },
    basePdfs: { 'annex-d-drainage-ed01.pdf': ab },
    schemas: {},
  });
  const bytes = s.readApprovedBasePdf(s.resolveFieldMap('annex-d-drainage'));
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, pdf.length);
});
