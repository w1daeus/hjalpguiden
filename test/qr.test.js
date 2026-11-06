import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeText, toSvg, gfMultiply, rsGenerator, rsRemainder, straffpoang, antalDataKodord,
} from "../lib/qr.js";

// 40 tecken: sajtens URL + språkkod.
const URL = "https://w1daeus.github.io/hjalpguiden/sv";

// Mörk = "#", ljus = ".". Gör testerna lättlästa.
const rad = (qr, y, x0, n) => qr.modules[y].slice(x0, x0 + n).map((m) => (m ? "#" : ".")).join("");
const kol = (qr, x, y0, n) => qr.modules.slice(y0, y0 + n).map((r) => (r[x] ? "#" : ".")).join("");

const FINDER = ["#######", "#.....#", "#.###.#", "#.###.#", "#.###.#", "#.....#", "#######"];
const ALIGNMENT = ["#####", "#...#", "#.#.#", "#...#", "#####"];

// Rest vid division av ett 15-bitars tal med BCH-generatorn x^10+x^8+x^5+x^4+x^2+x+1.
function bchRest15(v) {
  let r = v;
  for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
  return r;
}
// Rest vid division av ett 18-bitars tal med generatorn 0x1F25.
function bchRest18(v) {
  let r = v;
  for (let i = 17; i >= 12; i--) if ((r >>> i) & 1) r ^= 0x1f25 << (i - 12);
  return r;
}

// Läser de 15 formatbitarna ur första kopian (runt övre vänstra finder-mönstret),
// bit 0 = minst signifikant.
function lasFormat1(qr) {
  const m = qr.modules;
  const bit = [];
  for (let i = 0; i <= 5; i++) bit[i] = m[i][8];
  bit[6] = m[7][8];
  bit[7] = m[8][8];
  bit[8] = m[8][7];
  for (let i = 9; i < 15; i++) bit[i] = m[8][14 - i];
  return bit.reduce((acc, b, i) => acc | ((b ? 1 : 0) << i), 0);
}
// Andra kopian: övre högra + nedre vänstra hörnet.
function lasFormat2(qr) {
  const m = qr.modules;
  const s = qr.size;
  const bit = [];
  for (let i = 0; i < 8; i++) bit[i] = m[8][s - 1 - i];
  for (let i = 8; i < 15; i++) bit[i] = m[s - 15 + i][8];
  return bit.reduce((acc, b, i) => acc | ((b ? 1 : 0) << i), 0);
}

const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

test("storlek: version 1 = 21, version 2 = 25, 40 tecken med ECC M = version 3 (29×29)", () => {
  const v1 = encodeText("a".repeat(14)); // 4 + 8 + 112 = 124 bitar ≤ 128
  assert.equal(v1.version, 1);
  assert.equal(v1.size, 21);
  assert.equal(v1.modules.length, 21);
  assert.ok(v1.modules.every((r) => r.length === 21));

  const v2 = encodeText("a".repeat(15)); // 132 bitar > 128, ≤ 224
  assert.equal(v2.version, 2);
  assert.equal(v2.size, 25);

  assert.equal(URL.length, 40);
  const v3 = encodeText(URL, "M");
  assert.equal(v3.version, 3);
  assert.equal(v3.size, 29);
  assert.equal(v3.ecc, "M");
});

test("kapacitetstabellen stämmer med kända värden ur ISO 18004", () => {
  assert.equal(antalDataKodord(1, "L"), 19);
  assert.equal(antalDataKodord(1, "M"), 16);
  assert.equal(antalDataKodord(1, "Q"), 13);
  assert.equal(antalDataKodord(1, "H"), 9);
  assert.equal(antalDataKodord(2, "M"), 28);
  assert.equal(antalDataKodord(3, "M"), 44);
  assert.equal(antalDataKodord(7, "L"), 156);
  assert.equal(antalDataKodord(10, "M"), 216);
  assert.equal(antalDataKodord(40, "L"), 2956);
  assert.equal(antalDataKodord(40, "H"), 1276);
});

test("för lång text och okänd ECC-nivå ger fel", () => {
  assert.throws(() => encodeText("a".repeat(3000), "M"), RangeError);
  assert.throws(() => encodeText("abc", "X"), RangeError);
});

test("finder patterns i tre hörn och ljusa separatorer", () => {
  for (const qr of [encodeText("ab"), encodeText(URL), encodeText("a".repeat(200), "H")]) {
    const s = qr.size;
    for (const [y0, x0] of [[0, 0], [0, s - 7], [s - 7, 0]]) {
      for (let i = 0; i < 7; i++) assert.equal(rad(qr, y0 + i, x0, 7), FINDER[i], `finder (${y0},${x0}) rad ${i}`);
    }
    // Separatorer (rad/kolumn 7 resp. size-8) är ljusa.
    assert.equal(rad(qr, 7, 0, 8), "........");
    assert.equal(kol(qr, 7, 0, 8), "........");
    assert.equal(rad(qr, 7, s - 8, 8), "........");
    assert.equal(kol(qr, s - 8, 0, 8), "........");
    assert.equal(rad(qr, s - 8, 0, 8), "........");
    assert.equal(kol(qr, 7, s - 8, 8), "........");
  }
});

test("timing patterns på rad 6 och kolumn 6 alternerar mellan finder-mönstren", () => {
  for (const qr of [encodeText("ab"), encodeText(URL), encodeText("a".repeat(200), "H")]) {
    for (let i = 8; i < qr.size - 8; i++) {
      assert.equal(qr.modules[6][i], i % 2 === 0, `rad 6 kolumn ${i}`);
      assert.equal(qr.modules[i][6], i % 2 === 0, `kolumn 6 rad ${i}`);
    }
  }
});

test("dark module vid (4*version+9, 8) är mörk", () => {
  for (const qr of [encodeText("ab"), encodeText(URL), encodeText("a".repeat(200), "H")]) {
    assert.equal(qr.modules[4 * qr.version + 9][8], true);
  }
});

test("alignment pattern i version 2 ligger centrerat på (18,18)", () => {
  const qr = encodeText("a".repeat(15));
  assert.equal(qr.version, 2);
  for (let i = 0; i < 5; i++) assert.equal(rad(qr, 16 + i, 16, 5), ALIGNMENT[i]);
});

test("formatinformationen är en giltig BCH(15,5)-kod och kodar ECC-nivå och mask", () => {
  for (const ecc of ["L", "M", "Q", "H"]) {
    for (const text of ["ab", URL, "a".repeat(120)]) {
      const qr = encodeText(text, ecc);
      const f1 = lasFormat1(qr);
      const f2 = lasFormat2(qr);
      assert.equal(f1, f2, "båda kopiorna av formatinformationen ska vara lika");
      const avmaskad = f1 ^ 0x5412;
      assert.equal(bchRest15(avmaskad), 0, "BCH-resten ska vara 0");
      assert.equal(avmaskad >>> 13, FORMAT_BITS[ecc], `ECC-bitar för ${ecc}`);
      assert.equal((avmaskad >>> 10) & 7, qr.mask, "mask i formatinfo ska vara den rapporterade");
      assert.ok(qr.mask >= 0 && qr.mask <= 7);
    }
  }
});

test("versionsinformation (version ≥ 7) är en giltig BCH(18,6)-kod i båda kopiorna", () => {
  const qr = encodeText("a".repeat(400), "M");
  assert.ok(qr.version >= 7);
  const s = qr.size;
  let v1 = 0;
  let v2 = 0;
  for (let i = 0; i < 18; i++) {
    const a = s - 11 + (i % 3);
    const b = Math.floor(i / 3);
    v1 |= (qr.modules[b][a] ? 1 : 0) << i;
    v2 |= (qr.modules[a][b] ? 1 : 0) << i;
  }
  assert.equal(v1, v2);
  assert.equal(bchRest18(v1), 0);
  assert.equal(v1 >>> 12, qr.version);
});

test("GF(256): grundläggande multiplikation", () => {
  assert.equal(gfMultiply(0, 123), 0);
  assert.equal(gfMultiply(1, 123), 123);
  assert.equal(gfMultiply(2, 128), 0x1d); // x·x^7 = x^8 ≡ x^4+x^3+x^2+1
  // α = 2 är primitiv: α^1..α^255 är distinkta och α^255 = 1.
  const sedda = new Set();
  let p = 1;
  for (let i = 0; i < 255; i++) { p = gfMultiply(p, 2); sedda.add(p); }
  assert.equal(p, 1);
  assert.equal(sedda.size, 255);
  // Kommutativ.
  for (let a = 1; a < 256; a += 37) for (let b = 1; b < 256; b += 53) assert.equal(gfMultiply(a, b), gfMultiply(b, a));
});

test("Reed–Solomon: generatorpolynomet för grad 7 är det kända", () => {
  // Känt värde (ISO 18004 bilaga A): x^7 + α^87x^6 + α^229x^5 + α^146x^4 + α^149x^3 + α^238x^2 + α^102x + α^21.
  const kand = [1, 127, 122, 154, 164, 11, 68, 117];
  assert.deepEqual([1, ...rsGenerator(7)], kand);

  // Härled oberoende: multiplicera ihop (x - α^i) för i = 0..6 med egen GF-multiplikation (log-tabeller).
  const exp = new Array(512);
  const log = new Array(256);
  for (let i = 0, v = 1; i < 255; i++) {
    exp[i] = v;
    log[v] = i;
    v <<= 1;
    if (v & 0x100) v ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);
  let poly = [1];
  for (let i = 0; i < 7; i++) {
    const nytt = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      nytt[j] ^= poly[j];
      nytt[j + 1] ^= mul(poly[j], exp[i]); // koefficienten för -α^i (= α^i i karakteristik 2)
    }
    poly = nytt;
  }
  assert.deepEqual(poly, kand);
  // Samma för grad 10 jämfört med biblioteket.
  for (const grad of [10, 13, 30]) {
    let p = [1];
    for (let i = 0; i < grad; i++) {
      const nytt = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) { nytt[j] ^= p[j]; nytt[j + 1] ^= mul(p[j], exp[i]); }
      p = nytt;
    }
    assert.deepEqual(p.slice(1), rsGenerator(grad));
  }
});

test("Reed–Solomon: resten för ett känt datablock och delbarhet med generatorn", () => {
  // Klassiskt exempel (version 1-M, "HELLO WORLD" i alfanumeriskt läge): 16 datakodord, 10 ECC-kodord.
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const ecc = rsRemainder(data, rsGenerator(10));
  assert.deepEqual(ecc, [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);

  // Kodordet data‖ecc ska ha α^0..α^9 som nollställen.
  const kodord = data.concat(ecc);
  let alfa = 1;
  for (let i = 0; i < 10; i++) {
    let v = 0;
    for (const k of kodord) v = gfMultiply(v, alfa) ^ k; // Horner
    assert.equal(v, 0, `α^${i} ska vara nollställe`);
    alfa = gfMultiply(alfa, 2);
  }
});

test("straffpoäng: helt ljus matris och schackmönster ger kända värden", () => {
  const n = 21;
  const ljus = Array.from({ length: n }, () => new Array(n).fill(false));
  // Rader+kolumner: 42 löpningar à 21 → 42·(3+16); 2×2-block: 20·20·3; balans: k=9 → 90.
  assert.equal(straffpoang(ljus), 42 * 19 + 400 * 3 + 90);
  const schack = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x + y) % 2 === 0));
  assert.equal(straffpoang(schack), 0);
});

test("deterministisk: samma indata ger samma matris", () => {
  const a = encodeText(URL);
  const b = encodeText(URL);
  assert.deepEqual(a, b);
});

test("olika texter ger olika matriser", () => {
  const a = encodeText(URL);
  const b = encodeText("https://w1daeus.github.io/hjalpguiden/en");
  assert.equal(a.size, b.size);
  assert.notDeepEqual(a.modules, b.modules);
  // UTF-8: åäö ska ge fler byte än tecken och ändå gå att koda.
  const c = encodeText("Hjälpguiden Stockholm – åäö");
  assert.ok(c.size >= 21);
});

test("toSvg ger en SVG med viewBox i moduler inkl. tyst zon och en enda path", () => {
  const v1 = toSvg(encodeText("ab"), { modul: 1, marginal: 4 });
  assert.ok(v1.startsWith("<svg"));
  assert.ok(v1.includes('viewBox="0 0 29 29"')); // 21 + 2·4
  assert.ok(v1.includes('shape-rendering="crispEdges"'));
  assert.equal((v1.match(/<path/g) || []).length, 1);
  assert.ok(/d="M\d+ \d+h1v1h-1z( M\d+ \d+h1v1h-1z)*"/.test(v1));
  assert.ok(!v1.includes("class="));
  assert.ok(!v1.includes("http://") || v1.includes('xmlns="http://www.w3.org/2000/svg"'));

  // Version 3 (sajtens URL): 29 + 2·4 = 37.
  const v3 = toSvg(encodeText(URL), { modul: 4, marginal: 4, farg: "#111" });
  assert.ok(v3.includes('viewBox="0 0 37 37"'));
  assert.ok(v3.includes('width="148" height="148"')); // 37 · 4
  assert.ok(v3.includes('fill="#111"'));
  // Första mörka modulen är finder-hörnet, förskjutet med marginalen.
  assert.ok(v3.includes('d="M4 4h1v1h-1z'));

  // Ingen marginal, ingen bakgrund, titel escapas.
  const naken = toSvg(encodeText("ab"), { modul: 1, marginal: 0, bakgrund: null, titel: "A & B" });
  assert.ok(naken.includes('viewBox="0 0 21 21"'));
  assert.ok(!naken.includes("<rect"));
  assert.ok(naken.includes("<title>A &amp; B</title>"));
});
