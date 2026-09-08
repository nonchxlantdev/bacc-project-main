import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'src', 'assets', 'brand');
const bgSrc = join(root, 'src', 'img', 'website background.png');

mkdirSync(brand, { recursive: true });

async function out(name, pipeline) {
  const dest = join(brand, name);
  await pipeline.toFile(dest);
  console.log(`${name}: ${(statSync(dest).size / 1024).toFixed(1)} KB`);
}

await out(
  'login-bg.webp',
  sharp(bgSrc).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 78 }),
);
await out(
  'login-bg.jpg',
  sharp(bgSrc).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }),
);
await out(
  'login-bg-sm.webp',
  sharp(bgSrc).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 72 }),
);
await out(
  'bacc-logo.webp',
  sharp(join(brand, 'BACC_logo.jpeg')).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 88 }),
);
await out(
  'bacc-logo.png',
  sharp(join(brand, 'BACC_logo.jpeg')).resize({ width: 480, withoutEnlargement: true }).png({ compressionLevel: 9 }),
);
await out(
  'pgia-logo.webp',
  sharp(join(brand, 'PGIA_logo.png')).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 88 }),
);

console.log('done');
