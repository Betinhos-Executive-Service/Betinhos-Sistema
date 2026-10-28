import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneDigits, passengerContactLinks } from "../src/features/detalhe/passengerContact.ts";

test("monta tel: e WhatsApp a partir do telefone", () => {
  assert.deepEqual(passengerContactLinks("+55 (11) 90000-0010"), { tel: "tel:5511900000010", whatsapp: "https://wa.me/5511900000010" });
  assert.deepEqual(passengerContactLinks("(11) 3333-4444"), { tel: "tel:551133334444", whatsapp: "https://wa.me/551133334444" });
});

test("usa o link do WhatsApp com mensagem quando vier do Dataverse", () => {
  const url = "https://wa.me/5511900000010?text=Ol%C3%A1";
  assert.equal(passengerContactLinks("11900000010", url)?.whatsapp, url);
  assert.equal(passengerContactLinks("11900000010", url)?.tel, "tel:5511900000010");
});

test("linha sem telefone não tem atalhos", () => {
  assert.equal(passengerContactLinks(""), null);
  assert.equal(passengerContactLinks(undefined), null);
  assert.equal(passengerContactLinks("Sem telefone"), null);
  assert.equal(normalizePhoneDigits("+44 20 7946 0958"), "442079460958");
});

test("bandeira pelo rótulo do idioma", async () => {
  const { languageFlagCode } = await import("../src/lib/passengerContact.ts");
  assert.equal(languageFlagCode("Português"), "BR");
  assert.equal(languageFlagCode("Inglês"), "US");
  assert.equal(languageFlagCode("Espanhol"), "ES");
  assert.equal(languageFlagCode("Francês"), "FR");
  assert.equal(languageFlagCode("Italiano"), "IT");
  assert.equal(languageFlagCode("Alemão"), "DE");
  assert.equal(languageFlagCode("Japonês"), "JP");
  assert.equal(languageFlagCode("Chinês"), "CN");
  assert.equal(languageFlagCode("Russo"), null);
  assert.equal(languageFlagCode(""), null);
  assert.equal(languageFlagCode(undefined), null);
});
