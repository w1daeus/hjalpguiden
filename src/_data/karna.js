// Sidor som service workern förhandscachar per språk vid första besöket, så att guiden fungerar offline.
// Sökvägar utan inledande snedstreck; sw.njk lägger på bassökvägen.
import site from "./site.json" with { type: "json" };

const karna = {};
for (const s of site.sprak.filter((x) => x.aktiv)) {
  const prefix = s.kod === "sv" ? "" : s.kod + "/";
  karna[s.kod] = [prefix, ...site.kategorier.map((k) => `${prefix}hjalp/${k.id}/`), prefix + "ser-nagon/", prefix + "guide/"];
}
export default karna;
