import { test } from "node:test";
import assert from "node:assert/strict";
import { status, isOpenAt, passForDatum, plusDagar, veckodag, DAGAR } from "../lib/opening-hours.js";

// UTC-instant. Stockholm är UTC+1 (CET) i december.
const utc = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min));
const tomVecka = () => Object.fromEntries(DAGAR.map((d) => [d, []]));
const alla = (pass) => Object.fromEntries(DAGAR.map((d) => [d, pass]));
const plats = (tider, extra = {}) => ({ oppettider: { ...tomVecka(), ...tider }, sasong: null, helgdagar: null, undantag: [], ...extra });

// 2026-12-24 julafton = torsdag, 12-25 juldagen = fredag, 12-26 annandag jul = lördag, 12-28 = måndag.
const vardagar = Object.fromEntries(["man", "tis", "ons", "tor", "fre"].map((d) => [d, [{ fran: "08:00", till: "15:00" }]]));

test("datumhjälpare: plusDagar och veckodag", () => {
  assert.equal(plusDagar("2026-12-31", 1), "2027-01-01");
  assert.equal(plusDagar("2026-03-01", -1), "2026-02-28");
  assert.equal(veckodag("2026-11-09"), 0); // måndag
  assert.equal(veckodag("2026-12-25"), 4); // fredag
  assert.equal(veckodag("2026-12-27"), 6); // söndag
});

test("helgdagar: stangt gör platsen stängd på juldagen och nästa öppning hoppar över helgen", () => {
  const p = plats(vardagar, { helgdagar: "stangt" });
  const s = status(p, utc(2026, 12, 25, 9, 0)); // fre 10:00 CET
  assert.equal(s.lage, "stangt");
  assert.equal(s.helgdag, "juldagen");
  assert.equal(s.regel, "stangt");
  assert.equal(s.helgdagOsaker, false);
  assert.deepEqual(s.oppnar, { dag: "man", tid: "08:00", omDagar: 3, datum: "2026-12-28" });
  // Torsdag 17 dec är en vanlig dag
  const v = status(p, utc(2026, 12, 17, 9, 0));
  assert.equal(v.lage, "oppet");
  assert.equal(v.helgdag, null);
  assert.equal(v.regel, null);
});

test("helgdagar: som-sondag använder söndagens pass", () => {
  const p = plats({ ...vardagar, son: [{ fran: "12:00", till: "14:00" }] }, { helgdagar: "som-sondag" });
  assert.equal(isOpenAt(p, utc(2026, 12, 25, 9, 0)), false); // 10:00, vardagspasset gäller inte
  assert.equal(isOpenAt(p, utc(2026, 12, 25, 12, 0)), true); // 13:00, söndagspasset gäller
  assert.equal(status(p, utc(2026, 12, 25, 12, 0)).regel, "som-sondag");
  const bara = plats(vardagar, { helgdagar: "som-sondag" }); // stängt söndagar → stängt helgdag
  assert.equal(isOpenAt(bara, utc(2026, 12, 25, 9, 0)), false);
});

test("helgdagar: ordinarie följer veckoschemat utan varning", () => {
  const s = status(plats(vardagar, { helgdagar: "ordinarie" }), utc(2026, 12, 25, 9, 0));
  assert.equal(s.lage, "oppet");
  assert.equal(s.regel, "ordinarie");
  assert.equal(s.helgdagOsaker, false);
});

test("helgdagar: null (okänt) följer veckoschemat men flaggar osäkert, aldrig stängt utan källa", () => {
  const s = status(plats(vardagar), utc(2026, 12, 25, 9, 0));
  assert.equal(s.lage, "oppet");
  assert.equal(s.helgdag, "juldagen");
  assert.equal(s.regel, "okant");
  assert.equal(s.helgdagOsaker, true);
  // Stängd dag enligt schemat: fortfarande osäker-flagga, för den som vill ringa
  const lor = status(plats(vardagar), utc(2026, 12, 26, 9, 0));
  assert.equal(lor.lage, "stangt");
  assert.equal(lor.helgdagOsaker, true);
});

test("undantag går före både helgdagsregel och veckoschema", () => {
  const p = plats(vardagar, {
    helgdagar: "stangt",
    undantag: [
      { fran: "2026-12-24", till: "2026-12-24", pass: [{ fran: "09:00", till: "12:00" }] }, // julafton: kortare
      { fran: "2026-12-28", till: "2027-01-03", pass: [] }, // mellandagarna: stängt
    ],
  });
  assert.equal(isOpenAt(p, utc(2026, 12, 24, 9, 0)), true);   // julafton 10:00
  assert.equal(isOpenAt(p, utc(2026, 12, 24, 12, 0)), false); // julafton 13:00
  assert.equal(status(p, utc(2026, 12, 24, 9, 0)).regel, "undantag");
  assert.equal(status(p, utc(2026, 12, 24, 9, 0)).helgdagOsaker, false);
  assert.equal(isOpenAt(p, utc(2026, 12, 29, 9, 0)), false);  // tisdag i mellandagarna
  assert.equal(isOpenAt(p, utc(2027, 1, 4, 9, 0)), true);     // måndag 4 jan: öppet igen
  // Nästa öppning från julafton eftermiddag hoppar över jul, helg och mellandagarna
  assert.deepEqual(status(p, utc(2026, 12, 24, 13, 0)).oppnar, { dag: "man", tid: "08:00", omDagar: 11, datum: "2027-01-04" });
});

test("pass över midnatt respekterar helgdagsregeln för dagen passet börjar", () => {
  const natt = plats({ ...alla([{ fran: "21:00", till: "07:00" }]) }, { helgdagar: "stangt" });
  // Natten mot juldagen: julafton (tor) är helgdag och stängd, så 02:00 fredag är stängt
  assert.equal(isOpenAt(natt, utc(2026, 12, 25, 1, 0)), false);
  // Natten mot 23 dec: tisdag 22 dec är vanlig, så 02:00 onsdag är öppet
  assert.equal(isOpenAt(natt, utc(2026, 12, 23, 1, 0)), true);
  // Undantag på en kväll gäller passet som börjar då
  const u = plats({ ...alla([{ fran: "21:00", till: "07:00" }]) }, { undantag: [{ fran: "2026-11-10", till: "2026-11-10", pass: [] }] });
  assert.equal(isOpenAt(u, utc(2026, 11, 11, 1, 0)), false); // natten efter tis 10 nov
  assert.equal(isOpenAt(u, utc(2026, 11, 10, 1, 0)), true);  // natten efter mån 9 nov
});

test("passForDatum: okända öppettider med helgdag", () => {
  const p = { oppettider: null, sasong: null, helgdagar: null, undantag: [] };
  assert.equal(status(p, utc(2026, 12, 25, 9, 0)).lage, "okant");
  assert.equal(status(p, utc(2026, 12, 25, 9, 0)).helgdag, "juldagen");
  assert.deepEqual(passForDatum(p, "2026-12-25"), { pass: [], regel: "okant", helgdag: "juldagen" });
  // Gamla poster utan fälten fungerar som förut
  assert.equal(isOpenAt({ oppettider: { ...tomVecka(), ...vardagar }, sasong: null }, utc(2026, 11, 9, 9, 0)), true);
});
