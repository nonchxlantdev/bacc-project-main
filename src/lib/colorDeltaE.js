/**
 * sRGB → OKLab and ΔE (OKLab ×100). Used to validate categorical palettes
 * for color-vision deficiency; do not eyeball chart hues.
 */

function srgbToLinear(channel) {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToOklab({ r, g, b }) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const L = Math.cbrt(l);
  const M = Math.cbrt(m);
  const S = Math.cbrt(s);
  return {
    L: 0.2104542553 * L + 0.793617785 * M - 0.0040720468 * S,
    a: 1.9779984951 * L - 2.428592205 * M + 0.4505937099 * S,
    b: 0.0259040371 * L + 0.7827717662 * M - 0.808675766 * S,
  };
}

/** ΔE in OKLab scaled ×100 (spec target: adjacent CVD ≥ 8, normal ≥ 15). */
export function deltaEOklab(hexA, hexB) {
  const a = rgbToOklab(parseHex(hexA));
  const b = rgbToOklab(parseHex(hexB));
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return 100 * Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Machado et al. 2009 simulation matrices (sRGB, mild/complete CVD).
 * Applied in linear RGB, then converted back through sRGB for OKLab ΔE.
 */
const CVD_MATRICES = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function linearToSrgb(v) {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return clampByte(c * 255);
}

export function simulateCvd(hex, kind) {
  const { r, g, b } = parseHex(hex);
  const rgb = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const m = CVD_MATRICES[kind];
  const out = [0, 1, 2].map((i) => m[i][0] * rgb[0] + m[i][1] * rgb[1] + m[i][2] * rgb[2]);
  const rr = linearToSrgb(out[0]);
  const gg = linearToSrgb(out[1]);
  const bb = linearToSrgb(out[2]);
  return `#${[rr, gg, bb].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function adjacentPairs(colors) {
  const pairs = [];
  for (let i = 0; i < colors.length - 1; i += 1) {
    pairs.push([colors[i], colors[i + 1], i, i + 1]);
  }
  return pairs;
}

/**
 * @param {string[]} colors  hex list in assigned (not ranked) order
 * @param {string} surface   chart background
 * @returns {{ ok: boolean, failures: object[], report: object[] }}
 */
export function validateCategoricalPalette(colors, surface = '#F3F6FA') {
  const kinds = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
  const report = [];
  const failures = [];
  const sim = (hex, kind) => (kind === 'normal' ? hex : simulateCvd(hex, kind));

  for (const kind of kinds) {
    const minAdjacent = kind === 'normal' ? 15 : 8;
    for (const [a, b, i, j] of adjacentPairs(colors)) {
      const de = deltaEOklab(sim(a, kind), sim(b, kind));
      const row = { kind, i, j, a, b, deltaE: +de.toFixed(2), min: minAdjacent };
      report.push(row);
      if (de < minAdjacent) failures.push({ ...row, reason: 'adjacent' });
    }
    for (const color of colors) {
      const de = deltaEOklab(sim(color, kind), sim(surface, kind));
      const minSurface = kind === 'normal' ? 20 : 12;
      const row = { kind, color, surface, deltaE: +de.toFixed(2), min: minSurface };
      report.push(row);
      if (de < minSurface) failures.push({ ...row, reason: 'surface' });
    }
  }

  return { ok: failures.length === 0, failures, report };
}
