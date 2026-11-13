import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASSENGER_MESSAGE_TEMPLATES,
  PASSENGER_MESSAGE_TEMPLATE_COUNT,
  buildPassengerMessage,
  buildPassengerMessageFromTemplate,
  passengerMessageLanguage,
  pickPassengerMessageTemplate
} from "../src/features/servicos/passengerMessage.ts";

const LANGUAGES = ["BR", "US", "ES"] as const;
const SERVICE = new Date(2026, 10, 14, 8, 30);
const MORNING = new Date(2026, 10, 13, 9, 0);
const base = { passengerName: "Ana Paula Souza", driverName: "Lohan Silva", serviceDate: SERVICE, now: MORNING };

test("8 modelos em cada idioma", () => {
  assert.equal(PASSENGER_MESSAGE_TEMPLATE_COUNT, 8);
  for (const templates of Object.values(PASSENGER_MESSAGE_TEMPLATES)) assert.equal(templates.length, 8);
});

test("idioma do cadastro escolhe a língua; sem idioma é português", () => {
  assert.equal(passengerMessageLanguage("BR"), "pt");
  assert.equal(passengerMessageLanguage("US"), "en");
  assert.equal(passengerMessageLanguage("ES"), "es");
  assert.equal(passengerMessageLanguage(""), "pt");
  assert.equal(passengerMessageLanguage(), "pt");
});

test("sorteio cobre todos os modelos e fica dentro do intervalo", () => {
  const seen = new Set<number>();
  for (let i = 0; i < PASSENGER_MESSAGE_TEMPLATE_COUNT; i++) {
    seen.add(pickPassengerMessageTemplate(() => (i + 0.5) / PASSENGER_MESSAGE_TEMPLATE_COUNT));
  }
  assert.equal(seen.size, PASSENGER_MESSAGE_TEMPLATE_COUNT);
  assert.equal(pickPassengerMessageTemplate(() => 0), 0);
  assert.equal(pickPassengerMessageTemplate(() => 0.9999999), PASSENGER_MESSAGE_TEMPLATE_COUNT - 1);
  assert.equal(pickPassengerMessageTemplate(() => 1), PASSENGER_MESSAGE_TEMPLATE_COUNT - 1);
});

test("os modelos são diferentes entre si em cada idioma", () => {
  for (const languageCode of LANGUAGES) {
    const texts = new Set(
      Array.from({ length: PASSENGER_MESSAGE_TEMPLATE_COUNT }, (_, i) => buildPassengerMessageFromTemplate(i, { ...base, languageCode }))
    );
    assert.equal(texts.size, PASSENGER_MESSAGE_TEMPLATE_COUNT, languageCode);
  }
});

test("todo modelo leva primeiro nome do passageiro e do motorista, data e contatos da central", () => {
  const when = { BR: "14/11, 08:30", US: "Nov 14, 8:30 AM", ES: "14/11, 08:30" };
  for (const languageCode of LANGUAGES) {
    for (let i = 0; i < PASSENGER_MESSAGE_TEMPLATE_COUNT; i++) {
      const text = buildPassengerMessageFromTemplate(i, { ...base, languageCode });
      const label = `${languageCode} modelo ${i}`;
      assert.match(text, /\bAna\b/, label);
      assert.doesNotMatch(text, /Paula|Souza/, label);
      assert.match(text, /\bLohan\b/, label);
      assert.doesNotMatch(text, /Silva/, label);
      assert.ok(text.includes(when[languageCode]), `${label}: ${text}`);
      assert.ok(text.includes("+55 (12) 99723-6961"), label);
      assert.ok(text.includes("junior@betinhos.com.br"), label);
      assert.doesNotMatch(text, /\{|\}|undefined|null/, label);
    }
  }
});

test("modelo 1 em português sai como aprovado", () => {
  assert.equal(
    buildPassengerMessageFromTemplate(0, { ...base, languageCode: "BR" }),
    [
      "Olá, Ana!",
      "",
      "Sou o Lohan, da Betinhos, e vou fazer o seu transporte em 14/11, 08:30.",
      "Se precisar de alguma coisa, a nossa central atende pelo +55 (12) 99723-6961 ou pelo e-mail junior@betinhos.com.br.",
      "",
      "Até breve!"
    ].join("\n")
  );
});

test("modelo 2 cumprimenta pelo horário do envio", () => {
  const at = (hour: number) => new Date(2026, 10, 13, hour, 0);
  const first = (languageCode: string, hour: number) =>
    buildPassengerMessageFromTemplate(1, { ...base, languageCode, now: at(hour) }).split("\n")[0];
  assert.equal(first("BR", 9), "Bom dia, Ana.");
  assert.equal(first("BR", 14), "Boa tarde, Ana.");
  assert.equal(first("BR", 20), "Boa noite, Ana.");
  assert.equal(first("US", 9), "Good morning, Ana.");
  assert.equal(first("US", 20), "Good evening, Ana.");
  assert.equal(first("ES", 14), "Buenas tardes, Ana.");
});

test("sem nome do motorista nem data, nenhum modelo fica com buraco", () => {
  for (const languageCode of LANGUAGES) {
    for (let i = 0; i < PASSENGER_MESSAGE_TEMPLATE_COUNT; i++) {
      const text = buildPassengerMessageFromTemplate(i, { passengerName: "", driverName: "", serviceDate: null, languageCode, now: MORNING });
      const label = `${languageCode} modelo ${i}: ${text}`;
      assert.doesNotMatch(text, / [,.!?:]/, label);
      assert.doesNotMatch(text, /, ,|\b(em|on|el|del)\s*[.,]/, label);
      assert.doesNotMatch(text, /  /, label);
      assert.doesNotMatch(text, /undefined|null|NaN|Invalid/, label);
    }
  }
  assert.equal(
    buildPassengerMessageFromTemplate(0, { passengerName: "Ana", driverName: "", serviceDate: null, languageCode: "BR" }).split("\n")[2],
    "Sou o motorista da Betinhos e vou fazer o seu transporte."
  );
  assert.equal(
    buildPassengerMessageFromTemplate(0, { passengerName: "Ana", driverName: "Lohan", serviceDate: null, languageCode: "BR" }).split("\n")[2],
    "Sou o Lohan, da Betinhos, e vou fazer o seu transporte."
  );
});

test("buildPassengerMessage usa o sorteio informado", () => {
  const last = PASSENGER_MESSAGE_TEMPLATE_COUNT - 1;
  assert.equal(
    buildPassengerMessage({ ...base, languageCode: "ES", random: () => 0.99 }),
    buildPassengerMessageFromTemplate(last, { ...base, languageCode: "ES" })
  );
});
