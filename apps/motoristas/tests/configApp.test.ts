import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigEfetiva } from "@betinhos/app-config";
import {
  CONFIG_STORAGE_KEY,
  INTERVALO_RELEITURA_MS,
  chaveDaTela,
  criarConfigApp,
  iniciarPreview,
  ligadoEm,
  lerGuardada,
  lerResultado,
  MENSAGEM_PREVIEW_CONFIG,
  MENSAGEM_PREVIEW_PRONTO,
  precisaReler,
  reservaDoPadrao
} from "../src/app/configApp.ts";
import { getInitialScreenFromHashRoute, telaPermitida } from "../src/app/rotaInicial.ts";
import { tourChaptersForScreen } from "../src/app/tourChapters.ts";
import type { Screen } from "../src/types.ts";

const HOJE = "2026-11-23";

function config(chaves: Record<string, boolean>, versao: number | null = 3): ConfigEfetiva {
  return { versao, perfil: "proprio", piloto: false, semVinculo: false, chaves, origens: {} };
}

function armazenamento() {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor)
  };
}

function montar(opcoes: { ler?: () => Promise<ConfigEfetiva>; guardada?: { config: ConfigEfetiva; lidoEm: number }; preview?: boolean; reservaLocal?: Record<string, boolean> } = {}) {
  const disco = armazenamento();
  if (opcoes.guardada) disco.setItem(CONFIG_STORAGE_KEY, JSON.stringify(opcoes.guardada));
  const relogio = { agora: 1_000_000 };
  let leituras = 0;
  const app = criarConfigApp({
    armazenamento: () => disco,
    ler: async () => { leituras += 1; return (opcoes.ler ?? (async () => config({})))(); },
    agora: () => relogio.agora,
    hoje: () => HOJE,
    preview: opcoes.preview ?? false,
    reservaLocal: opcoes.reservaLocal
  });
  return { app, disco, relogio, leituras: () => leituras };
}

test("sem leitura nem versão guardada vale o padrão do catálogo pelo vínculo", () => {
  const { app } = montar();
  assert.equal(app.fonte(), "padrao");
  assert.equal(app.ligado("multas"), false);
  assert.equal(app.ligado("services.qrCharge"), false);
  assert.equal(app.ligado("services.personalReceipt"), false);
  assert.equal(app.ligado("history"), true);
  assert.equal(app.ligado("expenses"), true);
  assert.equal(reservaDoPadrao(1, HOJE).perfil, "terceiro");
});

test("reservaLocal mantém recibo e QR ligados no dev em localhost", () => {
  const { app } = montar({ reservaLocal: { "services.qrCharge": true, "services.personalReceipt": true } });
  assert.equal(app.ligado("services.qrCharge"), true);
  assert.equal(app.ligado("multas"), false);
});

test("chave ausente liga; função só vale com o módulo pai ligado; chaves fixas nunca desligam", () => {
  const c = config({ services: false, comunicados: false, "services.qrCharge": true });
  assert.equal(ligadoEm(c, "ideas"), true);
  assert.equal(ligadoEm(c, "services"), true);
  assert.equal(ligadoEm(c, "comunicados"), true);
  assert.equal(ligadoEm(c, "services.qrCharge"), true);
  assert.equal(ligadoEm(config({ "services.qrCharge": false }), "services.qrCharge"), false);
});

test("guarda a leitura no aparelho e a usa na próxima abertura", async () => {
  const lida = config({ history: false });
  const a = montar({ ler: async () => lida });
  await a.app.reler();
  assert.equal(a.app.fonte(), "servidor");
  assert.equal(a.app.ligado("history"), false);
  const guardada = lerGuardada(a.disco);
  assert.deepEqual(guardada?.config.chaves, { history: false });
  assert.equal(guardada?.lidoEm, 1_000_000);

  const b = montar({ guardada: guardada! });
  assert.equal(b.app.fonte(), "guardada");
  assert.equal(b.app.ligado("history"), false);
});

test("releitura respeita o limite de 5 minutos e `forcar` ignora", async () => {
  const { app, relogio, leituras } = montar();
  await app.reler();
  assert.equal(leituras(), 1);
  relogio.agora += INTERVALO_RELEITURA_MS - 1;
  await app.reler();
  assert.equal(leituras(), 1);
  relogio.agora += 1;
  await app.reler();
  assert.equal(leituras(), 2);
  await app.reler({ forcar: true });
  assert.equal(leituras(), 3);
  assert.equal(precisaReler(10, null), true);
  assert.equal(precisaReler(10, 10), false);
});

test("falha na leitura (inclusive MOTORISTA_INVALIDO) mantém a guardada ou o padrão", async () => {
  const guardada = { config: config({ ideas: false }), lidoEm: 1 };
  const a = montar({ guardada, ler: async () => { throw new Error("MOTORISTA_INVALIDO"); } });
  await a.app.reler();
  assert.equal(a.app.ligado("ideas"), false);
  assert.equal(a.app.fonte(), "guardada");

  const b = montar({ ler: async () => { throw new Error("rede"); } });
  await b.app.reler();
  assert.equal(b.app.fonte(), "padrao");
  assert.equal(b.app.ligado("multas"), false);
});

test("leitura recebida fora do Início só vale quando o motorista volta ao Início", async () => {
  const { app } = montar({ ler: async () => config({ history: false }) });
  app.definirNoInicio(false);
  await app.reler();
  assert.equal(app.ligado("history"), true);
  app.definirNoInicio(true);
  assert.equal(app.ligado("history"), false);
});

test("vínculo refina só a reserva do padrão, não uma config lida", async () => {
  const a = montar();
  a.app.definirVinculo(1);
  assert.equal(a.app.config().perfil, "terceiro");
  const b = montar({ ler: async () => config({}) });
  await b.app.reler();
  b.app.definirVinculo(1);
  assert.equal(b.app.config().perfil, "proprio");
});

test("resposta da Custom API fora do formato é recusada", () => {
  assert.throws(() => lerResultado({ Resultado: "{}" }));
  assert.throws(() => lerResultado(null));
  const ok = lerResultado({ Resultado: JSON.stringify({ versao: 2, perfil: "terceiro", piloto: false, semVinculo: false, chaves: { multas: true, lixo: "x" }, origens: {} }) });
  assert.deepEqual(ok.chaves, { multas: true });
  assert.equal(ok.perfil, "terceiro");
});

test("preview nunca lê o Dataverse e começa no padrão do catálogo", async () => {
  const { app, leituras } = montar({ preview: true });
  await app.reler({ forcar: true });
  assert.equal(leituras(), 0);
  assert.equal(app.fonte(), "preview");
  assert.equal(app.ligado("multas"), false);
});

test("preview aplica só mensagens de origem permitida e responde pronto ao pai", () => {
  const ouvintes: Array<(evento: MessageEvent) => void> = [];
  const enviadas: unknown[] = [];
  const pai = { postMessage: (dados: unknown, alvo: string) => enviadas.push([dados, alvo]) };
  const alvo = {
    location: { origin: "https://app.exemplo" },
    parent: pai,
    addEventListener: (_: string, f: (evento: MessageEvent) => void) => ouvintes.push(f),
    removeEventListener: () => {}
  } as unknown as Window;
  const { app } = montar({ preview: true });
  let voltouAoInicio = 0;
  const desligar = iniciarPreview(alvo, app, () => { voltouAoInicio += 1; });
  assert.deepEqual(enviadas, [[{ tipo: MENSAGEM_PREVIEW_PRONTO }, "*"]]);
  const mensagem = (origin: string, dados: unknown) => ouvintes[0]({ origin, data: dados } as MessageEvent);

  mensagem("https://outro.exemplo", { tipo: MENSAGEM_PREVIEW_CONFIG, config: config({ history: false }), motorista: { nome: "Ana" } });
  assert.equal(app.ligado("history"), true);
  mensagem("https://app.exemplo", { tipo: "qualquer", config: config({ history: false }) });
  assert.equal(app.ligado("history"), true);
  mensagem("https://app.exemplo", { tipo: MENSAGEM_PREVIEW_CONFIG, config: config({ history: false, expenses: false }), motorista: { nome: "Ana" } });
  assert.equal(app.ligado("history"), false);
  assert.equal(app.ligado("expenses"), false);
  assert.equal(app.nomePreview(), "Ana");
  assert.equal(voltouAoInicio, 1);
  assert.equal(typeof desligar, "function");
});

test("telas dos módulos mapeiam para a chave do catálogo; as demais nunca desligam", async () => {
  assert.equal(chaveDaTela("multas"), "multas");
  assert.equal(chaveDaTela("gastosCartao"), "expenses");
  assert.equal(chaveDaTela("cobrancaQr"), "services.qrCharge");
  assert.equal(chaveDaTela("inicio"), null);
  assert.equal(chaveDaTela("comunicados"), null);
  const { app } = montar({ ler: async () => config({ multas: false, expenses: false }) });
  await app.reler();
  assert.equal(app.telaLigada("multas"), false);
  assert.equal(app.telaLigada("gastos" as Screen), false);
  assert.equal(app.telaLigada("inicio"), true);
});

test("rota inicial e links de módulo desligado caem no Início", () => {
  const desligada = (tela: Screen) => tela !== "multas" && tela !== "treinamentos";
  assert.equal(telaPermitida("multas", desligada), "inicio");
  assert.equal(telaPermitida("checklists", desligada), "checklists");
  const pedida = getInitialScreenFromHashRoute({ screen: "multas" } as never, null);
  assert.equal(pedida, "multas");
  assert.equal(telaPermitida(pedida, desligada), "inicio");
});

test("tour: passo do módulo desligado some do capítulo do Início", () => {
  const alvos = (ligado: (chave: string) => boolean) => tourChaptersForScreen("inicio", ligado).flatMap((c) => c.steps.map((p) => JSON.stringify(p.target)));
  const todos = alvos(() => true);
  const semMultas = alvos((chave) => chave !== "multas");
  assert.ok(todos.length > semMultas.length);
  const semHistorico = alvos((chave) => chave !== "history");
  assert.ok(semHistorico.length < todos.length);
  assert.deepEqual(alvos(() => true), alvos((chave) => chave !== "chave-inexistente"));
});
