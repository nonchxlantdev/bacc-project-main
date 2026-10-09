import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStoredSignature,
  selfSignoffRole,
  shouldShowSignaturePrompt,
} from '../src/lib/storedSignature.js';

// The person filling the form is always the FIRST sign-off block, whatever the
// annex calls it ("inspector", "responsible", "cec", …) — see
// selfSignoffRole() in src/lib/storedSignature.js.
const SCHEMA_WITH_INSPECTOR = {
  signoffs: [{ role: 'inspector', label: 'Inspector' }, { role: 'om_acknowledgment', label: 'OM' }],
};

const SCHEMA_WITH_RESPONSIBLE = {
  signoffs: [{ role: 'responsible', label: 'Responsible' }],
};

const SCHEMA_WITHOUT_SIGNOFFS = { signoffs: [] };

test('selfSignoffRole is the first sign-off block, whatever it is called', () => {
  assert.equal(selfSignoffRole(SCHEMA_WITH_INSPECTOR), 'inspector');
  assert.equal(selfSignoffRole(SCHEMA_WITH_RESPONSIBLE), 'responsible');
  assert.equal(selfSignoffRole(SCHEMA_WITHOUT_SIGNOFFS), null);
  assert.equal(selfSignoffRole(undefined), null);
});

test('shouldShowSignaturePrompt on editable drafts with a self sign-off', () => {
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
      profile: {},
      schema: SCHEMA_WITH_RESPONSIBLE,
      readOnly: false,
    }),
    true,
  );
  assert.equal(
    shouldShowSignaturePrompt({
      record: { status: 'draft' },
      profile: {},
      schema: SCHEMA_WITHOUT_SIGNOFFS,
      readOnly: false,
    }),
    false,
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

test('applyStoredSignature fills the self sign-off only', () => {
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

test('applyStoredSignature works for annexes whose self role is not "inspector"', () => {
  const next = applyStoredSignature({
    record: { schema: SCHEMA_WITH_RESPONSIBLE, signoffs: [] },
    profile: { stored_signature_data_uri: 'data:image/png;base64,abc' },
    displayName: 'Display',
    position: 'Pos',
  });
  assert.equal(next.signoffs.length, 1);
  assert.equal(next.signoffs[0].role, 'responsible');
  assert.equal(next.signoffs[0].signature_data_uri, 'data:image/png;base64,abc');
});

test('applyStoredSignature is a no-op without a stored signature or any sign-off block', () => {
  const record = { schema: SCHEMA_WITHOUT_SIGNOFFS, signoffs: [] };
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
