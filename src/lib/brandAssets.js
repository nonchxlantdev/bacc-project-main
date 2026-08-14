import baccLogoUrl from '../assets/brand/BACC_logo.jpeg';
import pgiaLogoUrl from '../assets/brand/PGIA_logo.png';

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
    urlToDataUri(baccLogoUrl),
    urlToDataUri(pgiaLogoUrl),
  ]);
  return { bacc, pgia };
}

export { baccLogoUrl, pgiaLogoUrl };
