// Skriver data/ATT-KONTROLLERA.md: allt som är ej verifierat och alla tomma fält.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const las = (f) => JSON.parse(readFileSync(path.join(root, "data", f), "utf8"));
const platser = las("places.json");
const orgs = las("organisations.json");
const kontakter = las("kontakter.json");
const idag = new Date().toISOString().slice(0, 10);

const rader = [
  "# Att kontrollera",
  "",
  `Genererad ${idag} av \`npm run gaps\`. Redigera inte för hand: ändra i JSON-filerna och kör om.`,
  "",
  "När du kontrollerat en post: sätt `status` till `verifierad` och `senastKontrollerad` till dagens datum.",
  "",
];

const tomt = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const stat = (p) => (p.status === "verifierad" ? "✓ verifierad" : "☐ EJ VERIFIERAD");

rader.push(`## Platser (${platser.length})`, "");
for (const p of platser) {
  const luckor = [];
  if (!p.adress) luckor.push("adress saknas");
  else if (tomt(p.adress.gata)) luckor.push("gatuadress");
  if (p.oppettider === null || p.oppettider === undefined) luckor.push("öppettider okända");
  if (tomt(p.telefon)) luckor.push("telefon");
  if (tomt(p.webb)) luckor.push("webb");
  if (tomt(p.erbjuder?.sv)) luckor.push("erbjuder");
  if (tomt(p.sprak)) luckor.push("språk");
  rader.push(`- **${p.namn}** (${p.id}) – ${stat(p)}, kontrollerad ${p.senastKontrollerad}`);
  rader.push(`  - källa: ${p.kalla || "SAKNAS"}`);
  if (luckor.length) rader.push(`  - saknas: ${luckor.join(", ")}`);
  if (p.anteckning) rader.push(`  - anteckning: ${p.anteckning}`);
}

rader.push("", `## Organisationer (${orgs.length})`, "");
for (const o of orgs) {
  const luckor = [];
  if (tomt(o.webb)) luckor.push("webb");
  if (tomt(o.telefon)) luckor.push("telefon");
  if (!o.gava || (tomt(o.gava.swish) && tomt(o.gava.bankgiro) && tomt(o.gava.plusgiro) && tomt(o.gava.url))) luckor.push("gåvouppgifter");
  if (tomt(o.volontar)) luckor.push("volontärsida");
  rader.push(`- **${o.namn}** (${o.id}) – ${stat(o)}, källa: ${o.kalla || "SAKNAS"}${luckor.length ? `, saknas: ${luckor.join(", ")}` : ""}`);
}

rader.push("", `## Kontakter / telefonnummer (${kontakter.length})`, "");
for (const k of kontakter) {
  rader.push(`- **${k.namn}** (${k.id}) – ${stat(k)}, telefon: ${k.telefon || "SAKNAS"}, källa: ${k.kalla || "SAKNAS"}`);
}

writeFileSync(path.join(root, "data", "ATT-KONTROLLERA.md"), rader.join("\n") + "\n");
console.log("✓ skrev data/ATT-KONTROLLERA.md");
