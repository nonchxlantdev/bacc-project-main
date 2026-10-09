/**
 * Browser client for the Cloudflare login (VITE_DATA_SOURCE=d1).
 * Same-origin fetch: the HttpOnly session cookie travels automatically and
 * is never visible to page scripts.
 */
async function call(path, { method = 'POST', body } = {}) {
  const init = { method, credentials: 'same-origin' };
  if (method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(path, init);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export const authClient = {
  login: async (email, password) => (await call('/api/auth/login', { body: { email, password } })).user,
  logout: async () => {
    await call('/api/auth/logout');
  },
  me: async () => {
    try {
      return (await call('/api/auth/me', { method: 'GET' })).user;
    } catch (err) {
      if (err.status === 401) return null;
      throw err;
    }
  },
  changePassword: async (current_password, new_password) =>
    (await call('/api/auth/change-password', { body: { current_password, new_password } })).user,
};

export const usersAdminClient = {
  list: async () => (await call('/api/users', { method: 'GET' })).users,
  create: async (input) => call('/api/users/create', { body: input }),
  update: async (input) => (await call('/api/users/update', { body: input })).user,
  resetPassword: async (id) => (await call('/api/users/reset-password', { body: { id } })).temporary_password,
};
