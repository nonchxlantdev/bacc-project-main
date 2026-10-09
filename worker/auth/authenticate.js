/**
 * One authenticate() for every /api route.
 *
 * Until sub-project 3, production users still hold Supabase sessions, so the
 * existing export/instance routes run in mode 'either': a D1 session cookie
 * wins when present, otherwise the Supabase bearer token is checked exactly
 * as before. Sub-project 3 removes the Supabase branch.
 */
import { HttpError, requireUser } from '../../api/_shared.js';
import { authServiceFor } from './routes.js';
import { readSessionCookie, sessionCookie } from './session.js';

export function createAuthenticator({ serviceFor = authServiceFor, supabaseAuth = requireUser } = {}) {
  return async function authenticate(request, env, auth = {}) {
    const mode = auth.mode ?? 'either';
    if (mode === 'public') return null;
    if (mode === 'supabase') return supabaseAuth(request, env, auth);

    const token = readSessionCookie(request);
    if (mode === 'session' || token) {
      const { user, sessionId, renewed } = await serviceFor(env).authenticateSession(token);
      if (auth.roles?.length && !auth.roles.includes(user.role)) {
        throw new HttpError(403, 'Forbidden for this role');
      }
      if (user.must_change_password && !auth.allowPasswordChangePending) {
        throw new HttpError(403, 'Password change required', 'PASSWORD_CHANGE_REQUIRED');
      }
      return { user, profile: user, sessionId, setCookie: renewed ? sessionCookie(token) : undefined };
    }
    return supabaseAuth(request, env, auth);
  };
}
