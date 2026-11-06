// Hämtar koordinater för platser med adress men utan koordinater, via OpenStreetMaps Nominatim.
// Koordinaterna härleds från adressen som redan finns i data och markeras "ej verifierad".
// Skriver en rapport (data/GEOKODNING-<datum>.md) med kartlänk per plats så att en människa kan stickprova.
//
//   node scripts/geocode.js          bara platser som saknar koordinater
//   node scripts/geocode.js --alla   geokoda om alla platser med adress
//
// Nominatims villkor: max en förfrågan per sekund och en identifierande User-Agent.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fil = path.join(root, "data", "places.json");
const platser = JSON.parse(readFileSync(fil, "utf8"));
const alla = process.argv.includes("--alla");
const idag = new Date().toISOString().slice(0, 10);
const UA = "hjalpguiden-stockholm/0.1 (https://github.com/w1daeus/hjalpguiden)";

// Grov ram runt Stockholms län. Träffar utanför den är nästan säkert fel.
const RAM = { latMin: 58.9, latMax: 60.1, lonMin: 17.3, lonMax: 19.3 };

const vanta = (ms) => new Promise((r) => setTimeout(r, ms));

async function slaUpp(adress) {
  const gata = adress.gata.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const params = new URLSearchParams({
    street: gata, city: adress.ort || "Stockholm", country: "Sverige",
    format: "jsonv2", limit: "1", addressdetails: "1",
  });
  if (adress.postnummer) params.set("postalcode", adress.postnummer);
  let svar = await fetch("https://nominatim.openstreetmap.org/search?" + params, { headers: { "User-Agent": UA, "Accept-Language": "sv" } });
  let lista = svar.ok ? await svar.json() : [];
  // Andra försök utan postnummer: Nominatim missar ibland när postnumret inte stämmer exakt i OSM.
  if (!lista.length && adress.postnummer) {
    await vanta(1100);
    params.delete("postalcode");
    svar = await fetch("https://nominatim.openstreetmap.org/search?" + params, { headers: { "User-Agent": UA, "Accept-Language": "sv" } });
    lista = svar.ok ? await svar.json() : [];
  }
  return lista[0] || null;
}

const rader = [
  `# Geokodning ${idag}`,
  "",
  "Koordinater hämtade automatiskt från OpenStreetMap (Nominatim) utifrån adressen i `places.json`. De är **ej verifierade**.",
  "Stickprova genom att öppna kartlänken och se att nålen hamnar på rätt hus. Rätta i `places.json` (`koordinater.lat`/`lon`) och sätt `koordinater.status` till `verifierad`.",
  "",
  "| Plats | Adress i data | Träff i OSM | Varning | Karta |",
  "|---|---|---|---|---|",
];

let antal = 0, missade = 0;
for (const p of platser) {
  if (!p.adress || !p.adress.gata) continue;
  if (p.koordinater && !alla) continue;
  await vanta(1100);
  const traff = await slaUpp(p.adress);
  const adressText = [p.adress.gata, p.adress.postnummer, p.adress.ort].filter(Boolean).join(", ");
  if (!traff) {
    missade++;
    rader.push(`| ${p.namn} (${p.id}) | ${adressText} | **ingen träff** | | |`);
    console.log(`✗ ${p.id}: ingen träff`);
    continue;
  }
  const lat = Number(traff.lat), lon = Number(traff.lon);
  const varningar = [];
  if (lat < RAM.latMin || lat > RAM.latMax || lon < RAM.lonMin || lon > RAM.lonMax) varningar.push("utanför Stockholmsområdet");
  const osmGata = traff.address?.road || "";
  const dataGata = p.adress.gata.replace(/\s*\(.*?\)\s*/g, "").replace(/\s+\d.*$/, "").toLowerCase();
  if (osmGata && !osmGata.toLowerCase().includes(dataGata.split(" ")[0])) varningar.push(`gatan i OSM är "${osmGata}"`);
  if (!traff.address?.house_number && /\d/.test(p.adress.gata)) varningar.push("husnummer saknas i träffen, kan vara gatans mitt");
  if (p.adress.postnummer && traff.address?.postcode && traff.address.postcode.replace(/\s/g, "") !== p.adress.postnummer.replace(/\s/g, "")) varningar.push(`postnummer i OSM ${traff.address.postcode}`);
  if (varningar.length) { console.log(`! ${p.id}: ${varningar.join("; ")}`); }
  p.koordinater = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, kalla: "nominatim", datum: idag, status: "ej verifierad" };
  antal++;
  rader.push(`| ${p.namn} (${p.id}) | ${adressText} | ${traff.display_name.replace(/\|/g, "/")} | ${varningar.join("; ")} | [karta](https://www.openstreetmap.org/?mlat=${p.koordinater.lat}&mlon=${p.koordinater.lon}#map=18/${p.koordinater.lat}/${p.koordinater.lon}) |`);
  console.log(`✓ ${p.id}: ${p.koordinater.lat}, ${p.koordinater.lon}`);
}

writeFileSync(fil, JSON.stringify(platser, null, 2) + "\n");
writeFileSync(path.join(root, "data", `GEOKODNING-${idag}.md`), rader.join("\n") + "\n");
console.log(`\n${antal} platser geokodade, ${missade} utan träff. Rapport: data/GEOKODNING-${idag}.md`);
