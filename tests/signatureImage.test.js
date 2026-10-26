import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { cropSignatureToInk } from '../server/signatureImage.js';

function pngBytes(width, height, paint) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  paint(png);
  return PNG.sync.write(png);
}

test('a signature is cropped to its ink so blank canvas does not survive', async () => {
  const bytes = pngBytes(320, 96, (png) => {
    for (let x = 24; x < 90; x += 1) {
      const y = 30 + Math.round(Math.sin(x / 6) * 8);
      const i = (png.width * y + x) << 2;
      png.data[i] = 11;
      png.data[i + 1] = 30;
      png.data[i + 2] = 61;
    }
  });
  const cropped = PNG.sync.read(Buffer.from(await cropSignatureToInk(bytes)));
  assert.ok(cropped.width < 100, `width ${cropped.width} still includes the blank pad`);
  assert.ok(cropped.height < 40, `height ${cropped.height} still includes the blank pad`);
  assert.ok(cropped.width > 50);
  assert.ok(cropped.height > 10);
});

test('a signature that already fills its canvas is left alone', async () => {
  const bytes = pngBytes(40, 16, (png) => {
    for (let i = 0; i < png.data.length; i += 4) png.data[i] = 0;
  });
  const cropped = await cropSignatureToInk(bytes);
  assert.equal(cropped, bytes);
});
