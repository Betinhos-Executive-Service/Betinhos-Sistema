import assert from "node:assert/strict";
import test from "node:test";
import { EVENTOS, eventosNovos, guardarInscricao, MOTORISTA_DEFINIDO, payloadAviso, textoAviso, validarInscricao } from "../src/avisos.mjs";
import { toBase64Url } from "../src/webpush.mjs";

const b64 = (n) => toBase64Url(new Uint8Array(n).fill(4));
const valida = (extra = {}) => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64(65), auth: b64(16), idioma: "en", ...extra });
const etapas = (atual) => [{ tipo: "saida", atual: atual === 0 }, { tipo: "parada", atual: atual === 1 }, { tipo: "destino", atual: atual === 2 }];

test("gatilhos dos eventos", () => {
  const casos = [
    [{ fase: "a_caminho", chegando: false, etapas: etapas(0) }, []],
    [{ fase: "a_caminho", chegando: true, etapas: etapas(0) }, ["chegando_embarque"]],
    [{ fase: "no_local", etapas: etapas(0) }, ["chegou_embarque"]],
    [{ fase: "em_viagem", chegando: false, etapas: etapas(1), marcos: { saiuEmbarqueEm: "x" } }, ["viagem_iniciada"]],
    [{ fase: "em_viagem", chegando: true, etapas: etapas(1) }, ["viagem_iniciada"]],
    [{ fase: "em_viagem", chegando: true, etapas: etapas(2) }, ["viagem_iniciada", "chegando_destino"]],
    [{ fase: "em_viagem", chegando: true }, ["viagem_iniciada", "chegando_destino"]],
    [{ fase: "concluido", marcos: { saiuEmbarqueEm: "x" } }, ["concluido"]],
    [{ fase: null, chegando: false }, []],
    [null, []],
  ];
  for (const [d, esperado] of casos) assert.deepEqual(eventosNovos(d, {}), esperado, JSON.stringify(d));
});

test("evento já enviado não volta", () => {
  assert.deepEqual(eventosNovos({ fase: "no_local" }, { chegou_embarque: true }), []);
  assert.deepEqual(eventosNovos({ fase: "em_viagem", chegando: true }, { viagem_iniciada: true }), ["chegando_destino"]);
  assert.deepEqual(EVENTOS, ["chegando_embarque", "chegou_embarque", "viagem_iniciada", "chegando_destino", "concluido"]);
});

test("textos nos 3 idiomas, sem endereço nem nome do passageiro", () => {
  const dados = {
    motorista: { nome: "Carlos" }, veiculo: { modelo: "Corolla", cor: "Preto", placa: "ABC1D23" }, eta: { minutos: 30 },
    passageiro: "Maria Souza", posicao: { endereco: "Rua Secreta, 123" }, embarque: { label: "Rua Secreta, 123" }, titulo: "OS-1 Maria Souza",
  };
  const agora = Date.parse("2026-11-13T15:00:00Z");
  for (const idioma of ["pt", "en", "es"]) {
    for (const e of EVENTOS) {
      const { titulo, corpo } = textoAviso(e, dados, idioma, agora);
      assert.ok(titulo, `${e}/${idioma}`);
      assert.doesNotMatch(`${titulo} ${corpo}`, /Maria|Souza|Secreta|123|\{|undefined|null/, `${e}/${idioma}`);
    }
  }
  assert.deepEqual(textoAviso("chegando_embarque", dados, "pt"), { titulo: "Carlos está chegando", corpo: "Corolla Preto ABC1D23" });
  assert.equal(textoAviso("chegou_embarque", dados, "en").corpo, "Look for the Corolla Black, plate ABC1D23");
  assert.equal(textoAviso("viagem_iniciada", dados, "pt", agora).corpo, "Previsão de chegada 12:30");
  assert.equal(textoAviso("viagem_iniciada", { ...dados, eta: null }, "es").corpo, "");
  assert.equal(textoAviso("chegando_embarque", {}, "es").titulo, "Tu conductor está llegando");
  assert.equal(textoAviso("concluido", dados, "xx").titulo, "Viagem concluída");
  assert.deepEqual(payloadAviso("aB3dE5gH7jK9", "concluido", dados, "en"), { titulo: "Ride completed", corpo: "Tap to rate", url: "/r/aB3dE5gH7jK9", tag: "aB3dE5gH7jK9:concluido" });
});

test("validação da inscrição", () => {
  const { inscricao } = validarInscricao(valida());
  assert.equal(inscricao.idioma, "en");
  assert.equal(validarInscricao(valida({ idioma: "fr" })).inscricao.idioma, "pt");
  for (const ruim of [
    { endpoint: "http://fcm.googleapis.com/x" }, { endpoint: "https://evil.example.com/x" },
    { endpoint: `https://fcm.googleapis.com/${"a".repeat(1100)}` }, { endpoint: 42 },
    { p256dh: b64(64) }, { auth: b64(15) }, { auth: "@@@" },
  ]) assert.ok(validarInscricao(valida(ruim)).erro, JSON.stringify(ruim).slice(0, 60));
  assert.ok(validarInscricao(null).erro);
});

test("até 5 inscrições; mesma endpoint substitui; a 6ª tira a mais antiga", () => {
  let lista = [];
  for (let i = 0; i < 6; i++) lista = guardarInscricao(lista, { endpoint: `e${i}` });
  assert.deepEqual(lista.map((i) => i.endpoint), ["e1", "e2", "e3", "e4", "e5"]);
  lista = guardarInscricao(lista, { endpoint: "e2", idioma: "es" });
  assert.deepEqual(lista.map((i) => i.endpoint), ["e1", "e3", "e4", "e5", "e2"]);
});

test("aviso do motorista: primeiro nome, carro e placa; sem carro, convite a abrir", () => {
  const dados = { motorista: { nome: "Carlos Souza" }, veiculo: { modelo: "Corolla", cor: "Prata", placa: "RUH7G45" } };
  assert.deepEqual(textoAviso(MOTORISTA_DEFINIDO, dados, "pt"), { titulo: "Seu motorista é Carlos", corpo: "Corolla Prata · RUH7G45" });
  assert.deepEqual(textoAviso(MOTORISTA_DEFINIDO, { ...dados, veiculo: { placa: "RUH7G45" } }, "en"), { titulo: "Your driver is Carlos", corpo: "RUH7G45" });
  assert.equal(textoAviso(MOTORISTA_DEFINIDO, { motorista: { nome: "Ana" } }, "es").corpo, "Toca para ver los detalles");
  assert.equal(payloadAviso("x", MOTORISTA_DEFINIDO, dados, "pt").tag, "x:motorista_definido");
});
