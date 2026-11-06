// Ritar PNG-ikoner för hemskärm och manifest från samma form som src/icon.svg, utan beroenden.
// Rastrering: 4×4 översampling per pixel, PNG via node:zlib. Körs vid behov med `npm run icons`;
// resultatet (src/icons/*.png) checkas in.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ut = path.join(root, "src", "icons");
mkdirSync(ut, { recursive: true });

const BLA = [0x17, 0x36, 0x5d], VIT = [0xff, 0xff, 0xff];
// Huset från icon.svg (koordinater i 64×64): M32 12 12 30h6v20h12V38h4v12h12V30h6z
const HUS = [[32, 12], [12, 30], [18, 30], [18, 50], [30, 50], [30, 38], [34, 38], [34, 50], [46, 50], [46, 30], [52, 30]];

function iPolygon(x, y, pts) {
  let inne = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

function iRundadRekt(x, y, r) {
  if (x < 0 || y < 0 || x > 64 || y > 64) return false;
  const cx = x < r ? r : x > 64 - r ? 64 - r : x;
  const cy = y < r ? r : y > 64 - r ? 64 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** storlek i px, helBakgrund: hela ytan blå (för iOS och maskable), skala: husets storlek relativt ytan */
function rita(storlek, { helBakgrund = false, skala = 1 } = {}) {
  const rgba = Buffer.alloc(storlek * storlek * 4);
  const SS = 4;
  for (let py = 0; py < storlek; py++) {
    for (let px = 0; px < storlek; px++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / storlek) * 64, y = ((py + (sy + 0.5) / SS) / storlek) * 64;
          const hx = 32 + (x - 32) / skala, hy = 32 + (y - 32) / skala;
          if (helBakgrund || iRundadRekt(x, y, 12)) { bg++; if (iPolygon(hx, hy, HUS)) fg++; }
        }
      }
      const n = SS * SS, i = (py * storlek + px) * 4;
      const tack = bg / n, hus = fg / n;
      // Blandning: bakgrund blå, hus vitt, utanför transparent
      const farg = [0, 1, 2].map((k) => (bg ? (BLA[k] * (bg - fg) + VIT[k] * fg) / bg : 0));
      rgba[i] = Math.round(farg[0]); rgba[i + 1] = Math.round(farg[1]); rgba[i + 2] = Math.round(farg[2]);
      rgba[i + 3] = Math.round(255 * tack);
      void hus;
    }
  }
  return rgba;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(typ, data) {
  const t = Buffer.from(typ, "latin1"), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(storlek, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(storlek, 0); ihdr.writeUInt32BE(storlek, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rader = Buffer.alloc(storlek * (storlek * 4 + 1));
  for (let y = 0; y < storlek; y++) { rader[y * (storlek * 4 + 1)] = 0; rgba.copy(rader, y * (storlek * 4 + 1) + 1, y * storlek * 4, (y + 1) * storlek * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rader, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const filer = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-512-maskable.png", 512, { helBakgrund: true, skala: 0.7 }],
  ["apple-touch-icon.png", 180, { helBakgrund: true, skala: 0.85 }],
];
for (const [namn, storlek, val] of filer) {
  const data = png(storlek, rita(storlek, val));
  writeFileSync(path.join(ut, namn), data);
  console.log(`✓ ${namn} (${storlek}px, ${(data.length / 1024).toFixed(1)} KB)`);
}
