import assert from "node:assert/strict";
import test from "node:test";
import { chaveDoChecklist, createFila, createMemoryBackend, type FilaItem } from "../src/features/envio-pendente/fila.ts";
import { criarEnviador } from "../src/features/envio-pendente/enviador.ts";
import { createProcessador } from "../src/features/envio-pendente/processador.ts";
import { enviarChecklistGuardado } from "../src/features/checklist/envioGuardado.ts";
import { createOneIdempotent, isRecordAlreadyExistsError } from "../src/data/dataverse/cliente.ts";
import { guidDeterministico } from "../src/lib/guidDeterministico.ts";
import { finalizeExchangeRemote, finalizeMaintenanceRemote, type FinalizePayload } from "../src/features/finalizar/remoto.ts";
import type { ChecklistGuardado } from "../src/features/envio-pendente/fila.ts";
import type { DetailData } from "../src/types.ts";

const HORA_REAL = "2026-11-16T08:15:00.000Z";
const comStatus = (status: number, message = "erro") => Object.assign(new Error(message), { status });

const detalhe = (type: "MANUTENCAO" | "TROCA", id: string, record: Record<string, unknown> = {}): DetailData => ({
  type, id, title: id, fields: [], actions: [],
  dataverse: { entitySetName: type === "TROCA" ? "cr40f_trocasdecarros" : "cr40f_manutencoes", id: `dv-${id}`, record }
});

const itemDe = (tipo: "manutencao" | "troca", id: string): FilaItem => {
  const detail = detalhe(tipo === "troca" ? "TROCA" : "MANUTENCAO", id);
  return {
    id: `${detail.type}:${id}`, detailId: id, detailType: detail.type, dataverseId: detail.dataverse!.id, titulo: id, tipo,
    detail, fields: { Valor: "10" }, finalizadoEm: HORA_REAL, criadoEm: "2026-11-16T08:16:00.000Z", tentativas: 0, estado: "pendente"
  };
};

const guardado = (): ChecklistGuardado => ({
  checklistId: "chk-1", placa: "ABC1D23", solicitadoEm: "2026-11-16T07:00:00.000Z",
  itens: [{ chave: "frente", ordem: 1, rotulo: "Frente", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] }],
  draft: {
    checklistId: "chk-1", valores: {}, updatedAt: HORA_REAL,
    fotos: { frente: [{ id: "f1", dataUrl: "data:image/jpeg;base64,AA" }, { id: "f2", dataUrl: "data:image/jpeg;base64,BB" }] as never }
  }
});

const enviadorCom = (extra: Partial<Parameters<typeof criarEnviador>[0]> = {}) => {
  const chamadas: Array<{ via: string; payload?: FinalizePayload }> = [];
  const enviar = criarEnviador({
    salvarVoucher: async () => undefined,
    finalizarServico: async () => undefined,
    finalizarManutencao: async (payload) => { chamadas.push({ via: "manutencao", payload }); },
    confirmarTroca: async (payload) => { chamadas.push({ via: "troca", payload }); },
    enviarFotoChecklist: async () => ({ link: "l", caminho: "c", nomeArquivo: "n" }),
    concluirChecklist: async () => undefined,
    resolverVeiculo: async () => { throw new Error("manutenção e troca não consultam a Infleet"); },
    ehTerceiro: async () => false,
    ...extra
  });
  return { enviar, chamadas };
};

test("manutenção e troca: enviam com o horário real da ação, em modo de reenvio e sem a Infleet", async () => {
  const { enviar, chamadas } = enviadorCom();
  await enviar(itemDe("manutencao", "m1"));
  await enviar(itemDe("troca", "t1"));
  assert.deepEqual(chamadas.map((c) => c.via), ["manutencao", "troca"]);
  for (const { payload } of chamadas) {
    assert.equal(payload?.finalizadoEm, HORA_REAL);
    assert.equal(payload?.reenvio, true);
  }
});

test("manutenção offline antes: item entra pendente, fica na fila sem rede e envia quando volta (queda no meio)", async () => {
  const fila = createFila(createMemoryBackend());
  await fila.adicionar(itemDe("manutencao", "m1"));
  let online = false;
  let tentativas = 0;
  const { enviar } = enviadorCom({ finalizarManutencao: async () => { tentativas += 1; if (tentativas === 1) throw new TypeError("Failed to fetch"); } });
  const avisados: string[] = [];
  const processador = createProcessador({ fila, enviar, estaOnline: () => online, aoEnviar: (i) => { avisados.push(`${i.tipo}:${i.titulo}`); } });
  await processador.processar();
  assert.equal(tentativas, 0, "sem rede não tenta");
  assert.equal(fila.getSnapshot().length, 1);
  online = true;
  await processador.processar(true);
  assert.equal(tentativas, 1);
  assert.equal(fila.getSnapshot()[0].estado, "pendente", "queda no meio mantém o item para o próximo ciclo");
  await processador.processar(true);
  assert.equal(tentativas, 2);
  assert.equal(fila.getSnapshot().length, 0);
  assert.deepEqual(avisados, ["manutencao:m1"]);
});

test("checklist: item sem detalhe de serviço é enviado pelo caminho do checklist com chave própria", async () => {
  assert.equal(chaveDoChecklist("{ABC-1}"), "CHECKLIST:abc-1");
  const concluidos: string[] = [];
  const { enviar } = enviadorCom({ concluirChecklist: async (id) => { concluidos.push(id); } });
  const item: FilaItem = {
    id: chaveDoChecklist("chk-1"), detailId: "chk-1", detailType: "CHECKLIST", dataverseId: "chk-1", titulo: "ABC1D23", tipo: "checklist",
    fields: {}, finalizadoEm: HORA_REAL, criadoEm: HORA_REAL, tentativas: 0, estado: "pendente", checklist: guardado()
  };
  await enviar(item);
  assert.deepEqual(concluidos, ["chk-1"]);
});

test("checklist: queda no meio continua das fotos já enviadas e o reenvio não sobe a mesma foto de novo", async () => {
  const subidas: string[] = [];
  const gravadas: Array<Record<string, unknown>> = [];
  const g = guardado();
  let falharNaSegunda = true;
  const deps = {
    enviarFoto: async ({ dataUrl }: { dataUrl: string }) => {
      if (dataUrl.endsWith("BB") && falharNaSegunda) throw new TypeError("Failed to fetch");
      subidas.push(dataUrl);
      return { link: `link-${dataUrl.slice(-2)}`, caminho: "c", nomeArquivo: "n" };
    },
    concluir: async () => undefined,
    gravarEnviadas: async (enviadas: Record<string, unknown>) => { gravadas.push(enviadas); }
  };
  await assert.rejects(enviarChecklistGuardado(g, deps as never), /Failed to fetch/);
  assert.deepEqual(subidas, ["data:image/jpeg;base64,AA"]);
  assert.deepEqual(Object.keys(gravadas.at(-1) ?? {}), ["f1"]);
  // Reenvio: o item da fila já tem o link da primeira foto.
  falharNaSegunda = false;
  const retomado: ChecklistGuardado = { ...g, draft: { ...g.draft, enviadas: gravadas.at(-1) as never } };
  let respostas = "";
  await enviarChecklistGuardado(retomado, { ...deps, concluir: async (_id: string, json: string) => { respostas = json; } } as never);
  assert.deepEqual(subidas, ["data:image/jpeg;base64,AA", "data:image/jpeg;base64,BB"], "só a segunda foto sobe no reenvio");
  assert.match(respostas, /link-AA/);
  assert.match(respostas, /link-BB/);
});

test("guidDeterministico: mesma semente gera o mesmo GUID e sementes diferentes geram GUIDs diferentes", async () => {
  const a = await guidDeterministico("foto-manutencao:1:antes:nota.jpg");
  assert.equal(a, await guidDeterministico("foto-manutencao:1:antes:nota.jpg"));
  assert.notEqual(a, await guidDeterministico("foto-manutencao:1:depois:nota.jpg"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("isRecordAlreadyExistsError: reconhece 412, 0x80040237 e a mensagem de chave duplicada, e só isso", () => {
  assert.equal(isRecordAlreadyExistsError(comStatus(412)), true);
  assert.equal(isRecordAlreadyExistsError(Object.assign(new Error("x"), { errorCode: 412 })), true);
  assert.equal(isRecordAlreadyExistsError(new Error("A record with matching key values already exists.")), true);
  assert.equal(isRecordAlreadyExistsError(Object.assign(new Error("x"), { code: "0x80040237" })), true);
  assert.equal(isRecordAlreadyExistsError(comStatus(500, "Erro no plugin")), false);
  assert.equal(isRecordAlreadyExistsError(new TypeError("Failed to fetch")), false);
});

const comXrm = async (webApi: Record<string, unknown>, corpo: () => Promise<void>) => {
  const anterior = (globalThis as any).window;
  const janela: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: {
      Utility: { getGlobalContext: () => ({ userSettings: { userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }, getClientUrl: () => "https://org.crm2.dynamics.com" }) },
      WebApi: webApi
    }
  };
  janela.parent = janela;
  (globalThis as any).window = janela;
  try { await corpo(); } finally { (globalThis as any).window = anterior; }
};

test("createOneIdempotent: manda a PK no corpo e trata duplicata (412) como sucesso no reenvio", async () => {
  const corpos: Array<Record<string, unknown>> = [];
  let segunda = false;
  await comXrm({
    createRecord: async (_entidade: string, corpo: Record<string, unknown>) => {
      corpos.push(corpo);
      if (segunda) throw comStatus(412, "Precondition Failed");
      return { id: "11111111-1111-1111-1111-111111111111" };
    }
  }, async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const primeiro = await createOneIdempotent("cr40f_reservadeveculos", id, { cr40f_nome: "x" });
    segunda = true;
    const reenvio = await createOneIdempotent("cr40f_reservadeveculos", id, { cr40f_nome: "x" });
    assert.equal(primeiro.id, id);
    assert.equal(reenvio.id, id);
    await assert.rejects(
      (async () => { (globalThis as any).window.Xrm.WebApi.createRecord = async () => { throw comStatus(500, "Erro no plugin"); }; return createOneIdempotent("cr40f_reservadeveculos", id, {}); })(),
      /Erro no plugin/
    );
  });
  assert.equal(corpos.length, 2);
  assert.ok(Object.values(corpos[0]).includes("22222222-2222-2222-2222-222222222222"), "PK vai no corpo");
  assert.deepEqual(corpos[0], corpos[1], "reenvio manda o mesmo corpo e o mesmo id");
});

test("manutenção reenviada com status Realizado só completa o item da agenda e não regrava nada", async () => {
  const atualizacoes: Array<{ entidade: string; dados: Record<string, unknown> }> = [];
  let criacoes = 0;
  await comXrm({
    retrieveRecord: async () => ({ cr40f_status: 202410002 }),
    updateRecord: async (entidade: string, _id: string, dados: Record<string, unknown>) => { atualizacoes.push({ entidade, dados }); return {}; },
    createRecord: async () => { criacoes += 1; return { id: "x" }; }
  }, async () => {
    const detail = detalhe("MANUTENCAO", "m1", { __geralId: "33333333-3333-3333-3333-333333333333" });
    await finalizeMaintenanceRemote({ detail, fields: { Valor: "10" }, finalizadoEm: HORA_REAL, reenvio: true });
  });
  assert.equal(criacoes, 0);
  assert.equal(atualizacoes.length, 1);
  assert.equal(atualizacoes[0].dados.new_datadefinalizacao, HORA_REAL, "usa o horário real, não o do reenvio");
});

test("troca reenviada com a confirmação já registrada retorna sucesso sem chamar a Custom API de novo", async () => {
  const motorista = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  let comandos = 0;
  await comXrm({
    retrieveRecord: async (entidade: string) => entidade === "systemuser"
      ? { internalemailaddress: "pessoa.ficticia7@betinhos.com.br", fullname: "Driver" }
      : { cr40f_trocasdecarroid: "c", _cr40f_motorista1_value: motorista, cr40f_statusdatroca: 202410000, new_concluidomotorista1: true, "@odata.etag": 'W/"43"' },
    retrieveMultipleRecords: async () => ({ entities: [{ cr40f_funcionariosid: motorista, cr40f_nomecompleto: "Driver", cr40f_emailmicrosoft: "pessoa.ficticia7@betinhos.com.br" }] }),
    online: { execute: async () => { comandos += 1; return {}; } }
  }, async () => {
    await finalizeExchangeRemote({ detail: detalhe("TROCA", "t1"), fields: {}, finalizadoEm: HORA_REAL, reenvio: true });
  });
  assert.equal(comandos, 0);
});
