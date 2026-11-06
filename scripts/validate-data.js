// Kontrollerar data/*.json. Avslutar med kod 1 vid fel så att bygget stoppas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const las = (f) => JSON.parse(readFileSync(path.join(root, "data", f), "utf8"));

const KATEGORIER = ["sova", "mat", "dusch", "klader", "ladda", "vard", "rad"];
const MALGRUPP = ["alla", "kvinnor", "man", "unga", "familjer", "eu-medborgare", "papperslosa"];
const STATUS = ["verifierad", "ej verifierad"];
const DAGAR = ["man", "tis", "ons", "tor", "fre", "lor", "son"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const MMDD = /^\d{2}-\d{2}$/;
const TID = /^([01]\d|2[0-4]):[0-5]\d$/;

const fel = [];
const kolla = (ok, msg) => { if (!ok) fel.push(msg); };
const HELGDAGAR = [null, "stangt", "som-sondag", "ordinarie"];

function kollaPass(pass, v, var_) {
  kolla(Array.isArray(pass), `${v}: ${var_} måste vara en lista av pass (tom lista = stängt)`);
  for (const s of pass || []) {
    kolla(TID.test(s.fran) && TID.test(s.till), `${v}: ${var_} har ogiltig tid "${s.fran}–${s.till}"`);
    kolla(s.fran !== "24:00", `${v}: ${var_} kan inte börja 24:00`);
  }
}

const platser = las("places.json");
const orgs = las("organisations.json");
const kontakter = las("kontakter.json");
const guide = las("guide.json");
const orgIds = new Set(orgs.map((o) => o.id));

function kollaGemensamt(p, var_) {
  kolla(ID.test(p.id || ""), `${var_}: ogiltigt id "${p.id}"`);
  kolla(typeof p.namn === "string" && p.namn.trim(), `${var_}: saknar namn`);
  kolla(STATUS.includes(p.status), `${var_}: status måste vara ${STATUS.join(" eller ")}`);
  kolla(DATUM.test(p.senastKontrollerad || ""), `${var_}: senastKontrollerad måste vara ÅÅÅÅ-MM-DD`);
  kolla(typeof p.kalla === "string" && /^https?:\/\//.test(p.kalla), `${var_}: kalla måste vara en URL (regel 1: ingen uppgift utan källa)`);
}

const sedda = new Set();
for (const p of platser) {
  const v = `places.json → ${p.id || p.namn || "(utan id)"}`;
  kollaGemensamt(p, v);
  kolla(!sedda.has(p.id), `${v}: dubblett-id`);
  sedda.add(p.id);
  kolla(orgIds.has(p.organisation), `${v}: organisation "${p.organisation}" finns inte i organisations.json`);
  kolla(Array.isArray(p.kategorier) && p.kategorier.length > 0 && p.kategorier.every((k) => KATEGORIER.includes(k)), `${v}: kategorier måste vara en icke-tom lista av ${KATEGORIER.join(", ")}`);
  kolla(p.erbjuder && typeof p.erbjuder.sv === "string", `${v}: erbjuder.sv saknas`);
  kolla(p.adress === null || (p.adress && typeof p.adress.gata === "string"), `${v}: adress måste vara null eller {gata, postnummer, ort}`);
  kolla(p.villkor && MALGRUPP.includes(p.villkor.malgrupp), `${v}: villkor.malgrupp måste vara en av ${MALGRUPP.join(", ")}`);
  kolla(p.villkor && typeof p.villkor.kraverId === "boolean", `${v}: villkor.kraverId måste vara true/false`);
  kolla(Array.isArray(p.sprak), `${v}: sprak måste vara en lista`);
  if (p.sasong !== null && p.sasong !== undefined) {
    kolla(MMDD.test(p.sasong.fran || "") && MMDD.test(p.sasong.till || ""), `${v}: sasong måste vara {fran: "MM-DD", till: "MM-DD"}`);
  }
  if (p.oppettider !== null && p.oppettider !== undefined) {
    kolla(typeof p.oppettider === "object", `${v}: oppettider måste vara objekt eller null`);
    for (const d of DAGAR) kollaPass(p.oppettider[d], v, `oppettider.${d}`);
    const extra = Object.keys(p.oppettider).filter((k) => !DAGAR.includes(k));
    kolla(extra.length === 0, `${v}: okända dagar i oppettider: ${extra.join(", ")}`);
  }
  if (p.koordinater !== null && p.koordinater !== undefined) {
    const k = p.koordinater;
    kolla(typeof k.lat === "number" && typeof k.lon === "number", `${v}: koordinater måste vara null eller {lat, lon}`);
    kolla(k.lat > 58.9 && k.lat < 60.1 && k.lon > 17.3 && k.lon < 19.3, `${v}: koordinater ligger utanför Stockholmsområdet`);
    kolla(!("status" in k) || STATUS.includes(k.status), `${v}: koordinater.status måste vara ${STATUS.join(" eller ")}`);
  }
  kolla("helgdagar" in p && HELGDAGAR.includes(p.helgdagar), `${v}: helgdagar måste vara null (okänt), "stangt", "som-sondag" eller "ordinarie"`);
  kolla(Array.isArray(p.undantag), `${v}: undantag måste vara en lista (tom om inga)`);
  for (const u of p.undantag || []) {
    kolla(DATUM.test(u.fran || "") && DATUM.test(u.till || "") && u.fran <= u.till, `${v}: undantag måste ha fran och till som ÅÅÅÅ-MM-DD, fran <= till`);
    kollaPass(u.pass, v, `undantag ${u.fran}`);
  }
}

for (const o of orgs) kollaGemensamt(o, `organisations.json → ${o.id || o.namn}`);
for (const k of kontakter) {
  const v = `kontakter.json → ${k.id || k.namn}`;
  kollaGemensamt(k, v);
  kolla(k.beskrivning && typeof k.beskrivning.sv === "string", `${v}: beskrivning.sv saknas`);
  kolla(!("adress" in k) || k.adress === null, `${v}: kontakter får inte ha adress (regel 4)`);
}

const kontaktIds = new Set(kontakter.map((k) => k.id));
const stegIds = new Set();
for (const del of guide) {
  const v = `guide.json → ${del.id || "(utan id)"}`;
  kolla(ID.test(del.id || ""), `${v}: ogiltigt id`);
  kolla(del.rubrik && typeof del.rubrik.sv === "string" && del.rubrik.sv.trim(), `${v}: rubrik.sv saknas`);
  kolla(Array.isArray(del.steg) && del.steg.length > 0, `${v}: steg måste vara en icke-tom lista`);
  for (const s of del.steg || []) {
    const w = `${v} → ${s.id || "(utan id)"}`;
    kolla(ID.test(s.id || ""), `${w}: ogiltigt id`);
    kolla(!stegIds.has(s.id), `${w}: dubblett-id`);
    stegIds.add(s.id);
    kolla(s.rubrik && typeof s.rubrik.sv === "string" && s.rubrik.sv.trim(), `${w}: rubrik.sv saknas`);
    kolla(s.text && typeof s.text.sv === "string" && s.text.sv.trim(), `${w}: text.sv saknas`);
    kolla(STATUS.includes(s.status), `${w}: status måste vara ${STATUS.join(" eller ")}`);
    kolla(DATUM.test(s.senastKontrollerad || ""), `${w}: senastKontrollerad måste vara ÅÅÅÅ-MM-DD`);
    kolla(typeof s.kalla === "string" && /^https?:\/\//.test(s.kalla), `${w}: kalla måste vara en URL (regel 1)`);
    kolla(!s.kontakt || kontaktIds.has(s.kontakt), `${w}: kontakt "${s.kontakt}" finns inte i kontakter.json`);
    kolla(!s.intern || s.intern.startsWith("/"), `${w}: intern måste vara en sökväg som börjar med /`);
    kolla(!s.lank || (/^https?:\/\//.test(s.lank.url || "") && s.lank.text && s.lank.text.sv), `${w}: lank måste ha url och text.sv`);
  }
}

if (fel.length) {
  console.error(`✗ ${fel.length} fel i data/:\n  ` + fel.join("\n  "));
  process.exit(1);
}
console.log(`✓ data ok: ${platser.length} platser, ${orgs.length} organisationer, ${kontakter.length} kontakter, ${guide.flatMap((d) => d.steg).length} guidesteg`);
