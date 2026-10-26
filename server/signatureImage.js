/**
 * Crop a signature PNG to the ink, so the overlay can scale the handwriting
 * onto the printed line instead of the blank canvas around it.
 *
 * Canvas pads are 320×96 or 480×160 with the stroke often occupying a corner.
 * Scaling that whole image into a signature slot leaves a speck. This keeps
 * only the dark pixels (plus a hair of padding) and returns a new PNG.
 * Anything it cannot read — an unexpected colour type, interlacing, a bad
 * stream — comes back unchanged.
 */

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(bytes, offset) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const signed = new Uint8Array(4 + data.length);
  signed.set(out.subarray(4, 8), 0);
  signed.set(data, 4);
  view.setUint32(8 + data.length, crc32(signed));
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const out = new Uint8Array(height * stride);
  let i = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[i];
    i += 1;
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[i];
      i += 1;
      const left = x >= channels ? out[rowStart + x - channels] : 0;
      const up = y > 0 ? out[prevStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[prevStart + x - channels] : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + ((left + up) >> 1);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) return null;
      out[rowStart + x] = decoded & 255;
    }
  }
  return out;
}

function isInk(pixels, index, channels) {
  const r = pixels[index];
  const g = channels > 1 ? pixels[index + 1] : r;
  const b = channels > 2 ? pixels[index + 2] : r;
  const a = channels === 4 ? pixels[index + 3] : 255;
  if (a < 24) return false;
  return r < 248 || g < 248 || b < 248;
}

function inkBounds(pixels, width, height, channels) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInk(pixels, (y * width + x) * channels, channels)) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1 };
}

function encodePng(pixels, width, height, channels) {
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), dest + 1);
  }
  return raw;
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function cropSignatureToInk(bytes) {
  try {
    if (!bytes || bytes.length < 8 || !SIG.every((b, i) => bytes[i] === b)) return bytes;
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];
    while (offset + 8 <= bytes.length) {
      const length = u32(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        width = u32(data, 0);
        height = u32(data, 4);
        bitDepth = data[8];
        colorType = data[9];
        interlace = data[12];
      } else if (type === 'IDAT') {
        idat.push(data);
      } else if (type === 'IEND') break;
      offset += 12 + length;
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
    if (!channels || bitDepth !== 8 || interlace !== 0 || !width || !height) return bytes;
    const raw = await inflate(concat(idat));
    const pixels = unfilter(raw, width, height, channels);
    if (!pixels) return bytes;
    const bounds = inkBounds(pixels, width, height, channels);
    if (!bounds) return bytes;
    const pad = 2;
    const x0 = Math.max(0, bounds.x0 - pad);
    const y0 = Math.max(0, bounds.y0 - pad);
    const x1 = Math.min(width - 1, bounds.x1 + pad);
    const y1 = Math.min(height - 1, bounds.y1 + pad);
    const cropW = x1 - x0 + 1;
    const cropH = y1 - y0 + 1;
    if (cropW >= width - 1 && cropH >= height - 1) return bytes;
    const cropped = new Uint8Array(cropW * cropH * channels);
    for (let y = 0; y < cropH; y += 1) {
      const src = ((y0 + y) * width + x0) * channels;
      cropped.set(pixels.subarray(src, src + cropW * channels), y * cropW * channels);
    }
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, cropW);
    view.setUint32(4, cropH);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    const compressed = await deflate(encodePng(cropped, cropW, cropH, channels));
    return concat([
      new Uint8Array(SIG),
      chunk('IHDR', ihdr),
      chunk('IDAT', compressed),
      chunk('IEND', new Uint8Array(0)),
    ]);
  } catch {
    return bytes;
  }
}
