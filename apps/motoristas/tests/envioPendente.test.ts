import assert from "node:assert/strict";
import test from "node:test";
import { classificarErro } from "../src/features/envio-pendente/classificarErro.ts";
import { chaveDoEnvio, createFila, createMemoryBackend, tituloDoEnvio, type FilaItem } from "../src/features/envio-pendente/fila.ts";
import { criarEnviador } from "../src/features/envio-pendente/enviador.ts";
import { createProcessador, esperaDaTentativa, MENSAGEM_SESSAO } from "../src/features/envio-pendente/processador.ts";
import type { FinalizePayload } from "../src/features/finalizar/remoto.ts";
import type { InfleetVehicleResolution } from "../src/lib/serviceVehicleInfleet.ts";
import type { DetailData } from "../src/types.ts";

const detalhe = (id: string, cr40fId = "1234"): DetailData => ({
  type: "SERVICO",
  id,
  title: "Detalhes do Serviço",
  fields: [],
  actions: [],
  dataverse: { entitySetName: "cr40f_reservadeveculos", id: `dv-${id}`, record: { cr40f_id: cr40fId } }
});

const novoItem = (id: string, extra: Partial<FilaItem> = {}): FilaItem => {
  const detail = detalhe(id);
  return {
    id: chaveDoEnvio(detail),
    detailId: detail.id,
    detailType: detail.type,
    dataverseId: detail.dataverse!.id,
    titulo: tituloDoEnvio(detail),
    tipo: "voucher",
    detail,
    fields: { Observacao: "ok" },
    signatureDataUrl: "data:image/png;base64,AAAA",
    finalizadoEm: "2026-11-16T10:00:00.000Z",
    criadoEm: `2026-11-16T10:0${id}:00.000Z`,
    tentativas: 0,
    estado: "pendente",
    ...extra
  };
};

const comStatus = (status: number, message = "erro") => Object.assign(new Error(message), { status });

test("classificarErro: só rede vai para a fila, sessão pede login e o resto é negócio", () => {
  assert.equal(classificarErro(new Error("qualquer"), false), "rede");
  assert.equal(classificarErro(new TypeError("Failed to fetch"), true), "rede");
  assert.equal(classificarErro(Object.assign(new Error("x"), { name: "AbortError" }), true), "rede");
  assert.equal(classificarErro(Object.assign(new Error("x"), { name: "TimeoutError" }), true), "rede");
  assert.equal(classificarErro(comStatus(504), true), "rede");
  assert.equal(classificarErro(comStatus(503), true), "rede");
  assert.equal(classificarErro(comStatus(502), true), "rede");
  assert.equal(classificarErro(Object.assign(new Error("Flow sem resposta. Verifique CORS"), { cause: new TypeError("Failed to fetch") }), true), "rede");
  assert.equal(classificarErro(Object.assign(new Error("envolvido"), { cause: new TypeError("Load failed") }), true), "rede");
  assert.equal(classificarErro(comStatus(401), true), "sessao");
  assert.equal(classificarErro(comStatus(403), true), "sessao");
  assert.equal(classificarErro(new Error("Sua sessão da Microsoft expirou. Entre de novo para continuar."), true), "sessao");
  assert.equal(classificarErro(comStatus(400, "Campo obrigatório"), true), "negocio");
  assert.equal(classificarErro(comStatus(500, "Erro no plugin"), true), "negocio");
  assert.equal(classificarErro("texto qualquer", true), "negocio");
});

test("tituloDoEnvio: número vira OS-<n>; sem número usa o id do detalhe", () => {
  assert.equal(tituloDoEnvio(detalhe("a", "1234")), "OS-1234");
  assert.equal(tituloDoEnvio(detalhe("a", "OS-9")), "OS-9");
  assert.equal(tituloDoEnvio({ id: "xyz" }), "xyz");
});

test("fila: grava no aparelho antes de devolver, não duplica e sobrevive ao reabrir o app", async () => {
  const backend = createMemoryBackend();
  const fila = createFila(backend);
  const primeiro = novoItem("1", { criadoEm: "2020-01-01T00:00:00.000Z" });
  await fila.adicionar(primeiro);
  await fila.adicionar(novoItem("1"));
  await fila.adicionar(novoItem("2"));
  assert.equal(fila.getSnapshot().length, 2);
  assert.equal((await backend.getAll()).length, 2);

  // App reaberto: instância nova sobre o mesmo armazenamento; item antigo não expira.
  const reaberta = createFila(backend);
  await reaberta.carregar();
  assert.deepEqual(reaberta.getSnapshot().map((item) => item.id), [primeiro.id, chaveDoEnvio(detalhe("2"))]);
  assert.equal(reaberta.getSnapshot()[0].signatureDataUrl, "data:image/png;base64,AAAA");
  assert.equal(reaberta.getSnapshot()[0].finalizadoEm, "2026-11-16T10:00:00.000Z");
});

test("fila: ao reabrir, 'enviando' e parada por sessão voltam a pendente; escolha de carro continua pedindo ação", async () => {
  const backend = createMemoryBackend();
  const fila = createFila(backend);
  await fila.adicionar(novoItem("1", { estado: "enviando" }));
  await fila.adicionar(novoItem("2", { estado: "precisa-acao", motivo: "sessao" }));
  await fila.adicionar(novoItem("3", { estado: "precisa-acao", motivo: "carro" }));
  await fila.adicionar(novoItem("4", { estado: "falhou", ultimoErro: "x" }));
  const reaberta = createFila(backend);
  await reaberta.carregar();
  assert.deepEqual(reaberta.getSnapshot().map((item) => item.estado), ["pendente", "pendente", "precisa-acao", "falhou"]);
});

test("fila: remover apaga do aparelho e avisa quem assina", async () => {
  const backend = createMemoryBackend();
  const fila = createFila(backend);
  let avisos = 0;
  fila.subscribe(() => { avisos += 1; });
  await fila.adicionar(novoItem("1"));
  await fila.remover(chaveDoEnvio(detalhe("1")));
  assert.equal(fila.getSnapshot().length, 0);
  assert.equal((await backend.getAll()).length, 0);
  assert.ok(avisos >= 2);
});

const rede = (online: { valor: boolean }) => ({ estaOnline: () => online.valor });

test("processador: sem conexão não tenta; quando a rede volta envia e tira da fila", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  const online = { valor: false };
  const enviados: string[] = [];
  const processador = createProcessador({ fila, enviar: async (item) => { enviados.push(item.id); }, ...rede(online) });

  await processador.processar(true);
  assert.deepEqual(enviados, []);
  assert.equal(fila.getSnapshot()[0].estado, "pendente");

  online.valor = true;
  const resultado = await processador.processar(true);
  assert.equal(resultado.enviados.length, 1);
  assert.equal(fila.getSnapshot().length, 0);
});

test("processador: queda no meio do envio mantém o item, para a rodada e respeita a espera", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  await fila.adicionar(novoItem("2"));
  const online = { valor: true };
  let agora = 1_000_000;
  let falhar = true;
  const tentativas: string[] = [];
  const processador = createProcessador({
    fila,
    agora: () => agora,
    enviar: async (item) => {
      tentativas.push(item.titulo);
      if (falhar) throw new TypeError("Failed to fetch");
    },
    ...rede(online)
  });

  await processador.processar();
  assert.equal(tentativas.length, 1, "a rede caiu: o segundo item nem é tentado");
  const [primeiro, segundo] = fila.getSnapshot();
  assert.equal(primeiro.estado, "pendente");
  assert.equal(primeiro.tentativas, 1);
  assert.equal(primeiro.proximaTentativaEm, agora + esperaDaTentativa(1));
  assert.equal(segundo.tentativas, 0);

  await processador.processar();
  assert.equal(tentativas.length, 1, "ainda dentro da espera");

  falhar = false;
  agora += esperaDaTentativa(1) + 1;
  const resultado = await processador.processar();
  assert.equal(resultado.enviados.length, 2);
  assert.equal(fila.getSnapshot().length, 0);
});

test("processador: o evento de rede (forcar) ignora a espera", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1", { proximaTentativaEm: Date.now() + 10 * 60_000 }));
  const processador = createProcessador({ fila, enviar: async () => undefined });
  assert.equal((await processador.processar()).enviados.length, 0);
  assert.equal((await processador.processar(true)).enviados.length, 1);
});

test("processador: 504 sem confirmação mantém o item; no reenvio o Dataverse já concluído não grava de novo", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  // Simula o contrato de saveVoucherRemote: a primeira gravação chega ao Dataverse, a resposta se perde (504);
  // no reenvio o serviço já está Concluído e a função devolve sem gravar outra vez.
  let concluido = false;
  let gravacoes = 0;
  let tentativa = 0;
  const processador = createProcessador({
    fila,
    enviar: async () => {
      tentativa += 1;
      if (concluido) return;
      gravacoes += 1;
      concluido = true;
      if (tentativa === 1) throw comStatus(504, "Gateway Timeout");
    }
  });
  await processador.processar();
  assert.equal(fila.getSnapshot().length, 1);
  assert.equal(fila.getSnapshot()[0].estado, "pendente");
  await processador.processar(true);
  assert.equal(fila.getSnapshot().length, 0);
  assert.equal(gravacoes, 1);
  await processador.processar(true);
  assert.equal(tentativa, 2, "item já enviado não volta");
});

test("processador: sessão expirada vira 'precisa-acao' com a mensagem e para a rodada", async () => {
  const backend = createMemoryBackend();
  const fila = createFila(backend);
  await fila.adicionar(novoItem("1"));
  await fila.adicionar(novoItem("2"));
  let chamadas = 0;
  const processador = createProcessador({ fila, enviar: async () => { chamadas += 1; throw comStatus(401, "Unauthorized"); } });
  await processador.processar();
  assert.equal(chamadas, 1);
  const [primeiro] = fila.getSnapshot();
  assert.equal(primeiro.estado, "precisa-acao");
  assert.equal(primeiro.motivo, "sessao");
  assert.equal(primeiro.ultimoErro, MENSAGEM_SESSAO);
  assert.equal(MENSAGEM_SESSAO, "Entre de novo para enviar");

  // Depois de entrar de novo (app reaberto) o item volta a ser enviado.
  const reaberta = createFila(backend);
  await reaberta.carregar();
  assert.equal(reaberta.getSnapshot()[0].estado, "pendente");
});

test("processador: erro de negócio marca 'falhou' e segue para o próximo", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  await fila.adicionar(novoItem("2"));
  const enviados: string[] = [];
  const processador = createProcessador({
    fila,
    enviar: async (item) => {
      if (item.detailId === "1") throw comStatus(400, "Serviço cancelado");
      enviados.push(item.detailId);
    }
  });
  await processador.processar();
  assert.deepEqual(enviados, ["2"]);
  assert.equal(fila.getSnapshot().length, 1);
  assert.equal(fila.getSnapshot()[0].estado, "falhou");
  assert.equal(fila.getSnapshot()[0].ultimoErro, "Serviço cancelado");
  // "falhou" só reenvia por ação do motorista.
  assert.equal((await processador.processar(true)).enviados.length, 0);
});

test("processador: duas execuções ao mesmo tempo não enviam duas vezes", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  let chamadas = 0;
  let liberar: () => void = () => undefined;
  const segurar = new Promise<void>((resolve) => { liberar = resolve; });
  const processador = createProcessador({ fila, enviar: async () => { chamadas += 1; await segurar; } });
  const primeira = processador.processar(true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const segunda = await processador.processar(true);
  assert.equal(segunda.executou, false);
  liberar();
  await primeira;
  assert.equal(chamadas, 1);
});

test("processador: avisa o sucesso por item, em ordem de chegada", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("2"));
  await fila.adicionar(novoItem("1"));
  const avisados: string[] = [];
  const processador = createProcessador({ fila, enviar: async () => undefined, aoEnviar: (item) => { avisados.push(`${item.tipo}:${item.titulo}`); } });
  await processador.processar();
  assert.deepEqual(avisados, ["voucher:OS-1234", "voucher:OS-1234"]);
});

const resolucaoPerguntar: InfleetVehicleResolution = { decisao: "perguntar", motivo: "confianca-baixa", totalSegundos: 0, candidatos: [] };
const resolucaoAutomatica: InfleetVehicleResolution = { decisao: "automatico", motivo: "ok", totalSegundos: 0, candidatos: [] };

test("enviador: passa finalizadoEm (horário do aparelho) e usa o gravador certo por tipo", async () => {
  const payloads: Array<{ via: string; payload: FinalizePayload }> = [];
  const enviar = criarEnviador({
    salvarVoucher: async (payload) => { payloads.push({ via: "voucher", payload }); },
    finalizarServico: async (payload) => { payloads.push({ via: "servico", payload }); },
    resolverVeiculo: async () => resolucaoAutomatica,
    ehTerceiro: async () => false
  });
  await enviar(novoItem("1", { tipo: "voucher", finalizadoEm: "2026-11-16T08:15:00.000Z" }));
  await enviar(novoItem("2", { tipo: "servico", finalizadoEm: "2026-11-16T09:30:00.000Z" }));
  assert.deepEqual(payloads.map((entrada) => entrada.via), ["voucher", "servico"]);
  assert.equal(payloads[0].payload.finalizadoEm, "2026-11-16T08:15:00.000Z");
  assert.equal(payloads[1].payload.finalizadoEm, "2026-11-16T09:30:00.000Z");
  assert.equal(payloads[0].payload.signatureDataUrl, "data:image/png;base64,AAAA");
  assert.equal(payloads[0].payload.vehicleResolution, resolucaoAutomatica);
});

test("enviador: motorista terceiro não consulta a Infleet", async () => {
  let consultas = 0;
  let recebido: FinalizePayload | undefined;
  const enviar = criarEnviador({
    salvarVoucher: async (payload) => { recebido = payload; },
    finalizarServico: async () => undefined,
    resolverVeiculo: async () => { consultas += 1; return resolucaoAutomatica; },
    ehTerceiro: async () => true
  });
  await enviar(novoItem("1"));
  assert.equal(consultas, 0);
  assert.equal(recebido?.skipVehicle, true);
});

test("precisa escolher o carro: item para em 'precisa-acao' e segue depois da escolha", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(novoItem("1"));
  let gravado: FinalizePayload | undefined;
  const processador = createProcessador({
    fila,
    enviar: criarEnviador({
      salvarVoucher: async (payload) => { gravado = payload; },
      finalizarServico: async () => undefined,
      resolverVeiculo: async () => resolucaoPerguntar,
      ehTerceiro: async () => false
    })
  });
  await processador.processar();
  const parado = fila.getSnapshot()[0];
  assert.equal(parado.estado, "precisa-acao");
  assert.equal(parado.motivo, "carro");
  assert.equal(parado.vehicleResolution?.decisao, "perguntar");
  assert.equal(gravado, undefined);
  assert.equal((await processador.processar(true)).enviados.length, 0, "parado até o motorista escolher");

  const escolha = { veiculoId: "v1", placa: "ABC1D23", origem: "frota" as const };
  await fila.atualizar(parado.id, { vehicleChoice: escolha, estado: "pendente", motivo: undefined });
  await processador.processar(true);
  assert.equal(fila.getSnapshot().length, 0);
  assert.deepEqual(gravado?.vehicleChoice, escolha);
  assert.equal(gravado?.finalizadoEm, "2026-11-16T10:00:00.000Z");
});

test("armazenamento persistente: pede uma vez, ignora negativa e só registra erro lançado", async () => {
  const { pedirArmazenamentoPersistente, reiniciarPedidoDeArmazenamentoPersistente } = await import("../src/features/envio-pendente/armazenamentoPersistente.ts");
  reiniciarPedidoDeArmazenamentoPersistente();
  let chamadas = 0;
  const erros: unknown[] = [];
  const negado = { persist: async () => { chamadas += 1; return false; } };
  await pedirArmazenamentoPersistente(negado, (e) => erros.push(e));
  await pedirArmazenamentoPersistente(negado, (e) => erros.push(e));
  assert.equal(chamadas, 1);
  assert.equal(erros.length, 0);

  reiniciarPedidoDeArmazenamentoPersistente();
  await pedirArmazenamentoPersistente({ persist: async () => { throw new Error("falhou"); } }, (e) => erros.push(e));
  assert.equal(erros.length, 1);

  reiniciarPedidoDeArmazenamentoPersistente();
  await pedirArmazenamentoPersistente({}, (e) => erros.push(e));
  await pedirArmazenamentoPersistente(undefined, (e) => erros.push(e));
  assert.equal(erros.length, 1);
});

test("a fila guarda cópia própria da assinatura e das fotos: reabrir e enviar usa a cópia da fila, não o rascunho de mídia", async () => {
  const backend = createMemoryBackend();
  const fotos = { frente: "data:image/jpeg;base64,FFFF" } as FilaItem["photos"];
  const fila = createFila(backend);
  await fila.adicionar(novoItem("1", { photos: fotos }));

  const reaberta = createFila(backend);
  await reaberta.carregar();
  const [item] = reaberta.getSnapshot();
  assert.equal(item.signatureDataUrl, "data:image/png;base64,AAAA");
  assert.deepEqual(item.photos, fotos);

  const recebidos: FinalizePayload[] = [];
  const enviador = criarEnviador({
    salvarVoucher: async (payload) => { recebidos.push(payload); },
    finalizarServico: async (payload) => { recebidos.push(payload); },
    resolverVeiculo: async () => { throw new Error("não deveria resolver carro"); },
    ehTerceiro: () => true
  });
  await enviador(item);
  assert.equal(recebidos[0].signatureDataUrl, "data:image/png;base64,AAAA");
  assert.deepEqual(recebidos[0].photos, fotos);
});

test("finalizeServiceRemote não regrava serviço já concluído e grava finalizadoEm quando pendente", async () => {
  const { finalizeServiceRemote } = await import("../src/features/finalizar/remoto.ts");
  const { OPERATION_STATUS } = await import("../src/data/dataverse/registros.ts");
  const previousWindow = (globalThis as any).window;
  const gravacoes: Array<Record<string, unknown>> = [];
  let status: number = OPERATION_STATUS.concluido;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: {
      Utility: { getGlobalContext: () => ({ userSettings: { userId: "x" }, getClientUrl: () => "https://org.crm2.dynamics.com" }) },
      WebApi: {
        retrieveRecord: async () => ({ cr40f_status: status }),
        updateRecord: async (_entity: string, _id: string, data: Record<string, unknown>) => { gravacoes.push(data); return {}; }
      }
    }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const payload: FinalizePayload = { detail: detalhe("1"), fields: {}, skipVehicle: true, finalizadoEm: "2026-11-16T10:00:00.000Z" };
    await finalizeServiceRemote(payload);
    assert.equal(gravacoes.length, 0);

    status = 0;
    await finalizeServiceRemote(payload);
    assert.equal(gravacoes.length, 1);
    assert.equal(gravacoes[0].cr40f_status, OPERATION_STATUS.concluido);
    assert.equal(gravacoes[0].new_datadefinalizacao, "2026-11-16T10:00:00.000Z");
  } finally {
    (globalThis as any).window = previousWindow;
  }
});

async function comVoucherMockado(linkAtual: string, executar: (ctx: { gravacoes: Array<Record<string, unknown>>; chamadasFlow: () => number }) => Promise<void>) {
  const { OPERATION_STATUS } = await import("../src/data/dataverse/registros.ts");
  const { FLOW_URLS } = await import("../src/data/dataverse/flow.ts");
  const previousWindow = (globalThis as any).window;
  const previousFetch = globalThis.fetch;
  const gravacoes: Array<Record<string, unknown>> = [];
  let chamadas = 0;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    __APP_FLOW_ENV: { [FLOW_URLS.gerarVoucher]: "https://flow.exemplo.test/gerar" },
    Xrm: {
      Utility: { getGlobalContext: () => ({ userSettings: { userId: "x" }, getClientUrl: () => "https://org.crm2.dynamics.com" }) },
      WebApi: {
        retrieveRecord: async () => ({ cr40f_status: 0, new_linkdovoucher: linkAtual }),
        updateRecord: async (_entity: string, _id: string, data: Record<string, unknown>) => { gravacoes.push(data); return {}; }
      }
    }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  globalThis.fetch = (async () => { chamadas += 1; return new Response(JSON.stringify({ status: "success" }), { status: 200 }); }) as typeof fetch;
  try {
    await executar({ gravacoes, chamadasFlow: () => chamadas });
    assert.ok(OPERATION_STATUS.concluido !== undefined);
  } finally {
    (globalThis as any).window = previousWindow;
    globalThis.fetch = previousFetch;
  }
}

test("voucher: Flow rodou e a rede caiu; reenvio com link novo não chama o Flow e só conclui", async () => {
  const { saveVoucherRemote } = await import("../src/features/voucher/remoto.ts");
  const { OPERATION_STATUS } = await import("../src/data/dataverse/registros.ts");
  await comVoucherMockado("https://sharepoint/novo.pdf", async ({ gravacoes, chamadasFlow }) => {
    await saveVoucherRemote({ detail: detalhe("1"), fields: {}, skipVehicle: true, finalizadoEm: "2026-11-16T10:00:00.000Z", linkAnterior: "https://sharepoint/antigo.pdf" });
    assert.equal(chamadasFlow(), 0);
    assert.equal(gravacoes.length, 1);
    assert.equal(gravacoes[0].cr40f_status, OPERATION_STATUS.concluido);
    assert.equal(gravacoes[0].new_datadefinalizacao, "2026-11-16T10:00:00.000Z");
  });
});

test("voucher: link igual ao anterior chama o Flow; primeira tentativa entrega o link lido para a fila", async () => {
  const { saveVoucherRemote } = await import("../src/features/voucher/remoto.ts");
  await comVoucherMockado("https://sharepoint/antigo.pdf", async ({ gravacoes, chamadasFlow }) => {
    await saveVoucherRemote({ detail: detalhe("1"), fields: {}, skipVehicle: true, linkAnterior: "https://sharepoint/antigo.pdf" });
    assert.equal(chamadasFlow(), 1);
    assert.equal(gravacoes.length, 1);
    const lidos: string[] = [];
    await saveVoucherRemote({ detail: detalhe("1"), fields: {}, skipVehicle: true, onLinkAnterior: (link) => { lidos.push(link); } });
    assert.deepEqual(lidos, ["https://sharepoint/antigo.pdf"]);
    assert.equal(chamadasFlow(), 2);
  });
});
