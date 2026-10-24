import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../worker/http.js';
import { CLIENT_ERROR_ROUTE, buildClientError } from '../worker/clientError.js';

test('client-error is public, same-origin JSON, and 30 per minute', () => {
  assert.equal(CLIENT_ERROR_ROUTE.auth.mode, 'public');
  assert.equal(CLIENT_ERROR_ROUTE.csrf, true);
  assert.equal(CLIENT_ERROR_ROUTE.limit, 30);
  assert.deepEqual(CLIENT_ERROR_ROUTE.methods, ['POST']);
});

test('a crash report logs a reference and drops anything that is not a crash field', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(line);
  try {
    const result = await buildClientError({
      message: 'This screen hit an error',
      stack: 'Error: boom\n at Page',
      componentStack: '\n at Checklist',
      route: '/checklists/abc',
      build: 'abc1234',
      role: 'inspector',
      ua: 'TestAgent',
      email: 'person@example.com',
      formData: { name: 'should not be logged' },
    });
    assert.match(result.ref, /^[a-f0-9]{8}$/);
    const logged = JSON.parse(lines.at(-1));
    assert.equal(logged.level, 'error');
    assert.equal(logged.source, 'client');
    assert.equal(logged.ref, result.ref);
    assert.equal(logged.message, 'This screen hit an error');
    assert.equal(logged.role, 'inspector');
    assert.equal(logged.email, undefined);
    assert.equal(logged.formData, undefined);
    assert.equal(JSON.stringify(logged).includes('person@example.com'), false);
    assert.equal(JSON.stringify(logged).includes('should not be logged'), false);
  } finally {
    console.error = original;
  }
});

test('a body over 8 KB is refused', async () => {
  await assert.rejects(
    () => buildClientError({ message: 'x'.repeat(9000) }),
    (err) => err.status === 413,
  );
});

test('the route requires a same-origin JSON post', async () => {
  const handle = createApiHandler({
    routes: { '/api/client-error': CLIENT_ERROR_ROUTE },
    forms: {},
    authenticate: async () => { throw new Error('public route must not authenticate'); },
  });
  const blocked = await handle(new Request('https://bacc.visionforgestudio.app/api/client-error', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'cf-connecting-ip': '203.0.113.9',
    },
    body: JSON.stringify({ message: 'x' }),
  }), {});
  assert.equal(blocked.status, 403);

  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(line);
  try {
    const ok = await handle(new Request('https://bacc.visionforgestudio.app/api/client-error', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://bacc.visionforgestudio.app',
        'cf-connecting-ip': '203.0.113.10',
      },
      body: JSON.stringify({ message: 'from the browser' }),
    }), {});
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.match(body.ref, /^[a-f0-9]{8}$/);
  } finally {
    console.error = original;
  }
});
