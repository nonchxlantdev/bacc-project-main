import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTERSIGN_MESSAGES,
  applyCountersignerSignature,
  apronCountersignApplies,
  conductedByName,
  countersignerSubmitMessage,
  loadEdair,
} from '../src/lib/countersigner.js';

const CODES = ['PGIA-PMM-F02', 'PGIA-PMM-F05', 'PGIA-PMM-F06', 'PGIA-PMM-F10'];
const EDAIR = {
  id: 'edair',
  email: 'edelacruz@pgiabelize.com',
  full_name: 'Edair de la Cruz',
  is_active: true,
  stored_signature_data_uri: 'data:image/png;base64,edair',
};

test('Apron Supervisor conducted-by name pairs Edair on the four forms only', () => {
  for (const code of CODES) {
    assert.equal(apronCountersignApplies('apron_supervisor', code), true);
    assert.equal(conductedByName({ role: 'apron_supervisor', templateCode: code, displayName: 'Andy Chable' }), 'Andy Chable / Edair de la Cruz');
    assert.equal(conductedByName({ role: 'om', templateCode: code, displayName: 'Shamira Young' }), 'Shamira Young');
  }
  assert.equal(apronCountersignApplies('apron_supervisor', 'PGIA-PMM-F01'), false);
  assert.equal(conductedByName({ role: 'apron_supervisor', templateCode: 'PGIA-PMM-F01', displayName: 'Andy Chable' }), 'Andy Chable');
});

test('loadEdair uses the email account, then a single name match, and ignores the mock fallback', async () => {
  const byEmail = await loadEdair({
    getByEmail: async () => ({ ...EDAIR, stored_signature_data_uri: null }),
    list: async () => [],
    getById: async () => EDAIR,
  });
  assert.equal(byEmail.state, 'ready');
  assert.equal(byEmail.signatureUri, EDAIR.stored_signature_data_uri);

  const byName = await loadEdair({
    getByEmail: async () => ({ id: 'someone-else', email: 'other@example.com', full_name: 'Other', is_active: true }),
    list: async () => [{ id: 'edair', email: 'new@example.com', full_name: '  edair   de la cruz ', is_active: true }],
    getById: async (id) => ({ ...EDAIR, id, email: 'new@example.com' }),
  });
  assert.equal(byName.state, 'ready');
  assert.equal(byName.user.email, 'new@example.com');

  const twoNames = await loadEdair({
    getByEmail: async () => null,
    list: async () => [
      { id: 'a', full_name: 'Edair de la Cruz', is_active: true },
      { id: 'b', full_name: 'Edair de la Cruz', is_active: true },
    ],
    getById: async () => {
      throw new Error('should not guess');
    },
  });
  assert.equal(twoNames.state, 'missing-account');

  const unsigned = await loadEdair({
    getByEmail: async () => ({ ...EDAIR, stored_signature_data_uri: null }),
    list: async () => [],
    getById: async () => ({ ...EDAIR, stored_signature_data_uri: null }),
  });
  assert.equal(unsigned.state, 'missing-signature');
  assert.equal(unsigned.signatureUri, null);

  const failed = await loadEdair({
    getByEmail: async () => {
      throw new Error('offline');
    },
    list: async () => [],
    getById: async () => null,
  });
  assert.equal(failed.state, 'error');
});

test('submit keeps the paired name and refuses an empty countersignature', () => {
  const schema = { signoffs: [{ role: 'inspector' }] };
  const record = {
    schema,
    header: { date: '2026-10-28' },
    signoffs: [{ role: 'om', name: 'OM' }],
  };
  const stamped = applyCountersignerSignature({
    record,
    signatureDataUri: EDAIR.stored_signature_data_uri,
    name: 'Andy Chable / Edair de la Cruz',
    position: 'Apron Supervisor',
  });
  const self = stamped.signoffs.find((s) => s.role === 'inspector');
  assert.equal(self.name, 'Andy Chable / Edair de la Cruz');
  assert.equal(self.position, 'Apron Supervisor');
  assert.equal(self.signature_data_uri, EDAIR.stored_signature_data_uri);
  assert.equal(self.sign_date, '2026-10-28');
  assert.equal(stamped.signoffs.find((s) => s.role === 'om')?.name, 'OM');

  assert.equal(
    countersignerSubmitMessage({ applies: true, signatureDataUri: null, loadState: 'ready' }),
    COUNTERSIGN_MESSAGES.submitEmpty,
  );
  assert.equal(
    countersignerSubmitMessage({ applies: true, signatureDataUri: null, loadState: 'missing-signature' }),
    COUNTERSIGN_MESSAGES.missingSignature,
  );
  assert.equal(
    countersignerSubmitMessage({ applies: true, signatureDataUri: 'data:image/png;base64,edair', loadState: 'error' }),
    null,
  );
  assert.equal(countersignerSubmitMessage({ applies: false, signatureDataUri: null, loadState: 'ready' }), null);
});
