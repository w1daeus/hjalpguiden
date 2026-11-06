// Kontrollerar att alla URL:er i data/ fortfarande svarar (kalla, webb, volontar, gava.url).
// Skriver en Markdown-rapport till stdout. Avslutar med kod 2 om någon länk är död (404/410, serverfel, okänd domän), annars 0.
// Timeout, 403 och 429 rapporteras som osäkra utan att larma, eftersom många sajter blockerar GitHubs servrar.
// Körs varje vecka av .github/workflows/lankkoll.yml och manuellt med `npm run links`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const las = (f) => JSON.parse(readFileSync(path.join(root, "data", f), "utf8"));
const UA = "Mozilla/5.0 (compatible; hjalpguiden-lankkoll/0.1; +https://github.com/w1daeus/hjalpguiden)";
const TIMEOUT_MS = 20000;
const SAMTIDIGT = 4;

// Samla unika URL:er och var de används
const anvands = new Map();
const notera = (url, var_) => {
  if (!url || !/^https?:\/\//.test(url)) return;
  if (!anvands.has(url)) anvands.set(url, []);
  anvands.get(url).push(var_);
};
for (const p of las("places.json")) { notera(p.kalla, `plats ${p.id} (källa)`); notera(p.webb, `plats ${p.id} (webb)`); }
for (const o of las("organisations.json")) {
  notera(o.kalla, `organisation ${o.id} (källa)`); notera(o.webb, `organisation ${o.id} (webb)`);
  notera(o.volontar, `organisation ${o.id} (volontär)`); notera(o.gava?.url, `organisation ${o.id} (gåva)`);
}
for (const k of las("kontakter.json")) { notera(k.kalla, `kontakt ${k.id} (källa)`); notera(k.webb, `kontakt ${k.id} (webb)`); }

async function hamta(url, metod) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const svar = await fetch(url, { method: metod, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, "Accept": "text/html,*/*" } });
    return { status: svar.status, url: svar.url };
  } finally { clearTimeout(timer); }
}

async function kolla(url) {
  try {
    let r = await hamta(url, "HEAD");
    if (r.status === 405 || r.status === 403 || r.status === 404) r = await hamta(url, "GET");
    if (r.status >= 200 && r.status < 400) return { ok: true, status: r.status };
    // 403 och 429 betyder oftast att sajten stoppar robotar, inte att sidan är borta. Rapporteras som osäkra.
    if (r.status === 403 || r.status === 429) return { ok: true, status: r.status, osaker: `svarade ${r.status} (blockerar troligen robotar), kontrollera manuellt` };
    return { ok: false, status: r.status };
  } catch (e) {
    const kod = e.name === "AbortError" ? "timeout" : (e.cause?.code || e.message);
    // Timeout och nekad anslutning från GitHubs servrar är oftast geoblockering. Bara okänd domän räknas som död.
    if (kod === "ENOTFOUND" || kod === "EAI_AGAIN") return { ok: false, status: 0, fel: `domänen finns inte (${kod})` };
    return { ok: true, status: 0, osaker: `nådde inte sajten (${kod}), kontrollera manuellt` };
  }
}

const urls = [...anvands.keys()];
const resultat = new Map();
let i = 0;
await Promise.all(Array.from({ length: SAMTIDIGT }, async () => {
  while (i < urls.length) { const url = urls[i++]; resultat.set(url, await kolla(url)); }
}));

const trasiga = urls.filter((u) => !resultat.get(u).ok);
const osakra = urls.filter((u) => resultat.get(u).osaker);
const idag = new Date().toISOString().slice(0, 10);
const rader = [`## Länkkoll ${idag}`, "", `${urls.length} unika länkar kontrollerade, ${trasiga.length} svarar inte, ${osakra.length} osäkra.`, ""];
if (trasiga.length) {
  rader.push("### Svarar inte", "", "| Länk | Svar | Används av |", "|---|---|---|");
  for (const u of trasiga) { const r = resultat.get(u); rader.push(`| ${u} | ${r.status || r.fel} | ${anvands.get(u).join(", ")} |`); }
  rader.push("");
}
if (osakra.length) {
  rader.push("### Osäkra", "", "| Länk | Svar | Används av |", "|---|---|---|");
  for (const u of osakra) { const r = resultat.get(u); rader.push(`| ${u} | ${r.osaker} | ${anvands.get(u).join(", ")} |`); }
  rader.push("");
}
rader.push("Att en källa försvunnit betyder inte att uppgiften är fel, men den går inte längre att kontrollera. Hitta en ny källa eller markera posten som osäker i `anteckning`.");
console.log(rader.join("\n"));
process.exit(trasiga.length ? 2 : 0);
