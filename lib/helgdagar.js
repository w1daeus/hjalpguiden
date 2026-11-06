/**
 * Svenska helgdagar. Ren modul utan beroenden, körs både i webbläsaren och i Node.
 *
 * Räknar de allmänna helgdagarna (röda dagar) samt midsommarafton, julafton och nyårsafton,
 * som inte är lagstadgade helgdagar men som nästan alla verksamheter behandlar som sådana.
 * Söndagar är formellt också helgdagar men hanteras redan av veckoschemat.
 */

/** Påskdagen för ett år enligt den gregorianska kalendern (Meeus/Jones/Butcher). */
export function paskdagen(ar) {
  const a = ar % 19, b = Math.floor(ar / 100), c = ar % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const manad = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ar, manad - 1, dag);
}

const iso = (utcMs) => new Date(utcMs).toISOString().slice(0, 10);
const DYGN = 86400000;

/** Första lördagen i intervallet [fran, till] (dagnummer i månaden), som UTC-millisekunder. */
function lordagMellan(ar, manad, fran) {
  const start = Date.UTC(ar, manad - 1, fran);
  const veckodag = new Date(start).getUTCDay(); // 0 = söndag, 6 = lördag
  return start + ((6 - veckodag + 7) % 7) * DYGN;
}

const cache = new Map();

/** Alla helgdagar ett år: { "ÅÅÅÅ-MM-DD": id }. */
export function helgdagar(ar) {
  if (cache.has(ar)) return cache.get(ar);
  const pask = paskdagen(ar);
  const midsommardagen = lordagMellan(ar, 6, 20);
  const lista = {
    [iso(Date.UTC(ar, 0, 1))]: "nyarsdagen",
    [iso(Date.UTC(ar, 0, 6))]: "trettondedag-jul",
    [iso(pask - 2 * DYGN)]: "langfredagen",
    [iso(pask)]: "paskdagen",
    [iso(pask + DYGN)]: "annandag-pask",
    [iso(Date.UTC(ar, 4, 1))]: "forsta-maj",
    [iso(pask + 39 * DYGN)]: "kristi-himmelsfardsdag",
    [iso(pask + 49 * DYGN)]: "pingstdagen",
    [iso(Date.UTC(ar, 5, 6))]: "nationaldagen",
    [iso(midsommardagen - DYGN)]: "midsommarafton",
    [iso(midsommardagen)]: "midsommardagen",
    [iso(lordagMellan(ar, 10, 31))]: "alla-helgons-dag",
    [iso(Date.UTC(ar, 11, 24))]: "julafton",
    [iso(Date.UTC(ar, 11, 25))]: "juldagen",
    [iso(Date.UTC(ar, 11, 26))]: "annandag-jul",
    [iso(Date.UTC(ar, 11, 31))]: "nyarsafton",
  };
  cache.set(ar, lista);
  return lista;
}

/** Helgdagens id för ett lokalt datum "ÅÅÅÅ-MM-DD", annars null. */
export function helgdag(isoDatum) {
  if (!isoDatum) return null;
  return helgdagar(Number(isoDatum.slice(0, 4)))[isoDatum] ?? null;
}

export const HELGDAGAR_ID = [
  "nyarsdagen", "trettondedag-jul", "langfredagen", "paskdagen", "annandag-pask", "forsta-maj",
  "kristi-himmelsfardsdag", "pingstdagen", "nationaldagen", "midsommarafton", "midsommardagen",
  "alla-helgons-dag", "julafton", "juldagen", "annandag-jul", "nyarsafton",
];
