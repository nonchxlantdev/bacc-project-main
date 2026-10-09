/**
 * True when the portal uses the Cloudflare (D1) login.
 * In sub-project 2 this pairs D1 login with mock data — getDataSource()
 * still maps anything but 'supabase' to the mock repositories.
 */
export function isD1Auth() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) === 'd1';
}
