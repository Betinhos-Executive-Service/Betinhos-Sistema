import assert from "node:assert/strict";
import test from "node:test";
import { appendDitado, formatDitadoTimer, createDitado, getDitadoCtor, DITADO_IDLE, type DitadoRecognition, type DitadoState } from "../src/shared/useDitado.ts";

class FakeRecognition implements DitadoRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: DitadoRecognition["onresult"] = null;
  onerror: DitadoRecognition["onerror"] = null;
  onend: DitadoRecognition["onend"] = null;
  started = 0;
  stopped = 0;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  emit(parts: Array<[string, boolean]>, resultIndex = 0) {
    const results = parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ resultIndex, results });
  }
}

function setup() {
  const finals: string[] = [];
  let state: DitadoState = DITADO_IDLE;
  const ctrl = createDitado(FakeRecognition, { onFinal: (t) => finals.push(t), onState: (s) => (state = s) });
  return { ctrl, finals, get: () => state };
}

test("configura pt-BR, contínuo e resultados provisórios", () => {
  const { ctrl, get } = setup();
  ctrl.start();
  const rec = FakeRecognition.last!;
  assert.equal(rec.lang, "pt-BR");
  assert.equal(rec.continuous, true);
  assert.equal(rec.interimResults, true);
  assert.equal(rec.started, 1);
  assert.equal(get().listening, true);
});

test("texto provisório aparece enquanto fala e o final é entregue", () => {
  const { ctrl, finals, get } = setup();
  ctrl.start();
  const rec = FakeRecognition.last!;
  rec.emit([["passageiro chegou", false]]);
  assert.equal(get().interim, "passageiro chegou");
  assert.deepEqual(finals, []);
  rec.emit([["passageiro chegou cedo", true]]);
  assert.deepEqual(finals, ["passageiro chegou cedo"]);
  assert.equal(get().interim, "");
});

test("acrescenta o final ao texto existente com espaço, sem apagar", () => {
  assert.equal(appendDitado("Cliente atrasou", " e pediu troca"), "Cliente atrasou e pediu troca");
  assert.equal(appendDitado("", "olá"), "olá");
  assert.equal(appendDitado("Linha 1\n", "linha 2"), "Linha 1\nlinha 2");
  assert.equal(appendDitado("texto", "  "), "texto");
});

test("tocar de novo para o reconhecimento", () => {
  const { ctrl, get } = setup();
  ctrl.toggle();
  const rec = FakeRecognition.last!;
  rec.emit([["algo", false]]);
  ctrl.toggle();
  assert.equal(rec.stopped, 1);
  assert.equal(get().listening, false);
  assert.equal(get().interim, "");
});

test("onend encerra o estado de escuta", () => {
  const { ctrl, get } = setup();
  ctrl.start();
  FakeRecognition.last!.onend?.();
  assert.equal(get().listening, false);
  assert.equal(ctrl.isListening(), false);
});

test("erro not-allowed mostra pedido para liberar o microfone", () => {
  const { ctrl, get } = setup();
  ctrl.start();
  FakeRecognition.last!.onerror?.({ error: "not-allowed" });
  assert.equal(get().error, "Libere o microfone para ditar");
});

test("erros no-speech e network têm mensagem própria", () => {
  const { ctrl, get } = setup();
  ctrl.start();
  FakeRecognition.last!.onerror?.({ error: "no-speech" });
  assert.match(get().error, /Não ouvi nada/);
  FakeRecognition.last!.onerror?.({ error: "network" });
  assert.match(get().error, /Sem conexão/);
});

test("sem suporte: construtor ausente (botão não aparece)", () => {
  assert.equal(getDitadoCtor({}), null);
  assert.equal(getDitadoCtor(null), null);
  assert.equal(getDitadoCtor({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
});

function gravado(emit: (rec: FakeRecognition, ctrlFinals: string[]) => void) {
  const { ctrl, finals, get } = setup();
  ctrl.start();
  emit(FakeRecognition.last!, finals);
  return { finals, get, texto: finals.reduce((acc, t) => appendDitado(acc, t), "") };
}

test("Android: finais cumulativos, repetidos e sempre com resultIndex 0 não repetem texto", () => {
  const { texto } = gravado((rec) => {
    rec.emit([["então", true]]);
    rec.emit([["então", true]]);
    rec.emit([["então deu", true]]);
    rec.emit([["então deu", true]]);
    rec.emit([["então deu tudo certo", true]]);
    rec.emit([["então deu tudo certo o serviço aqui", true]]);
    rec.emit([["Então deu tudo certo o serviço aqui eu acabei utilizando", true]]);
    rec.emit([["então deu tudo certo o serviço aqui eu acabei utilizando", true]]);
  });
  assert.equal(texto, "então deu tudo certo o serviço aqui eu acabei utilizando");
});

test("Android: provisório mostra só o que ainda não foi gravado", () => {
  const { get } = gravado((rec) => {
    rec.emit([["então deu", true]]);
    rec.emit([["então deu", true], ["tudo certo", false]]);
  });
  assert.equal(get().interim, "tudo certo");
  const mesmo = gravado((rec) => {
    rec.emit([["então deu", true]]);
    rec.emit([["então deu tudo", false]]);
  });
  assert.equal(mesmo.get().interim, "tudo");
});

test("Android: final repetido no mesmo índice é ignorado", () => {
  const { finals } = gravado((rec) => {
    rec.emit([["oi tudo bem", true]]);
    rec.emit([["oi tudo bem", true]], 0);
    rec.emit([["oi tudo bem", true]], 0);
  });
  assert.deepEqual(finals, ["oi tudo bem"]);
});

test("desktop: finais por trecho continuam entrando inteiros", () => {
  const { texto } = gravado((rec) => {
    rec.emit([["então deu tudo certo", true]], 0);
    rec.emit([["então deu tudo certo", true], ["o serviço aqui", true]], 1);
    rec.emit([["então deu tudo certo", true], ["o serviço aqui", true], ["eu acabei utilizando", true]], 2);
  });
  assert.equal(texto, "então deu tudo certo o serviço aqui eu acabei utilizando");
});

test("nova sessão de escuta zera o último final", () => {
  const { ctrl, finals } = setup();
  ctrl.start();
  FakeRecognition.last!.emit([["bom dia", true]]);
  ctrl.stop();
  ctrl.start();
  FakeRecognition.last!.emit([["bom dia", true]]);
  assert.deepEqual(finals, ["bom dia", "bom dia"]);
});

test("contador do ditado em mm:ss", () => {
  assert.equal(formatDitadoTimer(0), "00:00");
  assert.equal(formatDitadoTimer(9999), "00:09");
  assert.equal(formatDitadoTimer(125000), "02:05");
});
