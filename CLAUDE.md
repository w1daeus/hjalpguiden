# Hjälpguiden Stockholm

Publik, statisk webbsida som hjälper personer i hemlöshet i Stockholm att hitta var de kan sova, äta, duscha och få hjälp **just nu**, och som hjälper allmänheten att agera rätt. Primär användare har ofta gammal mobil, lite data, svagt batteri och talar inte alltid svenska.

Planen finns i `PLAN.md`. Datamodellen finns i `data/README.md`.

## Regler (viktigast först)

1. **Hitta aldrig på adresser, öppettider eller telefonnummer.** Varje post i `data/` ska ha en käll-URL (`kalla`). Hittar du inte en uppgift: lämna fältet tomt och kör `npm run gaps` så hamnar det i `data/ATT-KONTROLLERA.md`.
2. Allt som samlats in av AI får `status: "ej verifierad"`. Bara en människa sätter `"verifierad"`. Sajten visar statusen tydligt.
3. Inga uppgifter om enskilda personer. Inga adresser till skyddade boenden (kvinnojourer m.m.), bara telefonnummer.
4. Ingen inloggning, inga konton, inga cookies, ingen spårning, inga externa skript eller typsnitt. Kartor är vanliga länkar, aldrig inbäddade.
5. Grundinnehållet ska fungera utan JavaScript. JS används bara för "Öppet nu"-filtret (inklusive räknarna på startsidan), sökfältet, "Nära mig" (avstånd från positionen, som aldrig lämnar webbläsaren), dela-knappen, språkförslaget och offline-cache. Språkförslaget får stängas för sessionen via sessionStorage; inget annat lagras. Sökfältet på startsidan är ett vanligt GET-formulär till `/sok/?q=` som visar alla platser utan JS.
6. Under 100 KB per sida. Mobil först. WCAG AA: minst 44 px tryckytor, kontrast 4.5:1, status aldrig bara via färg.
7. All UI-text ligger i `src/_data/i18n/<språk>.json`. Skriv aldrig text direkt i mallarna. Svenska (`sv`) är komplett och fallback. Engelska (`en`) är översatt och aktiv i `site.json`; nya nycklar läggs till i båda. Platsernas fritext (`erbjuder`, `villkor.ovrigt`, kontakternas `beskrivning` och `oppet`) har `sv` och `en`; tom sträng faller tillbaka till svenska. Fler språk läggs till med en ny fil i `i18n/`, en rad i `site.json` och koden i listan i `eleventy.config.js`.
8. "Öppet nu" räknas i tidszonen Europe/Stockholm i `lib/opening-hours.js`; helgdagarna (röda dagar plus midsommar-, jul- och nyårsafton) räknas i `lib/helgdagar.js`. Ändringar där kräver tester i `test/`. En plats utan helgdagsregel (`helgdagar: null`) visas med veckoschemat och en varning på helgdagar, aldrig som stängd utan källa.

## Stack

Eleventy 3 (Nunjucks-mallar), ren CSS, en liten ESM-modul i vanilla JS. Inga andra beroenden. Node 18+.

## Mappar

- `data/` platser, organisationer, kontakter och guiden "Nyss blivit hemlös" (JSON) + `ATT-KONTROLLERA.md`
- `lib/opening-hours.js` ren logik, används av både sajt och tester
- `test/` `node --test`
- `scripts/validate-data.js` stoppar bygget vid fel i data; `scripts/gaps.js` skriver luckor; `scripts/geocode.js` hämtar koordinater från adresserna (OpenStreetMap, rapport i `data/GEOKODNING-<datum>.md`); `scripts/check-links.js` kontrollerar att alla URL:er i data svarar
- `src/` Eleventy-input: `_data/` (i18n, site, laddare), `_includes/` (layout, partials), sidmallar, `css/`, `js/`
- `_site/` byggresultat (ignoreras av git)

## Kommandon

```bash
npm install
npm run dev        # http://localhost:8080 med live reload
npm test           # validerar data + enhetstester
npm run build      # validerar + bygger till _site/
npm run gaps       # skriver data/ATT-KONTROLLERA.md
npm run geocode    # koordinater för platser som saknar dem, via Nominatim (1 anrop/s)
npm run links      # länkkoll, avslutar med kod 2 om någon länk är död
npm run icons      # ritar om PNG-ikonerna i src/icons/ från formen i src/icon.svg
```

## Publicering

- Repo: https://github.com/w1daeus/hjalpguiden (publikt)
- Sajt: https://w1daeus.github.io/hjalpguiden/

Push till `main` kör `.github/workflows/deploy.yml`: test, bygg med `--pathprefix` satt från GitHub Pages, deploy. Workflowet använder `npm install` (inte `npm ci`) eftersom lockfilen från Windows listar fsevents utan optional-flagga, vilket får `npm ci` att falla på Linux.

`.github/workflows/lankkoll.yml` kör länkkollen varje måndag och öppnar ett ärende med etiketten `lankkoll` om någon länk inte svarar. Varje platskort har länken "Stämmer inte? Anmäl" som öppnar ett förifyllt ärende i repot (kräver GitHub-konto).

Service workern förhandscachar startsidan, kategorisidorna och "Jag ser någon" för det språk som besöks (listan i `src/_data/karna.js`), så att guiden fungerar offline efter ett enda besök. Mörkt läge följer systemet via `prefers-color-scheme`; alla färger är tokens i `:root` och ska hålla AA i båda lägena.

`/guide/` är guiden "Nyss blivit hemlös: vad gör jag nu?" från `data/guide.json`. Varje steg har källa, status och datum precis som platserna, och texten ska återge källan utan egna tolkningar.

`/affisch/` är en utskriftsaffisch i A4 med QR-kod till sajten. QR-koden genereras vid bygget av `lib/qr.js` (ingen extern tjänst).

Alla interna länkar skrivs som absoluta sökvägar (`/css/style.css`); Eleventys HtmlBasePlugin lägger på prefixet `/hjalpguiden/` vid bygge i CI. Lokalt (`npm run dev`) är prefixet `/`.

## Datainsamling hittills

Första insamlingen gjordes 2026-11-06 av AI-agenter från organisationernas egna webbplatser. Luckor och motsägelser står i `data/INSAMLING-2026-11-06.md`. Inget är verifierat av en människa än.

## Lägga till en plats

1. Lägg till en post i `data/places.json` enligt `data/README.md`. Organisationen måste finnas i `data/organisations.json`.
2. Sätt `kalla`, `senastKontrollerad` och `status`. Sätt `helgdagar` bara om källan säger vad som gäller på helgdagar, annars `null`.
3. `npm test`, sedan `npm run gaps`.
