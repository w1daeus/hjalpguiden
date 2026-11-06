# Plan: Hjälpguiden Stockholm (arbetsnamn)

Status: förslag, väntar på OK. Inget är byggt ännu.

## 1. Stack: Eleventy + ren CSS + ett litet JS-modul

**Val: Eleventy 3 (statisk sajtgenerator), systemtypsnitt, ingen bundler, inga ramverk.**

Varför:

- Sidan är i grunden "en datafil → många HTML-sidor" (7 kategorier × språk × vanlig/utskrift). Eleventy gör exakt det vid byggtid, så allt innehåll finns i HTML:en och fungerar utan JS.
- Noll klient-JS som standard. Enda JS på sidan blir vår egen modul för "Öppet nu" (några KB), som också är den som enhetstestas. Samma fil körs i webbläsaren och i Node, utan byggsteg.
- En enda npm-beroende (`@11ty/eleventy`). Tester körs med Nodes inbyggda `node --test`. Mindre att underhålla, mindre att gå sönder.
- Astro hade fungerat men drar in en mycket större verktygskedja för något vi inte behöver (komponenter, öar). Ren HTML hade krävt att vi antingen duplicerar 20+ sidor för hand eller renderar allt från JSON i klienten, vilket bryter kravet "fungerar utan JS".
- Systemtypsnitt (ingen webbfont) sparar 50–100 KB per sidvisning och batteri.

Budget per sida: HTML ~10–20 KB, CSS ~6 KB, JS ~5 KB. Långt under 100 KB.

## 2. Mappstruktur

```
Hemlos/
├── CLAUDE.md                 syfte, regler, hur man kör/testar/publicerar
├── PLAN.md                   denna fil
├── README.md                 kort publik beskrivning
├── package.json              scripts: dev, build, test, validate
├── eleventy.config.js
├── .github/workflows/deploy.yml   bygg + test + deploy till GitHub Pages
├── data/                     ← ENDA stället där platsdata finns
│   ├── places.json           en post per plats
│   ├── organisations.json    en post per organisation
│   └── ATT-KONTROLLERA.md    lista över luckor och saker du ska verifiera
├── lib/
│   └── opening-hours.js      ren logik för "Öppet nu" (ESM, inga beroenden)
├── test/
│   └── opening-hours.test.js node --test, inkl. midnatt och sommartid
├── scripts/
│   └── validate-data.js      kontrollerar datafilerna, körs före bygg och i CI
└── src/
    ├── _data/
    │   ├── i18n/sv.json      all UI-text, svenska (komplett)
    │   ├── i18n/en.json      samma nycklar, för översättning
    │   ├── i18n/ro.json      samma nycklar, för översättning
    │   ├── site.json         namn, aktiva språk, kategorier
    │   └── places.js         läser ../data, kopplar org, sorterar
    ├── _includes/            layout + partials (platskort, filter, sidfot)
    ├── css/style.css
    ├── js/app.js             kopplar filtret "Öppet nu" till DOM
    ├── sw.js                 service worker (offline)
    ├── manifest.webmanifest
    ├── index.njk             startsida med tre ingångar
    ├── hjalp.njk             genererar /hjalp/<kategori>/ per språk
    ├── skriv-ut.njk          genererar /skriv-ut/<kategori>/ per språk
    ├── ser-nagon.njk         beslutsträd
    └── hjalpa-till.njk       ge, skänka, volontär + plats för Behovstavla
```

URL-struktur: svenska utan prefix (`/hjalp/mat/`), andra språk med prefix (`/en/hjalp/mat/`). Slugs är svenska i alla språk, enkelt att dela länkar.

## 3. Datamodell

### Plats (`data/places.json`)

```json
{
  "id": "klaragarden",
  "namn": "Klaragården",
  "organisation": "stockholms-stadsmission",
  "kategorier": ["mat", "dusch", "rad"],
  "erbjuder": { "sv": "Frukost, lunch, dusch, tvätt, samtal", "en": "" },
  "adress": { "gata": "", "postnummer": "", "ort": "Stockholm" },
  "koordinater": null,
  "oppettider": {
    "man": [{ "fran": "08:00", "till": "15:00" }],
    "tis": [], "ons": [], "tor": [], "fre": [], "lor": [], "son": []
  },
  "sasong": null,
  "villkor": {
    "malgrupp": "alla",
    "kraverId": false,
    "pris": "gratis",
    "ovrigt": { "sv": "", "en": "" }
  },
  "sprak": ["sv", "en"],
  "telefon": "",
  "webb": "",
  "kalla": "https://...",
  "senastKontrollerad": "2026-11-06",
  "status": "ej verifierad",
  "anteckning": "internt: vad som saknas eller är osäkert"
}
```

Regler i modellen:

- **Kategorier** (fasta koder): `sova`, `mat`, `dusch`, `klader`, `ladda`, `vard`, `rad`.
- **Målgrupp** (koder): `alla`, `kvinnor`, `man`, `unga`, `eu-medborgare` m.fl. Koder översätts via i18n-filerna, fritext ligger som `{sv, en, ro}` med svenska som fallback.
- **Öppettider över midnatt**: `{"fran": "21:00", "till": "07:00"}` på söndag betyder sön 21:00 till mån 07:00. `"till": "24:00"` betyder till midnatt. Dygnet runt = `00:00–24:00`.
- **Säsong**: `{"fran": "11-01", "till": "03-31"}` (MM-DD, får gå över nyår). Utanför säsong räknas platsen som stängd och visas med texten "Säsongsöppet".
- **Tom lista** = stängt den dagen. **`oppettider: null`** = okänt, visas som "Öppettider okända" och göms aldrig av filtret.
- **Status** är bara `"verifierad"` eller `"ej verifierad"`. Allt jag samlar in får `"ej verifierad"`.
- **Tomma fält är tillåtna** och hamnar automatiskt i `ATT-KONTROLLERA.md` via valideringsskriptet.
- Skyddade boenden läggs aldrig in med adress. De får `adress: null` och bara telefon.

### Organisation (`data/organisations.json`)

```json
{
  "id": "stockholms-stadsmission",
  "namn": "Stockholms Stadsmission",
  "webb": "",
  "telefon": "",
  "gava": { "swish": "", "bankgiro": "", "url": "" },
  "volontar": "",
  "kalla": "",
  "senastKontrollerad": "2026-11-06"
}
```

Platser pekar på organisationen via `organisation: id`. Behovstavlan kan senare peka på samma id.

## 4. Logiken "Öppet nu"

- Ren funktion `isOpenAt(place, instant)` i `lib/opening-hours.js`. Tar en `Date` (UTC-instant) och räknar om till lokal veckodag och klockslag i `Europe/Stockholm` med `Intl.DateTimeFormat`. Sommartid hanteras därmed av tidszonsdatabasen, inte av oss.
- Öppet om: ett pass samma dag täcker klockslaget, eller ett pass från föregående dag går över midnatt och inte slutat än. Sluttid är exklusiv (07:00 = stängt kl 07:00).
- Returnerar även nästa händelse ("stänger 15:00", "öppnar mån 08:00") så korten kan visa det.
- Tester (`node --test`): vanlig dag, midnatt (sön 23:30, mån 03:00, mån 07:00), `24:00`, övergång till sommartid 2026-03-29 (02:30 finns inte), övergång till vintertid 2026-10-25 (02:30 finns två gånger), säsong över nyår, okända tider, flera pass per dag.
- I webbläsaren: `app.js` kör samma funktion med `new Date()`, markerar varje kort och sorterar öppna först. Utan JS visas alla platser med sina tider och en rad: "Slå på JavaScript för att filtrera på öppet nu".

## 5. Vad som ingår i version 1

1. Startsida med tre ingångar och tydlig "ej verifierad"-markering i sidhuvudet tills du godkänt data.
2. Sju kategorisidor med platskort: adress, öppettider, erbjuder, villkor, kartlänk (vanlig länk till Google Maps, ingen inbäddning), telefon som markerbar text plus separat "Ring"-länk, källa, "Senast kontrollerad". Filtret "Öppet nu" på som standard. Varning om kontrollen är äldre än 90 dagar.
3. "Jag ser någon som behöver hjälp": beslutsträd i ren HTML (112 → socialjouren/uppsökare → tips). Nummer från officiella källor med käll-URL.
4. "Jag vill hjälpa till": organisationerna med gåvouppgifter från deras egna sidor, lista över vad som behövs och inte, volontärlänkar. Tom sektion "Behovstavla (kommer)".
5. 20–30 platser i centrala Stockholm från Stockholms stad och organisationernas egna sidor. Varje post har källa och status "ej verifierad". Luckor listas i `data/ATT-KONTROLLERA.md`.
6. Utskriftsvy per kategori (`/skriv-ut/mat/`): ren lista, inga knappar, datum och "ej verifierad" i sidhuvudet.
7. Offline: service worker som cachar sidorna efter första besöket, uppdaterar i bakgrunden. Webbmanifest så sidan kan läggas på hemskärmen.
8. Tillgänglighet: semantisk HTML, hopp-länk, minst 44 px tryckytor, kontrast AA, status inte bara via färg, fokusmarkering, `lang` på alla sidor.
9. Flerspråk: `sv.json` komplett, `en.json` och `ro.json` med samma nycklar. Språk aktiveras i `site.json`. Bara svenska aktivt i v1.
10. `validate-data.js` körs i `npm test` och i CI och stoppar bygget vid trasiga tider, okända koder eller saknad källa.
11. Publicering: GitHub Actions bygger, testar och publicerar till GitHub Pages vid push till `main`.

Ingår inte i v1: Behovstavlan, inbäddad karta, sökfält, helgdagsundantag (fältet finns inte än), engelska/rumänska texter, koordinater för alla platser.

## 6. Byggordning

1. CLAUDE.md, package.json, Eleventy-skelett, startsida med tre ingångar → skärmdump.
2. Datamodell, validering, `opening-hours.js` + tester, kategorisidor med 2–3 exempelplatser → skärmdump.
3. Datainsamling från officiella källor (webbsök + hämtning), `ATT-KONTROLLERA.md`.
4. Beslutsträd, "hjälpa till", utskriftsvy, offline → skärmdump.
5. Git-repo, GitHub-repo (via gh), Actions, GitHub Pages → länk.

## 7. Frågor till dig (inget blockerar, jag antar det första om du inte säger annat)

- Repo-namn på GitHub: jag föreslår `hjalpguiden` under kontot w1daeus. Sidan hamnar på `w1daeus.github.io/hjalpguiden/`.
- Kartlänk: Google Maps (fungerar på flest mobiler) eller OpenStreetMap? Jag föreslår Google Maps.
- Repot publikt eller privat? GitHub Pages gratis kräver publikt repo.
