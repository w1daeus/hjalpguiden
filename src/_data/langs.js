import site from "./site.json" with { type: "json" };
export default site.sprak.filter((s) => s.aktiv).map((s) => s.kod);
