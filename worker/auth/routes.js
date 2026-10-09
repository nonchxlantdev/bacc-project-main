/**
 * The /api/auth/* and /api/users/* endpoints. Thin: validation and rules
 * live in service.js and permissions.js.
 */
import { HttpError } from '../../api/_shared.js';
import { clearedSessionCookie, sessionCookie } from './session.js';
import { createAuthService } from './service.js';
import { createD1AuthStore } from './store.js';

export function authServiceFor(env) {
  if (!env?.DB) throw new HttpError(503, 'Login database is not configured');
  return createAuthService({ store: createD1AuthStore(env.DB) });
}

function jsonResponse(status, payload, { setCookie } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers });
}

const SESSION_PENDING_OK = { mode: 'session', allowPasswordChangePending: true };
const MANAGERS_ONLY = { mode: 'session', roles: ['admin', 'om'] };

export const AUTH_ROUTES = {
  '/api/auth/login': {
    kind: 'response',
    csrf: true,
    auth: { mode: 'public' },
    limit: 20,
    build: async (body, { env, request }) => {
      const { user, token } = await authServiceFor(env).login({
        email: body.email,
        password: body.password,
        ip: request.headers.get('cf-connecting-ip'),
        userAgent: request.headers.get('user-agent'),
      });
      return jsonResponse(200, { user }, { setCookie: sessionCookie(token) });
    },
  },
  '/api/auth/logout': {
    kind: 'response',
    csrf: true,
    auth: SESSION_PENDING_OK,
    build: async (_body, { env, user: auth }) => {
      await authServiceFor(env).logout(auth.sessionId);
      return jsonResponse(204, null, { setCookie: clearedSessionCookie() });
    },
  },
  '/api/auth/me': {
    kind: 'json',
    methods: ['GET'],
    auth: SESSION_PENDING_OK,
    build: async (_body, { user: auth }) => ({ user: auth.user }),
  },
  '/api/auth/change-password': {
    kind: 'json',
    csrf: true,
    auth: SESSION_PENDING_OK,
    limit: 10,
    build: async (body, { env, user: auth }) => ({
      user: await authServiceFor(env).changePassword({
        userId: auth.user.id,
        sessionId: auth.sessionId,
        current_password: body.current_password,
        new_password: body.new_password,
      }),
    }),
  },
  '/api/users': {
    kind: 'json',
    methods: ['GET'],
    auth: MANAGERS_ONLY,
    build: async (_body, { env, user: auth }) => ({ users: await authServiceFor(env).listUsers(auth.user) }),
  },
  '/api/users/create': {
    kind: 'response',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 30,
    build: async (body, { env, user: auth }) => jsonResponse(201, await authServiceFor(env).createUser(auth.user, body)),
  },
  '/api/users/update': {
    kind: 'json',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 60,
    build: async (body, { env, user: auth }) => ({ user: await authServiceFor(env).updateUser(auth.user, body) }),
  },
  '/api/users/reset-password': {
    kind: 'json',
    csrf: true,
    auth: MANAGERS_ONLY,
    limit: 30,
    build: async (body, { env, user: auth }) => authServiceFor(env).resetPassword(auth.user, { id: body.id }),
  },
};
