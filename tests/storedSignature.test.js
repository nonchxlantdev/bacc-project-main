import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStoredSignature,
  schemaHasInspectorSignoff,
  shouldShowSignaturePrompt,
} from '../src/lib/storedSignature.js';

const SCHEMA_WITH_INSPECTOR = {
  signoffs: [{ role: 'inspector', label: 'Inspector' }, { role: 'om_acknowledgment', label: 'OM' }],
};

const SCHEMA_WITHOUT_INSPECTOR = {
  signoffs: [{ role: 'responsible', label: 'Responsible' }],
};

test('schemaHasInspectorSignoff recognises inspector blocks', () => {
  assert.equal(schemaHasInspectorSignoff(SCHEMA_WITH_INSPECTOR), true);
  assert.equal(schemaHasInspectorSignoff(SCHEMA_WITHOUT_INSPECTOR), false);
});

test('shouldShowSignaturePrompt on editable drafts with inspector sign-off', () => {
  assert.equal(
    shouldShowSignaturePrompt({
      record: { status: 'draft' },
      profile: {},
      schema: SCHEMA_WITH_INSPECTOR,
      readOnly: false,
    }),
    true,
  );
  assert.equal(
    shouldShowSignaturePrompt({
      record: { status: 'draft' },
      profile: { hide_signature_prompt: true },
      schema: SCHEMA_WITH_INSPECTOR,
      readOnly: false,
    }),
    false,
  );
  assert.equal(
    shouldShowSignaturePrompt({
      record: { status: 'submitted' },
      profile: {},
      schema: SCHEMA_WITH_INSPECTOR,
      readOnly: true,
    }),
    false,
  );
});

test('applyStoredSignature fills inspector only', () => {
  const record = {
    schema: SCHEMA_WITH_INSPECTOR,
    signoffs: [{ role: 'om_acknowledgment', name: 'OM', position: 'Mgr', signature_data_uri: null }],
  };
  const next = applyStoredSignature({
    record,
    profile: { stored_signature_data_uri: 'data:image/png;base64,abc', full_name: 'A', position: 'B' },
    displayName: 'Display',
    position: 'Pos',
  });
  assert.equal(next.signoffs.length, 2);
  const inspector = next.signoffs.find((s) => s.role === 'inspector');
  assert.equal(inspector.signature_data_uri, 'data:image/png;base64,abc');
  assert.equal(inspector.name, 'Display');
  assert.equal(inspector.position, 'Pos');
  assert.ok(inspector.signed_at);
  assert.equal(next.signoffs.find((s) => s.role === 'om_acknowledgment')?.name, 'OM');
});

test('applyStoredSignature is a no-op without stored signature or inspector role', () => {
  const record = { schema: SCHEMA_WITHOUT_INSPECTOR, signoffs: [] };
  assert.equal(
    applyStoredSignature({ record, profile: { stored_signature_data_uri: 'data:x' }, displayName: 'X', position: 'Y' }),
    record,
  );
  assert.equal(
    applyStoredSignature({
      record: { schema: SCHEMA_WITH_INSPECTOR, signoffs: [] },
      profile: {},
      displayName: 'X',
      position: 'Y',
    }).signoffs.length,
    0,
  );
});
