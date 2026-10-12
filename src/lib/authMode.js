/**
 * True when the portal uses the Cloudflare (D1) login. Since sub-project 3a
 * this also means the D1 data API (getDataSource() === 'd1'); see dataMode.js.
 */
export function isD1Auth() {
  return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DATA_SOURCE) === 'd1';
}
