import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateUser } from '../api/create-user.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' };
const valid = { email: 'new@bacc.bz', password: 'longenough1', full_name: 'New Person' };

test('503 when the service role key is not configured', async () => {
  await assert.rejects(buildCreateUser(valid, { env: { SUPABASE_URL: env.SUPABASE_URL } }), (e) => e.status === 503);
});

test('400 for each invalid field, before any network call', async () => {
  const cases = [
    { ...valid, email: 'not-an-email' },
    { ...valid, password: 'short' },
    { ...valid, full_name: '   ' },
    { ...valid, role: 'superuser' },
    { ...valid, department: 'Finance' },
  ];
  for (const body of cases) {
    await assert.rejects(buildCreateUser(body, { env }), (e) => e.status === 400, JSON.stringify(body));
  }
});
