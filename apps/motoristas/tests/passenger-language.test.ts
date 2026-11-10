import { test } from "node:test";
import assert from "node:assert/strict";
import { getPassengerLanguageCode } from "../src/features/servicos/agendaRemota.ts";

const F = "cr40f_idioma@OData.Community.Display.V1.FormattedValue";

test("código da bandeira do idioma do passageiro", () => {
  assert.equal(getPassengerLanguageCode({ cr40f_idioma: 202410000 }), "BR");
  assert.equal(getPassengerLanguageCode({ cr40f_idioma: 202410001 }), "US");
  assert.equal(getPassengerLanguageCode({ cr40f_idioma: 202410002, [F]: "Espanhol" }), "ES");
  assert.equal(getPassengerLanguageCode({}), "");
  assert.equal(getPassengerLanguageCode({ cr40f_idioma: 1, [F]: "Francês" }), "");
});

test("marcador de bandeira vira parte flag no HTML seguro", async () => {
  const { parseSafeDetailHtml } = await import("../src/features/detalhe/detailHtml.ts");
  const { buildLanguageFlagHtml } = await import("../src/features/servicos/agendaRemota.ts");
  const parts = parseSafeDetailHtml(`<span>${buildLanguageFlagHtml("US")}Ana - <a href="https://wa.me/1">+1</a></span>`);
  assert.deepEqual(parts[0], { type: "flag", code: "US" });
  assert.equal(buildLanguageFlagHtml(""), "");
});
