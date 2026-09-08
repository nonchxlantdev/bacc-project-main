import baccLogoUrl from '../assets/brand/bacc-logo.webp';
import baccLogoPngUrl from '../assets/brand/bacc-logo.png';
import pgiaLogoUrl from '../assets/brand/pgia-logo.webp';
import pgiaLogoPngUrl from '../assets/brand/PGIA_logo.png';
import loginBgWebpUrl from '../assets/brand/login-bg.webp';
import loginBgJpgUrl from '../assets/brand/login-bg.jpg';
import loginBgSmWebpUrl from '../assets/brand/login-bg-sm.webp';

const cache = new Map();

export async function urlToDataUri(url) {
  if (!url) return '';
  if (String(url).startsWith('data:')) return url;
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUri = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  cache.set(url, dataUri);
  return dataUri;
}

export async function getBrandDataUris() {
  const [bacc, pgia] = await Promise.all([
    urlToDataUri(baccLogoPngUrl),
    urlToDataUri(pgiaLogoPngUrl),
  ]);
  return { bacc, pgia };
}

export {
  baccLogoUrl,
  baccLogoPngUrl,
  pgiaLogoUrl,
  pgiaLogoPngUrl,
  loginBgWebpUrl,
  loginBgJpgUrl,
  loginBgSmWebpUrl,
};
