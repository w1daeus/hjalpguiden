// QR-kodgenerator i ren ESM utan beroenden.
//
// Trogen port av det som behövs ur Nayukis "QR Code generator library"
// (https://www.nayuki.io/page/qr-code-generator-library, MIT-licens):
// byte-läge (UTF-8), felkorrigering L/M/Q/H, version 1–40, automatiskt
// maskval med straffpoäng, Reed–Solomon över GF(256) med polynomet 0x11D,
// format- och versionsinformation med BCH-koder, remainder bits och
// sammanflätning av block. Alfanumeriskt/numeriskt/kanji-läge och
// ECC-höjning är medvetet utelämnade.

// Felkorrigeringsnivåer: ordinal = index i tabellerna, formatBits = de två
// bitarna i formatinformationen.
const ECC = {
  L: { namn: "L", ordinal: 0, formatBits: 1 },
  M: { namn: "M", ordinal: 1, formatBits: 0 },
  Q: { namn: "Q", ordinal: 2, formatBits: 3 },
  H: { namn: "H", ordinal: 3, formatBits: 2 },
};

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Vikter för straffpoäng vid maskval (ISO/IEC 18004 §7.8.3).
const STRAFF_N1 = 3;
const STRAFF_N2 = 3;
const STRAFF_N3 = 40;
const STRAFF_N4 = 10;

// Antal ECC-kodord per block, index [ecc.ordinal][version]. Index 0 används inte.
const ECC_KODORD_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Antal felkorrigeringsblock, index [ecc.ordinal][version]. Index 0 används inte.
const ANTAL_ECC_BLOCK = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// Bit i (0 = minst signifikant) i x.
const getBit = (x, i) => ((x >>> i) & 1) !== 0;

function nivaFor(ecc) {
  const niva = ECC[String(ecc).toUpperCase()];
  if (!niva) throw new RangeError(`Okänd felkorrigeringsnivå: ${ecc} (använd L, M, Q eller H)`);
  return niva;
}

// Antal datamoduler i en QR-kod av given version, utan hänsyn till ECC
// (alla moduler som inte är funktionsmönster).
export function antalRaModuler(version) {
  if (version < MIN_VERSION || version > MAX_VERSION) throw new RangeError("Version utanför 1–40");
  let resultat = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const antalAlign = Math.floor(version / 7) + 2;
    resultat -= (25 * antalAlign - 10) * antalAlign - 55;
    if (version >= 7) resultat -= 36;
  }
  return resultat;
}

// Antal 8-bitars datakodord som får plats i given version och ECC-nivå.
export function antalDataKodord(version, ecc) {
  const niva = nivaFor(ecc);
  return Math.floor(antalRaModuler(version) / 8)
    - ECC_KODORD_PER_BLOCK[niva.ordinal][version] * ANTAL_ECC_BLOCK[niva.ordinal][version];
}

// ---- Reed–Solomon över GF(256), reducerande polynom x^8+x^4+x^3+x^2+1 (0x11D) ----

// Produkt av två fältelement.
export function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

// Generatorpolynomet (x-α^0)(x-α^1)…(x-α^(grad-1)) utan den ledande ettan,
// högsta grad först.
export function rsGenerator(grad) {
  if (grad < 1 || grad > 255) throw new RangeError("Ogiltig grad");
  const resultat = new Array(grad - 1).fill(0);
  resultat.push(1);
  let rot = 1;
  for (let i = 0; i < grad; i++) {
    for (let j = 0; j < resultat.length; j++) {
      resultat[j] = gfMultiply(resultat[j], rot);
      if (j + 1 < resultat.length) resultat[j] ^= resultat[j + 1];
    }
    rot = gfMultiply(rot, 0x02);
  }
  return resultat;
}

// Resten vid polynomdivision av data med generatorn = ECC-kodorden.
export function rsRemainder(data, generator) {
  const resultat = new Array(generator.length).fill(0);
  for (const b of data) {
    const faktor = b ^ resultat.shift();
    resultat.push(0);
    generator.forEach((koef, i) => { resultat[i] ^= gfMultiply(koef, faktor); });
  }
  return resultat;
}

// ---- Straffpoäng för en modulmatris (används vid maskval) ----

// Räknar straffpoäng för en kvadratisk boolesk matris enligt ISO 18004.
export function straffpoang(modules) {
  const size = modules.length;
  let resultat = 0;

  // Rader och kolumner: långa löpningar av samma färg samt finder-liknande mönster.
  const addHistoria = (langd, historia) => {
    if (historia[0] === 0) langd += size; // kanten räknas som ljus marginal
    historia.pop();
    historia.unshift(langd);
  };
  const raknaMonster = (h) => {
    const n = h[1];
    const karna = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (karna && h[0] >= n * 4 && h[6] >= n ? 1 : 0)
      + (karna && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const avslutaOchRakna = (farg, langd, historia) => {
    if (farg) { addHistoria(langd, historia); langd = 0; }
    langd += size;
    addHistoria(langd, historia);
    return raknaMonster(historia);
  };
  const skannaLinje = (hamta) => {
    let farg = false;
    let langd = 0;
    const historia = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < size; i++) {
      if (hamta(i) === farg) {
        langd++;
        if (langd === 5) resultat += STRAFF_N1;
        else if (langd > 5) resultat++;
      } else {
        addHistoria(langd, historia);
        if (!farg) resultat += raknaMonster(historia) * STRAFF_N3;
        farg = hamta(i);
        langd = 1;
      }
    }
    resultat += avslutaOchRakna(farg, langd, historia) * STRAFF_N3;
  };
  for (let y = 0; y < size; y++) skannaLinje((x) => modules[y][x]);
  for (let x = 0; x < size; x++) skannaLinje((y) => modules[y][x]);

  // 2×2-block av samma färg.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const f = modules[y][x];
      if (f === modules[y][x + 1] && f === modules[y + 1][x] && f === modules[y + 1][x + 1]) resultat += STRAFF_N2;
    }
  }

  // Balans mellan mörkt och ljust.
  let morka = 0;
  for (const rad of modules) for (const m of rad) if (m) morka++;
  const total = size * size;
  const k = Math.ceil(Math.abs(morka * 20 - total * 10) / total) - 1;
  resultat += k * STRAFF_N4;
  return resultat;
}

// ---- Själva QR-koden ----

class QrKod {
  constructor(version, niva, dataKodord) {
    this.version = version;
    this.niva = niva;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));

    this.ritaFunktionsmonster();
    const allaKodord = this.laggTillEccOchFlata(dataKodord);
    this.ritaKodord(allaKodord);

    // Prova alla åtta masker, välj den med lägst straffpoäng.
    let mask = -1;
    let minsta = Infinity;
    for (let i = 0; i < 8; i++) {
      this.applyMask(i);
      this.ritaFormatBitar(i);
      const poang = straffpoang(this.modules);
      if (poang < minsta) { mask = i; minsta = poang; }
      this.applyMask(i); // XOR är sin egen invers
    }
    this.mask = mask;
    this.applyMask(mask);
    this.ritaFormatBitar(mask);
    this.isFunction = null;
  }

  setFunktionsmodul(x, y, mork) {
    this.modules[y][x] = mork;
    this.isFunction[y][x] = true;
  }

  ritaFunktionsmonster() {
    // Timing patterns.
    for (let i = 0; i < this.size; i++) {
      this.setFunktionsmodul(6, i, i % 2 === 0);
      this.setFunktionsmodul(i, 6, i % 2 === 0);
    }
    // Finder patterns i tre hörn (inkl. separatorer).
    this.ritaFinder(3, 3);
    this.ritaFinder(this.size - 4, 3);
    this.ritaFinder(3, this.size - 4);
    // Alignment patterns, utom de tre som krockar med finder-mönstren.
    const pos = this.alignmentPositioner();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.ritaAlignment(pos[i], pos[j]);
      }
    }
    // Reservera plats för format- och versionsinformation.
    this.ritaFormatBitar(0);
    this.ritaVersion();
  }

  // 15 bitar: 2 bitar ECC + 3 bitar mask + 10 bitar BCH, XOR med 0x5412.
  ritaFormatBitar(mask) {
    const data = (this.niva.formatBits << 3) | mask;
    let rest = data;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bitar = ((data << 10) | rest) ^ 0x5412;

    // Första kopian runt övre vänstra finder-mönstret.
    for (let i = 0; i <= 5; i++) this.setFunktionsmodul(8, i, getBit(bitar, i));
    this.setFunktionsmodul(8, 7, getBit(bitar, 6));
    this.setFunktionsmodul(8, 8, getBit(bitar, 7));
    this.setFunktionsmodul(7, 8, getBit(bitar, 8));
    for (let i = 9; i < 15; i++) this.setFunktionsmodul(14 - i, 8, getBit(bitar, i));

    // Andra kopian: övre högra och nedre vänstra hörnet.
    for (let i = 0; i < 8; i++) this.setFunktionsmodul(this.size - 1 - i, 8, getBit(bitar, i));
    for (let i = 8; i < 15; i++) this.setFunktionsmodul(8, this.size - 15 + i, getBit(bitar, i));
    this.setFunktionsmodul(8, this.size - 8, true); // "dark module"
  }

  // 18 bitar versionsinformation (6 bitar version + 12 bitar BCH), bara version ≥ 7.
  ritaVersion() {
    if (this.version < 7) return;
    let rest = this.version;
    for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const bitar = (this.version << 12) | rest;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bitar, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunktionsmodul(a, b, bit);
      this.setFunktionsmodul(b, a, bit);
    }
  }

  // 9×9-område (7×7 mönster + ljus separator) runt (x, y), klipps vid kanten.
  ritaFinder(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const avst = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunktionsmodul(xx, yy, avst !== 2 && avst !== 4);
        }
      }
    }
  }

  // 5×5 alignment pattern runt (x, y).
  ritaAlignment(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunktionsmodul(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  // Centrumkoordinater för alignment patterns längs en axel.
  alignmentPositioner() {
    if (this.version === 1) return [];
    const antal = Math.floor(this.version / 7) + 2;
    const steg = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (antal * 2 - 2)) * 2;
    const resultat = [6];
    for (let pos = this.size - 7; resultat.length < antal; pos -= steg) resultat.splice(1, 0, pos);
    return resultat;
  }

  // Delar data i block, räknar ECC per block och flätar samman till en sekvens.
  laggTillEccOchFlata(data) {
    const ver = this.version;
    const ordinal = this.niva.ordinal;
    const antalBlock = ANTAL_ECC_BLOCK[ordinal][ver];
    const eccLangd = ECC_KODORD_PER_BLOCK[ordinal][ver];
    const raKodord = Math.floor(antalRaModuler(ver) / 8);
    const antalKorta = antalBlock - (raKodord % antalBlock);
    const kortLangd = Math.floor(raKodord / antalBlock);

    const block = [];
    const generator = rsGenerator(eccLangd);
    for (let i = 0, k = 0; i < antalBlock; i++) {
      const dat = data.slice(k, k + kortLangd - eccLangd + (i < antalKorta ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, generator);
      if (i < antalKorta) dat.push(0); // utfyllnad så alla block får samma längd
      block.push(dat.concat(ecc));
    }

    const resultat = [];
    for (let i = 0; i < block[0].length; i++) {
      block.forEach((b, j) => {
        // Hoppa över utfyllnadsbyten i de korta blocken.
        if (i !== kortLangd - eccLangd || j >= antalKorta) resultat.push(b[i]);
      });
    }
    return resultat;
  }

  // Placerar kodorden i sicksack, två kolumner i taget, från höger till vänster.
  ritaKodord(data) {
    let i = 0;
    for (let hoger = this.size - 1; hoger >= 1; hoger -= 2) {
      if (hoger === 6) hoger = 5; // hoppa över den lodräta timing-kolumnen
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = hoger - j;
          const uppat = ((hoger + 1) & 2) === 0;
          const y = uppat ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
          // Övriga moduler (remainder bits) lämnas ljusa.
        }
      }
    }
  }

  // XOR:ar datamodulerna med maskmönstret.
  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invertera;
        switch (mask) {
          case 0: invertera = (x + y) % 2 === 0; break;
          case 1: invertera = y % 2 === 0; break;
          case 2: invertera = x % 3 === 0; break;
          case 3: invertera = (x + y) % 3 === 0; break;
          case 4: invertera = (Math.floor(x / 2) + Math.floor(y / 3)) % 2 === 0; break;
          case 5: invertera = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invertera = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invertera = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new RangeError("Ogiltig mask");
        }
        if (!this.isFunction[y][x] && invertera) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
}

// Antal bitar i teckenräknaren för byte-läge.
const teckenRaknarBitar = (version) => (version <= 9 ? 8 : 16);

// Lägger till de n lägsta bitarna i varde, mest signifikant först.
function appendBits(buffert, varde, n) {
  for (let i = n - 1; i >= 0; i--) buffert.push((varde >>> i) & 1);
}

// Kodar text (UTF-8, byte-läge) till en QR-kod med minsta version som rymmer den.
// Returnerar { version, size, ecc, mask, modules } där modules[rad][kolumn]
// är true för mörk modul. Ingen tyst zon ingår.
export function encodeText(text, ecc = "M") {
  const niva = nivaFor(ecc);
  const bytes = new TextEncoder().encode(String(text));

  let version = MIN_VERSION;
  for (;;) {
    const kapacitet = antalDataKodord(version, niva.namn) * 8;
    const behov = 4 + teckenRaknarBitar(version) + bytes.length * 8;
    if (behov <= kapacitet) break;
    if (version >= MAX_VERSION) throw new RangeError("Texten är för lång för att rymmas i en QR-kod");
    version++;
  }

  const kapacitet = antalDataKodord(version, niva.namn) * 8;
  const bitar = [];
  appendBits(bitar, 0x4, 4); // lägesindikator: byte
  appendBits(bitar, bytes.length, teckenRaknarBitar(version));
  for (const b of bytes) appendBits(bitar, b, 8);
  appendBits(bitar, 0, Math.min(4, kapacitet - bitar.length)); // terminator
  appendBits(bitar, 0, (8 - (bitar.length % 8)) % 8); // fyll till hel byte
  for (let pad = 0xec; bitar.length < kapacitet; pad ^= 0xec ^ 0x11) appendBits(bitar, pad, 8);

  const dataKodord = new Array(bitar.length / 8).fill(0);
  bitar.forEach((bit, i) => { dataKodord[i >>> 3] |= bit << (7 - (i & 7)); });

  const qr = new QrKod(version, niva, dataKodord);
  return { version: qr.version, size: qr.size, ecc: niva.namn, mask: qr.mask, modules: qr.modules };
}

const escapeXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Renderar en QR-kod som SVG. viewBox uttrycks i moduler och inkluderar en
// tyst zon på `marginal` moduler runt om; `modul` är pixelstorleken per modul
// i width/height. Mörka moduler ritas som en enda <path>.
export function toSvg(qr, { modul = 4, marginal = 4, farg = "#000", bakgrund = "#fff", titel = "" } = {}) {
  const bredd = qr.size + marginal * 2;
  const px = bredd * modul;
  const delar = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) delar.push(`M${x + marginal} ${y + marginal}h1v1h-1z`);
    }
  }
  const title = titel ? `<title>${escapeXml(titel)}</title>` : "";
  const rect = bakgrund ? `<rect width="${bredd}" height="${bredd}" fill="${escapeXml(bakgrund)}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${bredd} ${bredd}" shape-rendering="crispEdges"${titel ? ' role="img"' : ' aria-hidden="true"'}>`
    + title + rect
    + `<path d="${delar.join(" ")}" fill="${escapeXml(farg)}"/></svg>`;
}
