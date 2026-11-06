# Datafiler

Allt innehåll om platser, organisationer och telefonnummer ligger här. Sajten byggs från dessa filer.

## Regler

1. **Hitta aldrig på** adresser, öppettider eller telefonnummer. Varje post ska ha `kalla` (URL till sidan uppgiften lästes på).
2. Allt som samlats in av AI eller från webben har `status: "ej verifierad"` tills en människa kontrollerat det och satt `"verifierad"` samt nytt `senastKontrollerad`.
3. Hittar man inte en uppgift: lämna fältet tomt (`""` eller `null`). `npm run gaps` listar alla luckor i `ATT-KONTROLLERA.md`.
4. Inga uppgifter om enskilda personer. Inga adresser till skyddade boenden (kvinnojourer m.m.): `adress: null`, bara telefon.
5. `npm run validate` måste gå igenom innan bygge.

## places.json – en post per plats

```json
{
  "id": "klaragarden",
  "namn": "Klaragården",
  "organisation": "stockholms-stadsmission",
  "kategorier": ["mat", "dusch"],
  "erbjuder": { "sv": "Frukost, lunch, dusch, tvätt", "en": "", "ro": "" },
  "adress": { "gata": "Klara Östra Kyrkogata 10", "postnummer": "111 52", "ort": "Stockholm" },
  "koordinater": null,
  "oppettider": {
    "man": [{ "fran": "08:00", "till": "15:00" }],
    "tis": [], "ons": [], "tor": [], "fre": [], "lor": [], "son": []
  },
  "sasong": null,
  "villkor": { "malgrupp": "kvinnor", "kraverId": false, "pris": "gratis", "ovrigt": { "sv": "", "en": "", "ro": "" } },
  "sprak": ["sv", "en"],
  "telefon": "",
  "webb": "",
  "kalla": "https://...",
  "senastKontrollerad": "2026-11-06",
  "status": "ej verifierad",
  "anteckning": ""
}
```

| Fält | Värden |
|---|---|
| `kategorier` | `sova`, `mat`, `dusch`, `klader`, `ladda`, `vard`, `rad` |
| `oppettider` | objekt med alla sju dagar `man tis ons tor fre lor son`, varje dag en lista av pass `{fran, till}` i `HH:MM`. Tom lista = stängt. `null` på hela objektet = okända tider. |
| Pass över midnatt | `till` mindre än eller lika med `fran`, t.ex. `21:00`–`07:00`, betyder till nästa dag. `24:00` = midnatt. Dygnet runt = `00:00`–`24:00`. |
| `sasong` | `null` eller `{ "fran": "MM-DD", "till": "MM-DD" }`, får gå över nyår |
| `villkor.malgrupp` | `alla`, `kvinnor`, `man`, `unga`, `familjer`, `eu-medborgare`, `papperslosa` |
| `villkor.pris` | `gratis` eller fritext, t.ex. `"20 kr"` |
| `sprak` | ISO-koder för språk personalen talar, tom lista om okänt |
| `status` | `verifierad` eller `ej verifierad` |
| `anteckning` | internt, visas inte på sajten. Skriv gärna vad källan säger ordagrant om tiderna. |

## organisations.json

```json
{
  "id": "stockholms-stadsmission",
  "namn": "Stockholms Stadsmission",
  "webb": "",
  "telefon": "",
  "gava": { "swish": "", "bankgiro": "", "plusgiro": "", "url": "" },
  "volontar": "",
  "kalla": "",
  "senastKontrollerad": "2026-11-06",
  "status": "ej verifierad"
}
```

## kontakter.json – telefonnummer för beslutsträdet

```json
{
  "id": "socialjouren",
  "namn": "Socialjouren Stockholm",
  "telefon": "",
  "beskrivning": { "sv": "", "en": "", "ro": "" },
  "oppet": { "sv": "", "en": "", "ro": "" },
  "webb": "",
  "kalla": "",
  "senastKontrollerad": "2026-11-06",
  "status": "ej verifierad"
}
```
