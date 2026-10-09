import { test } from "node:test";
import assert from "node:assert/strict";
import { getPassengerLanguageFlag } from "../src/lib/dataverse.ts";

const F = "cr40f_idioma@OData.Community.Display.V1.FormattedValue";

test("bandeira do idioma do passageiro", () => {
  assert.equal(getPassengerLanguageFlag({ cr40f_idioma: 202410000 }), "🇧🇷");
  assert.equal(getPassengerLanguageFlag({ cr40f_idioma: 202410001 }), "🇺🇸");
  assert.equal(getPassengerLanguageFlag({ cr40f_idioma: 202410002, [F]: "Espanhol" }), "🇪🇸");
  assert.equal(getPassengerLanguageFlag({}), "");
  assert.equal(getPassengerLanguageFlag({ cr40f_idioma: 1, [F]: "Francês" }), "");
});
