import { readFileSync, writeFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'src/assets/forms/annex-d-drainage-ed01.pdf';
const data = new Uint8Array(readFileSync(pdfPath));
const doc = await getDocument({ data, disableWorker: true }).promise;

const pages = [];
for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.map((item) => ({
    str: item.str,
    x: Math.round(item.transform[4] * 10) / 10,
    y: Math.round(item.transform[5] * 10) / 10,
    w: Math.round((item.width ?? 0) * 10) / 10,
    h: Math.round((item.height ?? 0) * 10) / 10,
  }));
  pages.push({
    page: i - 1,
    width: viewport.width,
    height: viewport.height,
    items,
  });
}

writeFileSync('tmp-pdf-text-coords.json', JSON.stringify(pages, null, 2));
console.log(pages.map((p) => `page ${p.page} ${p.width}x${p.height} items=${p.items.length}`).join('\n'));
