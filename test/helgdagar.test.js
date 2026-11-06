import { test } from "node:test";
import assert from "node:assert/strict";
import { paskdagen, helgdagar, helgdag, HELGDAGAR_ID } from "../lib/helgdagar.js";

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

test("påskdagen för kända år", () => {
  assert.equal(iso(paskdagen(2024)), "2024-03-31");
  assert.equal(iso(paskdagen(2025)), "2025-04-20");
  assert.equal(iso(paskdagen(2026)), "2026-04-05");
  assert.equal(iso(paskdagen(2027)), "2027-03-28");
  assert.equal(iso(paskdagen(2038)), "2038-04-25"); // senast möjliga
});

test("rörliga helgdagar 2026 räknas från påsk", () => {
  const h = helgdagar(2026);
  assert.equal(h["2026-04-03"], "langfredagen");
  assert.equal(h["2026-04-05"], "paskdagen");
  assert.equal(h["2026-04-06"], "annandag-pask");
  assert.equal(h["2026-05-14"], "kristi-himmelsfardsdag");
  assert.equal(h["2026-05-24"], "pingstdagen");
});

test("midsommar och alla helgons dag ligger på rätt lördag", () => {
  assert.equal(helgdagar(2026)["2026-06-20"], "midsommardagen");
  assert.equal(helgdagar(2026)["2026-06-19"], "midsommarafton");
  assert.equal(helgdagar(2027)["2027-06-26"], "midsommardagen");
  assert.equal(helgdagar(2026)["2026-10-31"], "alla-helgons-dag");
  assert.equal(helgdagar(2027)["2027-11-06"], "alla-helgons-dag");
  assert.equal(helgdagar(2026)["2026-11-07"], undefined);
});

test("fasta helgdagar och aftnar", () => {
  const h = helgdagar(2026);
  assert.equal(h["2026-01-01"], "nyarsdagen");
  assert.equal(h["2026-01-06"], "trettondedag-jul");
  assert.equal(h["2026-05-01"], "forsta-maj");
  assert.equal(h["2026-06-06"], "nationaldagen");
  assert.equal(h["2026-12-24"], "julafton");
  assert.equal(h["2026-12-25"], "juldagen");
  assert.equal(h["2026-12-26"], "annandag-jul");
  assert.equal(h["2026-12-31"], "nyarsafton");
});

test("helgdag() slår upp per datum, vanliga dagar ger null", () => {
  assert.equal(helgdag("2026-12-25"), "juldagen");
  assert.equal(helgdag("2026-11-09"), null);
  assert.equal(helgdag(""), null);
  assert.equal(helgdag(null), null);
  // Varje år har exakt 16 helgdagar och alla id:n finns i listan
  for (const ar of [2025, 2026, 2027, 2030]) {
    const ids = Object.values(helgdagar(ar));
    assert.equal(ids.length, 16);
    assert.deepEqual([...ids].sort(), [...HELGDAGAR_ID].sort());
  }
});
