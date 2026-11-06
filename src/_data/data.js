// Läser data/*.json (projektets rot) och kopplar platser till organisationer.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const las = (f) => JSON.parse(readFileSync(path.join(root, "data", f), "utf8"));

export default function () {
  const organisationer = las("organisations.json").sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  const orgById = Object.fromEntries(organisationer.map((o) => [o.id, o]));
  const platser = las("places.json")
    .map((p) => ({ ...p, org: orgById[p.organisation] }))
    .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  const kontakter = las("kontakter.json");
  const guide = las("guide.json");
  const kontaktById = Object.fromEntries(kontakter.map((k) => [k.id, k]));
  const ejVerifierade = [...platser, ...organisationer, ...kontakter].filter((x) => x.status !== "verifierad").length
    + guide.flatMap((d) => d.steg).filter((s) => s.status !== "verifierad").length;
  return { platser, organisationer, kontakter, kontaktById, guide, ejVerifierade };
}
