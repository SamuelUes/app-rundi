/**
 * Genera src/assets/images/splash-icon.png
 *
 * Extrae la "R" dorada de icon.png con alpha-matting: convierte el fondo
 * teal del icono en transparencia, recupera el color real de los bordes
 * anti-alias del glifo y recorta al bounding box con padding.
 *
 * Uso: node scripts/generate-splash-icon.cjs
 * Requiere: pngjs (ya presente como dependencia transitiva en node_modules)
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src/assets/images/icon.png');
const OUT = path.join(ROOT, 'src/assets/images/splash-icon.png');

// Fondo teal del icono (muestreado) y umbrales del matte
const BG = [44, 60, 67];
const T0 = 18; // distancia <= T0 -> fondo puro (transparente)
const T1 = 110; // distancia >= T1 -> glifo puro (opaco)
const ALPHA_CUT = 0.08; // alpha menor -> 0 (elimina speckles del fondo)
const CORE = 0.6; // alpha minimo para considerar px "nucleo" del glifo (bbox)
const PAD = 14; // padding transparente alrededor del glifo

const dist = (d, i) =>
  Math.sqrt(
    (d[i] - BG[0]) ** 2 + (d[i + 1] - BG[1]) ** 2 + (d[i + 2] - BG[2]) ** 2
  );

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: w, height: h, data: d } = png;

// Pasada 1: alpha matte + un-premultiply de color
const alphas = new Float32Array(w * h);
let minX = w, maxX = 0, minY = h, maxY = 0;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const p = y * w + x;
    const srcA = d[i + 3] / 255;
    if (srcA === 0) continue;

    const dd = dist(d, i);
    const matteA = Math.min(1, Math.max(0, (dd - T0) / (T1 - T0)));
    let a = srcA * matteA;
    if (a < ALPHA_CUT) a = 0;
    alphas[p] = a;

    if (a >= CORE) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (a === 0) {
      d[i + 3] = 0;
      continue;
    }
    // Recupera el color real del glifo en bordes mezclados con el fondo
    for (let c = 0; c < 3; c++) {
      const unmixed = (d[i + c] - BG[c] * (1 - matteA)) / Math.max(matteA, 1e-3);
      d[i + c] = Math.min(255, Math.max(0, Math.round(unmixed)));
    }
    d[i + 3] = Math.round(a * 255);
  }
}

// Canvas cuadrado centrado en el glifo: el plugin compone la imagen dentro
// de un box cuadrado por plataforma; con asset cuadrado, iOS y Android
// renderizan el glifo al mismo tamaño relativo.
const glyphW = maxX - minX + 1;
const glyphH = maxY - minY + 1;
const side = Math.max(glyphW, glyphH) + PAD * 2;
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
minX = Math.max(0, Math.round(cx - side / 2));
minY = Math.max(0, Math.round(cy - side / 2));
maxX = Math.min(w - 1, minX + side - 1);
maxY = Math.min(h - 1, minY + side - 1);
minX = Math.max(0, maxX - side + 1);
minY = Math.max(0, maxY - side + 1);

const outW = maxX - minX + 1;
const outH = maxY - minY + 1;
const out = new PNG({ width: outW, height: outH });

for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const si = ((minY + y) * w + (minX + x)) * 4;
    const di = (y * outW + x) * 4;
    out.data[di] = d[si];
    out.data[di + 1] = d[si + 1];
    out.data[di + 2] = d[si + 2];
    out.data[di + 3] = d[si + 3];
  }
}

fs.writeFileSync(OUT, PNG.sync.write(out));
console.log(`splash-icon.png generado: ${outW}x${outH}`);
