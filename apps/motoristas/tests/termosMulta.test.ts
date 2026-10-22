import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssinarParams,
  canAdvance,
  capturarSelfieJpeg,
  createSingleFlight,
  descreverAcordo,
  descreverGpsErro,
  initialTermoFlow,
  mapTermo,
  parseEvidencias,
  selfieDimensions,
  SEM_ADITIVO_MENSAGEM,
  termoFlowReducer,
  TERMO_STATUS,
  validarMotivo
} from "../src/lib/termosMulta.ts";
import { executeCustomApi } from "../src/lib/customApi.ts";

const termoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const strokes: [number, number][][] = [[[0.1, 0.1], [0.5, 0.5]]];

test("selfie é reduzida a no máximo 1280 px no maior lado", () => {
  assert.deepEqual(selfieDimensions(1920, 1440), { width: 1280, height: 960 });
  assert.deepEqual(selfieDimensions(1440, 1920), { width: 960, height: 1280 });
  assert.deepEqual(selfieDimensions(640, 480), { width: 640, height: 480 });
});

test("selfie JPEG sai do vídeo com canvas.toBlob('image/jpeg', 0.8) em base64 sem prefixo", async () => {
  const calls: unknown[] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => calls.push(["draw", ...args.slice(1)]) }),
    toBlob: (cb: (blob: Blob) => void, type: string, quality: number) => { calls.push(["toBlob", type, quality]); cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type })); }
  };
  const video = { videoWidth: 1920, videoHeight: 1440 };
  const base64 = await capturarSelfieJpeg(video as never, () => canvas as never);
  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 960);
  assert.deepEqual(calls.find((c) => (c as unknown[])[0] === "toBlob"), ["toBlob", "image/jpeg", 0.8]);
  assert.equal(base64, "/9j/2Q==");
  assert.ok(!base64.startsWith("data:"));
});

test("GPS negado bloqueia o avanço; precisão ruim avisa mas segue", () => {
  const base = { ...initialTermoFlow(), step: "local" as const, selfie: "abc" };
  assert.equal(canAdvance({ ...base, gps: null, gpsErro: descreverGpsErro({ code: 1 }) }), false);
  assert.match(descreverGpsErro({ code: 1 }), /Permitir|Ajustes/);
  assert.equal(canAdvance({ ...base, gps: { latitude: -23.5, longitude: -46.6, precisao: 500 } }), true);
});

test("assinatura vazia bloqueia o envio", () => {
  const base = { ...initialTermoFlow(), step: "assinatura" as const, selfie: "abc", gps: { latitude: 1, longitude: 2, precisao: 10 } };
  assert.equal(canAdvance({ ...base, strokes: [] }), false);
  assert.equal(canAdvance({ ...base, strokes }), true);
});

test("payload de assinarTermo leva GPS e dispositivo e não leva data/hora", () => {
  const params = buildAssinarParams(termoId, { selfieJpegBase64: "/9j/2Q==", strokes, gps: { latitude: -23.5, longitude: -46.6, precisao: 12 }, dispositivo: "UA" });
  assert.deepEqual(Object.keys(params).sort(), ["new_AssinaturaJson", "new_Dispositivo", "new_Latitude", "new_Longitude", "new_PrecisaoGps", "new_SelfieBase64", "new_TermoId"]);
  assert.equal(params.new_Latitude, -23.5);
  assert.equal(params.new_AssinaturaJson, JSON.stringify(strokes));
  assert.ok(!JSON.stringify(params).match(/assinadoem|data|hora|T\d\d:\d\d/i));
});

test("erro da API mostra a mensagem do servidor e preserva selfie e assinatura", () => {
  const ready = { ...initialTermoFlow(), step: "assinatura" as const, selfie: "abc", strokes, gps: { latitude: 1, longitude: 2, precisao: 10 } };
  const sending = termoFlowReducer(ready, { type: "submit" });
  const failed = termoFlowReducer(sending, { type: "error", message: "Este termo não é seu." });
  assert.equal(failed.step, "assinatura");
  assert.equal(failed.erro, "Este termo não é seu.");
  assert.equal(failed.selfie, "abc");
  assert.deepEqual(failed.strokes, strokes);
  assert.equal(failed.enviando, false);
  const semAditivo = termoFlowReducer(sending, { type: "error", message: SEM_ADITIVO_MENSAGEM });
  assert.equal(semAditivo.step, "semAditivo");
});

test("Custom API recusada expõe a mensagem do servidor", async () => {
  const previousWindow = (globalThis as any).window;
  const windowMock: any = { Xrm: { WebApi: { online: { execute: async () => new Response(JSON.stringify({ error: { message: "Este termo não é seu." } }), { status: 400 }) } } } };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    await assert.rejects(executeCustomApi("new_AssinarTermoMulta", { new_TermoId: termoId }), (error: any) => error.serverMessage === "Este termo não é seu.");
  } finally {
    (globalThis as any).window = previousWindow;
  }
});

test("duplo clique envia uma vez", async () => {
  let calls = 0;
  let release!: () => void;
  const send = createSingleFlight(() => { calls += 1; return new Promise<void>((resolve) => { release = resolve; }); });
  const a = send();
  const b = send();
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  const c = send();
  release();
  await c;
  assert.equal(calls, 2);
});

test("contestar com 5 caracteres bloqueia", () => {
  assert.match(validarMotivo("curto"), /10/);
  assert.equal(validarMotivo("Não estava dirigindo o carro."), "");
  assert.match(validarMotivo("x".repeat(2001)), /2\.000/);
});

test("acordo e evidências seguem o contrato do plugin", () => {
  const termo = mapTermo({
    new_termomultaid: termoId, new_name: "TM-ABC1D23-20261022", new_status: TERMO_STATUS.pendente, new_formapagamento: 100000001,
    new_parcelas: 3, new_valortotal: 195.23, new_valorparcela: 65.08, new_primeiracompetencia: "2026-11-01",
    new_evidenciasjson: JSON.stringify({ multa: { placa: "ABC1D23", dataHora: "2026-10-01T13:00:00Z", local: "Av. Paulista", valorGuia: 195.23 }, infracao: { codigo: "745-5", descricao: "Excesso de velocidade", valor: 195.23 }, infleet: { erro: "timeout" } })
  });
  assert.equal(descreverAcordo(termo), "Desconto em folha em 3x de R$ 65,08 — nov/26, dez/26, jan/27");
  assert.equal(descreverAcordo({ ...termo, formaPagamento: 100000000 }), "Você paga a guia");
  const ev = parseEvidencias(termo.evidenciasJson);
  assert.equal(ev.placa, "ABC1D23");
  assert.equal(ev.infracao, "745-5 - Excesso de velocidade");
  assert.equal(ev.infleetIndisponivel, true);
});
