import { test } from "node:test";
import assert from "node:assert/strict";
import { status, isOpenAt, iSasong, localParts, nastaOppning, dagarSedan, DAGAR } from "../lib/opening-hours.js";

// Hjälpare: UTC-instant. Stockholm är UTC+1 (CET) på vintern och UTC+2 (CEST) på sommaren.
const utc = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min));
const tomVecka = () => Object.fromEntries(DAGAR.map((d) => [d, []]));
const plats = (tider, extra = {}) => ({ oppettider: { ...tomVecka(), ...tider }, sasong: null, ...extra });

test("lokal tid: vinter (CET) och sommar (CEST) ger rätt veckodag och klockslag", () => {
  // 2026-11-09 är en måndag. 09:00 UTC = 10:00 CET
  let p = localParts(utc(2026, 11, 9, 9, 0));
  assert.equal(p.dag, 0);
  assert.equal(p.minuter, 10 * 60);
  // 2026-07-06 är en måndag. 09:00 UTC = 11:00 CEST
  p = localParts(utc(2026, 7, 6, 9, 0));
  assert.equal(p.dag, 0);
  assert.equal(p.minuter, 11 * 60);
  // 23:30 UTC söndag 8 nov = 00:30 måndag lokalt
  p = localParts(utc(2026, 11, 8, 23, 30));
  assert.equal(p.dag, 0);
  assert.equal(p.minuter, 30);
});

test("vanlig dag: öppet inom passet, stängt utanför, sluttid exklusiv", () => {
  const p = plats({ man: [{ fran: "08:00", till: "15:00" }] });
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 7, 0)), true);   // 08:00 CET
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 13, 59)), true); // 14:59
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 14, 0)), false); // 15:00
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 6, 59)), false); // 07:59
  assert.equal(isOpenAt(p, utc(2026, 11, 10, 9, 0)), false); // tisdag
});

test("över midnatt: sön 21:00–07:00 täcker sön kväll och mån natt", () => {
  const p = plats({ son: [{ fran: "21:00", till: "07:00" }] });
  assert.equal(isOpenAt(p, utc(2026, 11, 8, 19, 59)), false); // sön 20:59
  assert.equal(isOpenAt(p, utc(2026, 11, 8, 20, 0)), true);   // sön 21:00
  assert.equal(isOpenAt(p, utc(2026, 11, 8, 22, 30)), true);  // sön 23:30
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 2, 0)), true);    // mån 03:00
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 5, 59)), true);   // mån 06:59
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 6, 0)), false);   // mån 07:00
  assert.equal(isOpenAt(p, utc(2026, 11, 9, 20, 0)), false);  // mån 21:00 (bara söndagar)
  const s = status(p, utc(2026, 11, 9, 2, 0));
  assert.equal(s.lage, "oppet");
  assert.equal(s.stanger, "07:00");
  assert.equal(s.kvarMinuter, 240);
});

test("över midnatt: stänger snart och kvarvarande minuter räknas över dygnsgränsen", () => {
  const p = plats({ fre: [{ fran: "22:00", till: "01:00" }] });
  const s = status(p, utc(2026, 11, 13, 22, 45)); // fre 23:45 CET
  assert.equal(s.lage, "oppet");
  assert.equal(s.kvarMinuter, 75);
  assert.equal(s.stangerSnart, false);
  const s2 = status(p, utc(2026, 11, 13, 23, 45)); // lör 00:45
  assert.equal(s2.lage, "oppet");
  assert.equal(s2.kvarMinuter, 15);
  assert.equal(s2.stangerSnart, true);
});

test("24:00 betyder midnatt, dygnet runt är 00:00–24:00", () => {
  const kvall = plats({ man: [{ fran: "20:00", till: "24:00" }] });
  assert.equal(isOpenAt(kvall, utc(2026, 11, 9, 22, 59)), true);  // mån 23:59
  assert.equal(isOpenAt(kvall, utc(2026, 11, 9, 23, 0)), false);  // tis 00:00
  const dygnet = plats(Object.fromEntries(DAGAR.map((d) => [d, [{ fran: "00:00", till: "24:00" }]])));
  assert.equal(isOpenAt(dygnet, utc(2026, 11, 9, 23, 0)), true);
  assert.equal(isOpenAt(dygnet, utc(2026, 11, 11, 11, 11)), true);
  const s = status(dygnet, utc(2026, 11, 9, 22, 45)); // 23:45, 15 min kvar av passet men nästa dag tar vid
  assert.equal(s.dygnetRunt, true);
  assert.equal(s.stangerSnart, false);
  assert.equal(status(kvall, utc(2026, 11, 9, 22, 45)).stangerSnart, true);
});

test("sommartid börjar 2026-03-29: 01:59 CET hoppar till 03:00 CEST", () => {
  // Sön 29 mars 2026. 00:59 UTC = 01:59 CET. 01:00 UTC = 03:00 CEST.
  assert.equal(localParts(utc(2026, 3, 29, 0, 59)).minuter, 119);
  assert.equal(localParts(utc(2026, 3, 29, 1, 0)).minuter, 180);
  const natt = plats({ lor: [{ fran: "22:00", till: "02:30" }] });
  assert.equal(isOpenAt(natt, utc(2026, 3, 29, 0, 59)), true);  // 01:59, öppet
  assert.equal(isOpenAt(natt, utc(2026, 3, 29, 1, 0)), false);  // 03:00, stängt (02:30 passerades i hoppet)
  const tidig = plats({ son: [{ fran: "03:00", till: "05:00" }] });
  assert.equal(isOpenAt(tidig, utc(2026, 3, 29, 1, 0)), true);  // 03:00 CEST direkt efter hoppet
});

test("sommartid slutar 2026-10-25: 02:30 inträffar två gånger", () => {
  // Sön 25 okt 2026. 00:30 UTC = 02:30 CEST. 01:30 UTC = 02:30 CET.
  assert.equal(localParts(utc(2026, 10, 25, 0, 30)).minuter, 150);
  assert.equal(localParts(utc(2026, 10, 25, 1, 30)).minuter, 150);
  const p = plats({ son: [{ fran: "02:00", till: "03:00" }] });
  assert.equal(isOpenAt(p, utc(2026, 10, 25, 0, 30)), true);
  assert.equal(isOpenAt(p, utc(2026, 10, 25, 1, 30)), true);
  assert.equal(isOpenAt(p, utc(2026, 10, 25, 2, 0)), false); // 03:00 CET
  const natt = plats({ lor: [{ fran: "21:00", till: "07:00" }] });
  assert.equal(isOpenAt(natt, utc(2026, 10, 25, 0, 30)), true);
  assert.equal(isOpenAt(natt, utc(2026, 10, 25, 1, 30)), true);
  assert.equal(isOpenAt(natt, utc(2026, 10, 25, 5, 59)), true);  // 06:59 CET
  assert.equal(isOpenAt(natt, utc(2026, 10, 25, 6, 0)), false);  // 07:00 CET
});

test("säsong: vanlig och över nyår", () => {
  assert.equal(iSasong(null, "07-01"), true);
  assert.equal(iSasong({ fran: "06-01", till: "08-31" }, "07-01"), true);
  assert.equal(iSasong({ fran: "06-01", till: "08-31" }, "09-01"), false);
  const vinter = { fran: "11-01", till: "03-31" };
  assert.equal(iSasong(vinter, "12-15"), true);
  assert.equal(iSasong(vinter, "01-15"), true);
  assert.equal(iSasong(vinter, "03-31"), true);
  assert.equal(iSasong(vinter, "04-01"), false);
  assert.equal(iSasong(vinter, "07-01"), false);
  const p = plats({ man: [{ fran: "00:00", till: "24:00" }] }, { sasong: vinter });
  assert.equal(status(p, utc(2026, 7, 6, 12, 0)).lage, "utanfor-sasong");
  assert.equal(status(p, utc(2026, 12, 7, 12, 0)).lage, "oppet");
});

test("säsong räknas på lokalt datum, inte UTC", () => {
  // 31 mars 23:30 CEST = 21:30 UTC samma dag; 1 april 00:30 CEST = 31 mars 22:30 UTC
  const p = plats(Object.fromEntries(DAGAR.map((d) => [d, [{ fran: "00:00", till: "24:00" }]])), { sasong: { fran: "11-01", till: "03-31" } });
  assert.equal(status(p, utc(2026, 3, 31, 21, 30)).lage, "oppet");
  assert.equal(status(p, utc(2026, 3, 31, 22, 30)).lage, "utanfor-sasong");
});

test("okända öppettider ger okant, aldrig stängt", () => {
  assert.equal(status({ oppettider: null, sasong: null }, utc(2026, 11, 9, 9, 0)).lage, "okant");
});

test("flera pass samma dag", () => {
  const p = plats({ tis: [{ fran: "08:00", till: "10:00" }, { fran: "16:00", till: "18:00" }] });
  assert.equal(isOpenAt(p, utc(2026, 11, 10, 8, 0)), true);   // 09:00
  assert.equal(isOpenAt(p, utc(2026, 11, 10, 11, 0)), false); // 12:00
  assert.equal(isOpenAt(p, utc(2026, 11, 10, 16, 0)), true);  // 17:00
  const s = status(p, utc(2026, 11, 10, 11, 0));
  assert.deepEqual(s.oppnar, { dag: "tis", tid: "16:00", omDagar: 0, datum: "2026-11-10" });
});

test("nästa öppning: samma dag, imorgon, efter helg, aldrig", () => {
  const vardagar = Object.fromEntries(["man", "tis", "ons", "tor", "fre"].map((d) => [d, [{ fran: "08:00", till: "15:00" }]]));
  // 2026-11-09 är en måndag
  assert.deepEqual(nastaOppning(plats(vardagar), "2026-11-09", 7 * 60), { dag: "man", tid: "08:00", omDagar: 0, datum: "2026-11-09" });
  assert.deepEqual(nastaOppning(plats(vardagar), "2026-11-10", 16 * 60), { dag: "ons", tid: "08:00", omDagar: 1, datum: "2026-11-11" });
  assert.deepEqual(nastaOppning(plats(vardagar), "2026-11-13", 16 * 60), { dag: "man", tid: "08:00", omDagar: 3, datum: "2026-11-16" });
  assert.equal(nastaOppning(plats({}), "2026-11-09", 0), null);
  // Öppet en dag i veckan: nästa öppning är samma veckodag om 7 dagar
  assert.deepEqual(nastaOppning(plats({ ons: [{ fran: "12:00", till: "14:00" }] }), "2026-11-11", 15 * 60), { dag: "ons", tid: "12:00", omDagar: 7, datum: "2026-11-18" });
});

test("dagarSedan räknar hela dagar i lokal tid", () => {
  assert.equal(dagarSedan("2026-11-06", utc(2026, 11, 6, 12, 0)), 0);
  assert.equal(dagarSedan("2026-11-06", utc(2026, 11, 9, 12, 0)), 3);
  assert.equal(dagarSedan("2026-08-08", utc(2026, 11, 6, 12, 0)), 90);
  // 23:30 UTC 6 nov är 00:30 den 7 nov lokalt
  assert.equal(dagarSedan("2026-11-06", utc(2026, 11, 6, 23, 30)), 1);
  assert.equal(dagarSedan("", utc(2026, 11, 6)), null);
});
