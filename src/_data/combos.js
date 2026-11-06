// Alla aktiva språk × alla kategorier. Används av hjalp.njk och skriv-ut.njk för att generera en sida per kombination.
import site from "./site.json" with { type: "json" };
export default site.sprak
  .filter((s) => s.aktiv)
  .flatMap((s) => site.kategorier.map((k) => ({ lang: s.kod, kat: k })));
