import { clientRole } from './clientRole.js';

/** Posts a crash to the portal. Returns a reference, or null if the post failed. */
export async function reportClientError({ message, stack, componentStack, fetchImpl } = {}) {
  const body = {
    message: String(message ?? '').slice(0, 1000),
    stack: String(stack ?? '').slice(0, 4096),
    componentStack: String(componentStack ?? '').slice(0, 2048),
    route: typeof location !== 'undefined' ? `${location.pathname}${location.search}` : '',
    build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '',
    role: clientRole(),
    ua: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 300) : '',
  };
  try {
    const send = fetchImpl ?? fetch;
    const res = await send('/api/client-error', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.ref ?? null;
  } catch {
    return null;
  }
}
