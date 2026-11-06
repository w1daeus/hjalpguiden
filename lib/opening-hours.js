/**
 * Logik för "Öppet nu". Ren modul utan beroenden, körs både i webbläsaren och i Node.
 * All tid räknas i tidszonen Europe/Stockholm via Intl, så sommartid hanteras av tidszonsdatabasen.
 *
 * Datamodell (se data/README.md):
 *   oppettider: { man: [{fran:"08:00", till:"15:00"}], tis: [], ... son: [] } eller null (okänt)
 *   Pass där till <= fran går över midnatt (t.ex. 21:00–07:00). "24:00" betyder midnatt.
 *   sasong: null eller { fran: "MM-DD", till: "MM-DD" }, får gå över nyår.
 */

export const TZ = "Europe/Stockholm";
export const DAGAR = ["man", "tis", "ons", "tor", "fre", "lor", "son"];
const INTL_DAG = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const STANGER_SNART_MIN = 30;

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }));
  }
  return fmtCache.get(tz);
}

/** Lokal veckodag (0 = måndag), minuter sedan midnatt och datum för en tidpunkt. */
export function localParts(date, tz = TZ) {
  const p = {};
  for (const part of fmt(tz).formatToParts(date)) p[part.type] = part.value;
  const timme = Number(p.hour) % 24;
  return {
    dag: INTL_DAG[p.weekday],
    minuter: timme * 60 + Number(p.minute),
    ar: Number(p.year),
    mmdd: `${p.month}-${p.day}`,
    iso: `${p.year}-${p.month}-${p.day}`,
  };
}

export function tillMinuter(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/** Är datumet (MM-DD) inom säsongen? Säsong som går över nyår stöds. */
export function iSasong(sasong, mmdd) {
  if (!sasong) return true;
  const { fran, till } = sasong;
  if (fran <= till) return mmdd >= fran && mmdd <= till;
  return mmdd >= fran || mmdd <= till;
}

/** Hittar det pass som täcker tidpunkten: dagens pass, eller gårdagens pass som gått över midnatt. */
function aktivtPass(oppettider, dag, minuter) {
  for (const pass of oppettider[DAGAR[dag]] || []) {
    const f = tillMinuter(pass.fran), t = tillMinuter(pass.till);
    const traffar = t > f ? (minuter >= f && minuter < t) : minuter >= f;
    if (traffar) return { pass, kvar: t > f ? t - minuter : 1440 - minuter + t };
  }
  for (const pass of oppettider[DAGAR[(dag + 6) % 7]] || []) {
    const f = tillMinuter(pass.fran), t = tillMinuter(pass.till);
    if (t <= f && minuter < t) return { pass, kvar: t - minuter };
  }
  return null;
}

/** Nästa öppning inom 7 dagar: { dag, tid, omDagar } eller null. */
export function nastaOppning(oppettider, dag, minuter) {
  for (let offset = 0; offset < 8; offset++) {
    const d = (dag + offset) % 7;
    const pass = [...(oppettider[DAGAR[d]] || [])].sort((a, b) => tillMinuter(a.fran) - tillMinuter(b.fran));
    for (const p of pass) {
      if (offset === 0 && tillMinuter(p.fran) <= minuter) continue;
      return { dag: DAGAR[d], tid: p.fran, omDagar: offset };
    }
  }
  return null;
}

/**
 * Status för en plats vid en tidpunkt.
 * Returnerar { lage: "oppet" | "stangt" | "okant" | "utanfor-sasong", ... }
 *   oppet:  stanger (HH:MM), stangerSnart (bool), kvarMinuter
 *   stangt: oppnar ({dag, tid, omDagar} eller null)
 */
export function status(plats, date = new Date(), tz = TZ) {
  const nu = localParts(date, tz);
  if (!iSasong(plats.sasong, nu.mmdd)) return { lage: "utanfor-sasong", sasong: plats.sasong };
  if (!plats.oppettider) return { lage: "okant" };
  const aktivt = aktivtPass(plats.oppettider, nu.dag, nu.minuter);
  if (aktivt) {
    const dygnetRunt = aktivt.pass.fran === "00:00" && aktivt.pass.till === "24:00";
    return {
      lage: "oppet",
      dygnetRunt,
      stanger: aktivt.pass.till,
      kvarMinuter: aktivt.kvar,
      stangerSnart: !dygnetRunt && aktivt.kvar <= STANGER_SNART_MIN,
    };
  }
  return { lage: "stangt", oppnar: nastaOppning(plats.oppettider, nu.dag, nu.minuter) };
}

export function isOpenAt(plats, date = new Date(), tz = TZ) {
  return status(plats, date, tz).lage === "oppet";
}

/** Antal dagar sedan ett ISO-datum, räknat i lokal tid. Används för "kan vara inaktuell". */
export function dagarSedan(isoDatum, date = new Date(), tz = TZ) {
  if (!isoDatum) return null;
  const tillUtc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((tillUtc(localParts(date, tz).iso) - tillUtc(isoDatum)) / 86400000);
}
