import assert from "node:assert/strict";
import test from "node:test";
import { ehErroDeRede, SEM_CONEXAO_MESSAGE } from "../src/shared/erroDeRede.ts";
import { reportAppError, type AppErrorNotice } from "../src/shared/appErrorLogger.ts";
import { descreverIndicador } from "../src/features/envio-pendente/textoIndicador.ts";
import { createFila, createMemoryBackend, type FilaItem } from "../src/features/envio-pendente/fila.ts";
import { createProcessador, MENSAGEM_SESSAO } from "../src/features/envio-pendente/processador.ts";

const item = (id: string, extra: Partial<FilaItem> = {}): FilaItem => ({
  id: `SERVICO:${id}`,
  detailId: id,
  detailType: "SERVICO",
  dataverseId: `dv-${id}`,
  titulo: `OS-${id}`,
  tipo: "voucher",
  fields: {},
  finalizadoEm: "2026-11-16T10:00:00.000Z",
  criadoEm: `2026-11-16T10:0${id}:00.000Z`,
  tentativas: 0,
  estado: "pendente",
  ...extra
});

test("ehErroDeRede: falha de transporte e aparelho offline são rede; erro HTTP com rede não é", () => {
  assert.equal(ehErroDeRede(new TypeError("Failed to fetch"), true), true);
  assert.equal(ehErroDeRede(Object.assign(new Error("retrieveMultiple falhou."), { cause: { error: { message: "Failed to fetch" } } }), true), true);
  assert.equal(ehErroDeRede(new Error("Qualquer erro"), false), true, "navigator.onLine false");
  assert.equal(ehErroDeRede(Object.assign(new Error("HTTP 500 Internal Server Error"), { status: 500 }), true), false);
  assert.equal(ehErroDeRede(new Error("Campo obrigatório"), true), false);
});

test("indicador: 'Sem conexão' continua visível junto com a falha e com a ação de sessão/carro", () => {
  const falhou = item("1", { estado: "falhou" });
  assert.equal(descreverIndicador({ itens: [falhou], online: false, total: 1, agendaOfflineEm: null }).texto, "Sem conexão · OS-1 não foi enviado");
  assert.equal(descreverIndicador({ itens: [falhou], online: true, total: 1, agendaOfflineEm: null }).texto, "OS-1 não foi enviado");
  const sessao = item("2", { estado: "precisa-acao", motivo: "sessao", ultimoErro: MENSAGEM_SESSAO });
  assert.equal(descreverIndicador({ itens: [sessao], online: false, total: 1, agendaOfflineEm: null }).texto, `Sem conexão · ${MENSAGEM_SESSAO}`);
  const carro = item("3", { estado: "precisa-acao", motivo: "carro" });
  assert.match(descreverIndicador({ itens: [carro], online: false, total: 1, agendaOfflineEm: null }).texto, /^Sem conexão · OS-3: escolha o carro/);
  assert.equal(descreverIndicador({ itens: [], online: false, total: 0, agendaOfflineEm: null }).texto, "Sem conexão");
  assert.equal(descreverIndicador({ itens: [item("4")], online: false, total: 1, agendaOfflineEm: null }).texto, "Sem conexão · 1 envio pendente");
});

test("fila: sessão expirada (401) deixa o item aguardando login, nunca 'falhou'", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(item("1"));
  await fila.adicionar(item("2"));
  const processador = createProcessador({
    fila,
    enviar: async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); }
  });
  await processador.processar(true);
  const estados = fila.getSnapshot().map((envio) => envio.estado);
  assert.deepEqual(estados, ["precisa-acao", "pendente"]);
  assert.equal(estados.includes("falhou"), false);
});

async function comJanela(onLine: boolean, executar: (avisos: AppErrorNotice[]) => void) {
  const avisos: AppErrorNotice[] = [];
  const janela: Record<string, unknown> = {
    navigator: { onLine, userAgent: "test" },
    location: { href: "https://org.example.crm2.dynamics.com/WebResources/app.html" },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: (event: Event) => {
      if (event.type === "appmotoristas:error") avisos.push((event as CustomEvent<AppErrorNotice>).detail);
      return true;
    },
    setInterval: () => 1,
    clearInterval: () => undefined,
    setTimeout: () => 1
  };
  janela.parent = janela;
  const antesWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const antesNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const antesConsole = console.error;
  Object.defineProperty(globalThis, "window", { configurable: true, value: janela });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: janela.navigator });
  console.error = () => undefined;
  try {
    executar(avisos);
  } finally {
    console.error = antesConsole;
    if (antesWindow) Object.defineProperty(globalThis, "window", antesWindow); else Reflect.deleteProperty(globalThis, "window");
    if (antesNavigator) Object.defineProperty(globalThis, "navigator", antesNavigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
}

test("logger: sem rede não mostra toast técnico; erro real continua igual", async () => {
  await comJanela(false, (avisos) => {
    reportAppError(Object.assign(new Error("retrieveMultiple falhou."), { cause: { error: { message: "Failed to fetch" } } }), { source: "dataverse" });
    assert.equal(avisos.length, 0, "o indicador 'Sem conexão' já cobre");
  });
  await comJanela(true, (avisos) => {
    reportAppError(new Error("Campo obrigatório ausente"), { source: "app" });
    assert.equal(avisos.at(-1)?.userMessage, "Campo obrigatório ausente");
  });
});

test("logger: falha de rede com aparelho online vira um aviso curto, sem repetir a cada requisição", async () => {
  await comJanela(true, (avisos) => {
    reportAppError(new TypeError("Failed to fetch"), { source: "app", action: "abrirServico" });
    reportAppError(new TypeError("Failed to fetch"), { source: "app", action: "abrirServico" });
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].userMessage, SEM_CONEXAO_MESSAGE);
    assert.equal(avisos[0].severity, "info");
    assert.doesNotMatch(avisos[0].userMessage, /feche e reabra|falhou/i);
  });
});
