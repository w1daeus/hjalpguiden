// Klient-JS. Allt innehåll finns redan i HTML:en; det här lägger bara till "Öppet nu", filtret och offline-cache.
import { status, dagarSedan } from "./opening-hours.js";

const texter = JSON.parse(document.getElementById("hg-i18n")?.textContent || "{}");
const t = (nyckel, vars) => {
  let s = texter[nyckel] ?? nyckel;
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

function initPlatser() {
  const lista = document.querySelector("[data-platser]");
  if (!lista) return;
  const filter = document.querySelector("[data-filter]");
  const kryss = document.querySelector("[data-oppet-nu]");
  const antal = document.querySelector("[data-antal]");
  const inga = document.querySelector("[data-inga]");
  const gransDagar = texter.inaktuellEfterDagar ?? 90;
  if (filter) filter.hidden = false;

  function uppdatera() {
    const nu = new Date();
    const kort = [...lista.querySelectorAll("[data-plats]")];
    let oppna = 0;
    for (const el of kort) {
      let s;
      try { s = status(JSON.parse(el.dataset.plats), nu); } catch { s = { lage: "okant" }; }
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
    kort.sort((a, b) => ORDNING[a.dataset.lage] - ORDNING[b.dataset.lage]).forEach((el) => lista.appendChild(el));
    const baraOppna = kryss ? kryss.checked : false;
    for (const el of kort) el.hidden = baraOppna && (el.dataset.lage === "stangt" || el.dataset.lage === "utanfor-sasong");
    if (antal) antal.textContent = `${t("antalOppna", { n: oppna })} · ${t("antal", { n: kort.length })}`;
    if (inga) inga.hidden = !(baraOppna && oppna === 0);
  }

  kryss?.addEventListener("change", uppdatera);
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
