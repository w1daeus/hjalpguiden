import { readFileSync } from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";

const site = JSON.parse(readFileSync(new URL("./src/_data/site.json", import.meta.url), "utf8"));

const i18n = {};
for (const kod of ["sv", "en", "ro"]) {
  i18n[kod] = JSON.parse(readFileSync(new URL(`./src/_data/i18n/${kod}.json`, import.meta.url), "utf8"));
}
const DAGAR = ["man", "tis", "ons", "tor", "fre", "lor", "son"];

function slaUpp(obj, nyckel) {
  return nyckel.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

/** t("plats.oppnar", "en", { tid: "08:00" }) → sträng (eller lista/objekt). Tom sträng faller tillbaka till svenska. */
export function t(nyckel, lang = "sv", vars) {
  let v = slaUpp(i18n[lang], nyckel);
  if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) v = slaUpp(i18n.sv, nyckel);
  if (v === undefined) return `[${nyckel}]`;
  if (typeof v === "string" && vars) v = v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return v;
}

/** Grupperar veckodagar med identiska pass: [{ dagar: "mån–fre", tider: "08:00–15:00" }, ...] */
export function tiderRader(oppettider, lang = "sv") {
  if (!oppettider) return [];
  const nyckel = (pass) => pass.map((p) => `${p.fran}–${p.till}`).join(", ") || t("plats.stangtDag", lang);
  const grupper = [];
  for (const d of DAGAR) {
    const k = nyckel(oppettider[d] || []);
    const sista = grupper[grupper.length - 1];
    if (sista && sista.tider === k) sista.dagar.push(d);
    else grupper.push({ dagar: [d], tider: k });
  }
  return grupper.map((g) => ({
    dagar: g.dagar.length === 1 ? t(`plats.dagKort.${g.dagar[0]}`, lang) : `${t(`plats.dagKort.${g.dagar[0]}`, lang)}–${t(`plats.dagKort.${g.dagar[g.dagar.length - 1]}`, lang)}`,
    tider: g.tider,
    stangt: g.tider === t("plats.stangtDag", lang),
  }));
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ "src/css": "css", "src/js": "js", "lib/opening-hours.js": "js/opening-hours.js", "src/manifest.webmanifest": "manifest.webmanifest", "src/icon.svg": "icon.svg" });
  eleventyConfig.addWatchTarget("data/");
  eleventyConfig.addWatchTarget("lib/");

  eleventyConfig.addFilter("t", (nyckel, lang, vars) => t(nyckel, lang, vars));
  eleventyConfig.addFilter("langPath", (path, lang) => (lang === "sv" ? path : `/${lang}${path}`));
  eleventyConfig.addFilter("langSwap", (url, fran, till) => {
    const utan = fran === "sv" ? url : url.replace(new RegExp(`^/${fran}(/|$)`), "/");
    return till === "sv" ? utan : `/${till}${utan}`;
  });
  eleventyConfig.addFilter("iKategori", (platser, kat) => platser.filter((p) => p.kategorier.includes(kat)));
  eleventyConfig.addFilter("tiderRader", tiderRader);
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("telHref", (tel) => {
    const siffror = String(tel).replace(/[^\d+]/g, "");
    return "tel:" + (siffror.startsWith("0") ? "+46" + siffror.slice(1) : siffror);
  });
  eleventyConfig.addFilter("kartUrl", (adress) => {
    if (!adress || !adress.gata) return "";
    const q = [adress.gata, adress.postnummer, adress.ort || "Stockholm"].filter(Boolean).join(", ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  });
  eleventyConfig.addFilter("adressText", (adress) => (adress && adress.gata ? [adress.gata, [adress.postnummer, adress.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : ""));
  eleventyConfig.addFilter("sprakNamn", (koder, lang) =>
    (koder || []).map((k) => { const n = t(`sprakNamn.${k}`, lang); return n.startsWith("[") ? k : n; }).join(", "));
  eleventyConfig.addFilter("jsTexter", (lang) => {
    const nycklar = ["oppetNu", "stangt", "okant", "utanforSasong", "stanger", "stangerSnart", "oppnarIdag", "oppnarImorgon", "oppnar", "oppnarInte", "dygnetRunt", "antal", "antalOppna", "gammal"];
    return { ...Object.fromEntries(nycklar.map((k) => [k, t(`plats.${k}`, lang)])), dagKort: t("plats.dagKort", lang), inaktuellEfterDagar: site.inaktuellEfterDagar };
  });
  eleventyConfig.addFilter("katNamn", (katId, lang) => t(`kat.${katId}.namn`, lang));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
