// Klient-JS. Allt innehåll finns redan i HTML:en; det här lägger bara till "Öppet nu", filtret och offline-cache.
import { status, dagarSedan } from "./opening-hours.js";

const texter = JSON.parse(document.getElementById("hg-i18n")?.textContent || "{}");
const t = (nyckel, vars) => {
  let s = texter[nyckel] ?? nyckel;
  // "en plats|flera platser": välj form efter vars.n
  if (s.includes("|")) s = s.split("|")[vars?.n === 1 ? 0 : 1] ?? s.split("|")[0];
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return s;
};

function beskrivning(s) {
  if (s.lage === "oppet") return s.dygnetRunt ? t("dygnetRunt") : t(s.stangerSnart ? "stangerSnart" : "stanger", { tid: s.stanger });
  if (s.lage === "okant") return t("okant");
  if (s.lage === "utanfor-sasong") return t("utanforSasong");
  if (!s.oppnar) return t("oppnarInte");
  if (s.oppnar.omDagar === 0) return t("oppnarIdag", { tid: s.oppnar.tid });
  if (s.oppnar.omDagar === 1) return t("oppnarImorgon", { tid: s.oppnar.tid });
  return t("oppnar", { dag: texter.dagKort?.[s.oppnar.dag] ?? s.oppnar.dag, tid: s.oppnar.tid });
}

function helgdagText(s) {
  if (!s.helgdag) return "";
  const namn = texter.helgdag?.[s.helgdag] ?? s.helgdag;
  return " · " + t(s.helgdagOsaker ? "helgdagOsaker" : "helgdagIdag", { namn });
}

const ORDNING = { oppet: 0, okant: 1, stangt: 2, "utanfor-sasong": 3 };
const LANG = document.documentElement.lang || "sv";

/** Avstånd i meter mellan två punkter (haversine). */
function avstandMeter(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function avstandText(m) {
  if (m < 1000) return t("avstandM", { m: Math.max(10, Math.round(m / 10) * 10) });
  return t("avstandKm", { km: (m / 1000).toLocaleString(LANG, { maximumFractionDigits: 1 }) });
}

// Gemener utan diakritiska tecken, så att "soder" matchar "Söder" och tvärtom.
const normalisera = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function initPlatser() {
  const lista = document.querySelector("[data-platser]");
  if (!lista) return;
  const filter = document.querySelector("[data-filter]");
  const kryss = document.querySelector("[data-oppet-nu]");
  const sok = document.querySelector("[data-sok]");
  const antal = document.querySelector("[data-antal]");
  const inga = document.querySelector("[data-inga]");
  const ingaTraffar = document.querySelector("[data-inga-traffar]");
  const naraKnapp = document.querySelector("[data-nara]");
  const naraStatus = document.querySelector("[data-nara-status]");
  let position = null; // sätts bara efter att användaren tryckt "Nära mig"; lagras aldrig
  const sokIndex = new WeakMap();
  if (sok) {
    const q = new URLSearchParams(location.search).get("q");
    if (q && !sok.value) sok.value = q;
  }
  const gransDagar = texter.inaktuellEfterDagar ?? 90;
  if (filter) filter.hidden = false;

  function uppdatera() {
    const nu = new Date();
    const kort = [...lista.querySelectorAll("[data-plats]")];
    let oppna = 0;
    for (const el of kort) {
      let s, plats;
      try { plats = JSON.parse(el.dataset.plats); s = status(plats, nu); } catch { plats = {}; s = { lage: "okant" }; }
      const avstandEl = el.querySelector("[data-avstand]");
      if (position && plats.koordinater) {
        const m = avstandMeter(position, plats.koordinater);
        el.dataset.avstand = String(Math.round(m));
        if (avstandEl) { avstandEl.textContent = "📍 " + avstandText(m); avstandEl.hidden = false; }
      } else {
        delete el.dataset.avstand;
        if (avstandEl) avstandEl.hidden = true;
      }
      el.dataset.lage = s.lage;
      const st = el.querySelector("[data-status]");
      if (st) {
        const prefix = s.lage === "oppet" ? t("oppetNu") + ". " : s.lage === "stangt" ? t("stangt") + ". " : "";
        st.textContent = prefix + beskrivning(s) + helgdagText(s);
        st.className = "status status-" + s.lage;
      }
      if (s.lage === "oppet") oppna++;
      const gammal = el.querySelector(".gammal");
      const dagar = dagarSedan(el.dataset.kontrollerad, nu);
      if (gammal) gammal.hidden = !(dagar !== null && dagar > gransDagar);
    }
    const nyckel = (el) => (el.dataset.avstand === undefined ? Infinity : Number(el.dataset.avstand));
    kort.sort((a, b) => ORDNING[a.dataset.lage] - ORDNING[b.dataset.lage] || nyckel(a) - nyckel(b)).forEach((el) => lista.appendChild(el));
    const baraOppna = kryss ? kryss.checked : false;
    const ord = sok ? normalisera(sok.value).split(/\s+/).filter(Boolean) : [];
    let traffar = 0, oppnaTraffar = 0;
    for (const el of kort) {
      if (!sokIndex.has(el)) {
        const delar = [el.dataset.sok, ...[...el.querySelectorAll(".erbjuder, .villkor")].map((d) => d.textContent)];
        sokIndex.set(el, normalisera(delar.join(" ")));
      }
      const text = sokIndex.get(el);
      const traff = ord.every((o) => text.includes(o));
      if (traff) { traffar++; if (el.dataset.lage === "oppet") oppnaTraffar++; }
      el.hidden = !traff || (baraOppna && (el.dataset.lage === "stangt" || el.dataset.lage === "utanfor-sasong"));
    }
    if (antal) {
      antal.textContent = ord.length
        ? `${t("traffar", { n: traffar })} · ${t("antalOppna", { n: oppnaTraffar })}`
        : `${t("antalOppna", { n: oppna })} · ${t("antal", { n: kort.length })}`;
    }
    if (ingaTraffar) ingaTraffar.hidden = !(ord.length && traffar === 0);
    if (inga) inga.hidden = !(baraOppna && traffar > 0 && oppnaTraffar === 0);
  }

  kryss?.addEventListener("change", uppdatera);
  sok?.addEventListener("input", () => {
    uppdatera();
    const url = new URL(location.href);
    if (sok.value) url.searchParams.set("q", sok.value); else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  });
  filter?.addEventListener("submit", (e) => { e.preventDefault(); uppdatera(); sok?.blur(); });
  if (naraKnapp && "geolocation" in navigator) {
    naraKnapp.hidden = false;
    naraKnapp.addEventListener("click", () => {
      if (naraStatus) naraStatus.textContent = t("naraSoker");
      naraKnapp.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          naraKnapp.disabled = false;
          if (naraStatus) naraStatus.textContent = t("naraKlar");
          uppdatera();
        },
        () => { naraKnapp.disabled = false; if (naraStatus) naraStatus.textContent = t("naraFel"); },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    });
  }
  uppdatera();
  setInterval(uppdatera, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) uppdatera(); });
}

function initOffline() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:" && location.hostname !== "localhost") return;
  const bas = document.querySelector('meta[name="hg-base"]')?.content || "/";
  navigator.serviceWorker.register(bas + "sw.js").catch(() => {});
}

initPlatser();
initOffline();
