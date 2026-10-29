import assert from "node:assert/strict";
import { test } from "vitest";
import { CHECKLIST_ESTADO, CHECKLIST_ORIGEM } from "../domain/checklists";
import {
  cancelarChecklist,
  erroAcaoOperacao,
  erroMotivoCancelamento,
  itemPayloadForTest,
  limiarVencimento,
  canRemind,
  checklistBuscaTexto,
  CHK_FILTERS,
  loadChecklistsGestao,
  loadChecklistsPadroes,
  loadFrota,
  loadModelos,
  mapChecklistGestao,
  matchChk,
  moveItem,
  novoItem,
  novoModelo,
  origemLabel,
  periodicidadePorVeiculo,
  periodicidadeVigente,
  podeReatribuir,
  PUSH,
  reatribuirChecklist,
  resetMock,
  saveModelo,
  situacaoVeiculo,
  solicitarChecklist,
  validateModelo,
  veiculosComMotorista,
  type ChecklistGestao,
  type Modelo,
  type VeiculoFrota
} from "../domain/gestaoChecklists";
import type { VeiculoFiltro } from "../domain/filtroVeiculo";
import { calcularPadroes } from "../domain/padroesChecklists";
import { usarXrmFalso } from "./xrmFalso";

usarXrmFalso();

const NOW = Date.parse("2026-10-19T12:00:00Z");
const DAY = 86_400_000;
const veiculo: VeiculoFrota = { id: "V1", placa: "ABC1D23", modelo: "Corolla", hodometro: 45000, motoristaId: "f1", motoristaNome: "Carlos", motoristaDesde: null };
const frota = (id: string): VeiculoFrota => ({ ...veiculo, id });

function checklist(overrides: Partial<ChecklistGestao>): ChecklistGestao {
  return {
    id: "c", nome: "", motoristaId: "f1", veiculoId: "v1", placa: "ABC1D23", estado: CHECKLIST_ESTADO.concluido, origem: 100000000,
    solicitadoEm: new Date(NOW - 5 * DAY).toISOString(), concluidoEm: new Date(NOW - 5 * DAY).toISOString(), odometro: null, itens: [], respostas: [],
    motoristaNome: "Carlos", modeloNome: "", erroAtribuicao: "", pushStatus: null, pushErro: "", atribuidoEm: null, canceladoEm: null, motivoCancelamento: "",
    temProblema: false, qtdProblemas: 0, entreguePorId: "", entreguePorNome: "", trocaDetectadaEm: null,
    ...overrides
  };
}

function withWindow<T>(hostname: string, run: () => Promise<T>) {
  const previous = (globalThis as any).window;
  (globalThis as any).window = { location: { hostname } };
  return run().finally(() => { (globalThis as any).window = previous; });
}

test("situação do veículo segue a periodicidade e prioriza checklist aberto", () => {
  assert.equal(situacaoVeiculo(veiculo, [], 15, NOW).label, "Sem checklist");
  assert.equal(situacaoVeiculo(veiculo, [checklist({})], 15, NOW).label, "Em dia");
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 13 * DAY).toISOString() })], 15, NOW).label, "Vence em 2 dias");
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 16 * DAY).toISOString() })], 15, NOW).label, "Vencido");
  const pendente = situacaoVeiculo(veiculo, [checklist({}), checklist({ id: "p", estado: CHECKLIST_ESTADO.pendente, concluidoEm: null })], 15, NOW);
  assert.equal(pendente.label, "Pendente");
  assert.equal(pendente.aberto?.id, "p");
  const semMotorista = situacaoVeiculo(veiculo, [checklist({ id: "a", estado: CHECKLIST_ESTADO.aguardandoMotorista, concluidoEm: null, erroAtribuicao: "Nenhum motorista" })], 15, NOW);
  assert.equal(semMotorista.label, "Sem motorista");
  assert.equal(semMotorista.tone, "danger");
  assert.equal(situacaoVeiculo(veiculo, [checklist({ estado: CHECKLIST_ESTADO.cancelado, concluidoEm: null })], 15, NOW).label, "Sem checklist");
});

test("último checklist com problema mostra 'venceu em' só quando passou do prazo", () => {
  const vencido = situacaoVeiculo(veiculo, [checklist({ temProblema: true, qtdProblemas: 2, concluidoEm: new Date(NOW - 16 * DAY).toISOString() })], 15, NOW);
  assert.equal(vencido.label, "2 itens Não OK");
  assert.equal(vencido.tone, "danger");
  assert.equal(vencido.ordem, 1);
  assert.equal(vencido.detail, "Checklist de 03/10 · venceu em 18/10");
  const noPrazo = situacaoVeiculo(veiculo, [checklist({ temProblema: true, qtdProblemas: 2, concluidoEm: new Date(NOW - 5 * DAY).toISOString() })], 15, NOW);
  assert.equal(noPrazo.detail, "Checklist de 14/10");
  const aberto = situacaoVeiculo(veiculo, [
    checklist({ temProblema: true, qtdProblemas: 2, concluidoEm: new Date(NOW - 16 * DAY).toISOString() }),
    checklist({ id: "p", estado: CHECKLIST_ESTADO.pendente, concluidoEm: null, atribuidoEm: new Date(NOW - DAY).toISOString() })
  ], 15, NOW);
  assert.equal(aberto.label, "2 itens Não OK");
  assert.equal(aberto.detail, "Com Carlos desde 18/10");
  const problema = (dias: number) => situacaoVeiculo(veiculo, [checklist({ temProblema: true, qtdProblemas: 1, concluidoEm: new Date(NOW - dias * DAY).toISOString() })], 15, NOW);
  assert.equal(problema(15).detail, "Checklist de 04/10 · venceu em 19/10");
  assert.equal(problema(14).detail, "Checklist de 05/10");
});

test("periodicidade vem do modelo padrão ativo", () => {
  const modelo = { ...novoModelo(), padraoQuinzenal: true, periodicidadeDias: 10 };
  assert.equal(periodicidadeVigente([modelo]), 10);
  assert.equal(periodicidadeVigente([{ ...modelo, ativo: false }]), 15);
  assert.equal(periodicidadeVigente([]), 15);
});

test("validação do modelo aponta o que falta", () => {
  const modelo = novoModelo();
  assert.equal(modelo.itens.length, 0, "modelo novo começa sem itens");
  assert.match(validateModelo(modelo), /nome do modelo/);
  modelo.nome = "Vistoria";
  assert.match(validateModelo(modelo), /pelo menos um item/);
  modelo.itens.push(novoItem(1));
  assert.equal(validateModelo(modelo), "Item 1: dê um nome ao item.");
  modelo.itens[0].rotulo = "Frente";
  assert.equal(validateModelo(modelo), "");
  assert.match(validateModelo({ ...modelo, periodicidadeDias: 0 }), /entre 1 e 365/);
  assert.match(validateModelo({ ...modelo, itens: [] }), /pelo menos um item/);
});

test("reordenar itens renumera a ordem e ignora bordas", () => {
  const itens = [{ ...novoItem(1), rotulo: "A" }, { ...novoItem(2), rotulo: "B" }, { ...novoItem(3), rotulo: "C" }];
  const moved = moveItem(itens, 2, -1);
  assert.deepEqual(moved.map((item) => `${item.ordem}${item.rotulo}`), ["1A", "2C", "3B"]);
  assert.equal(moveItem(itens, 0, -1), itens);
});

test("lembrar só checklist pendente com push já processado", () => {
  assert.equal(canRemind(checklist({ estado: CHECKLIST_ESTADO.pendente, pushStatus: PUSH.enviado })), true);
  assert.equal(canRemind(checklist({ estado: CHECKLIST_ESTADO.pendente, pushStatus: PUSH.pendente })), false);
  assert.equal(canRemind(checklist({ estado: CHECKLIST_ESTADO.concluido, pushStatus: PUSH.falhou })), false);
});

test("mapeia nomes formatados do motorista e do modelo", () => {
  const row = mapChecklistGestao({
    new_checklistveiculoid: "c1",
    "_new_motorista_value@OData.Community.Display.V1.FormattedValue": "Carlos",
    "_new_modelo_value@OData.Community.Display.V1.FormattedValue": "Vistoria quinzenal",
    new_estado: 100000001, new_pushstatus: 100000002, new_pusherro: "sem dispositivo", new_erroatribuicao: null, new_itensjson: "[]"
  });
  assert.equal(row.motoristaNome, "Carlos");
  assert.equal(row.modeloNome, "Vistoria quinzenal");
  assert.equal(row.pushStatus, PUSH.falhou);
  assert.equal(row.erroAtribuicao, "");
});

test("Dataverse: frota só com carro próprio ativo e motorista mais recente", async () => {
  const queries: string[] = [];
  const previous = (globalThis as any).window;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (entity: string, query: string) => {
      queries.push(`${entity} ${query}`);
      if (entity === "cr40f_veiculos") return { entities: [{ cr40f_veiculosid: "v1", cr40f_placa: "ABC1D23", cr40f_modelo: "Corolla", cr40f_cor: "Preto", cr40f_hodometro: 45210 }] };
      return { entities: [
        { cr40f_funcionariosid: "f-antigo", cr40f_nomecompleto: "Antigo", _cr40f_veiculoatual_value: "V1", new_veiculoatualdesde: "2026-10-01T00:00:00Z" },
        { cr40f_funcionariosid: "f-novo", cr40f_nomecompleto: "Novo", _cr40f_veiculoatual_value: "v1", new_veiculoatualdesde: "2026-10-18T00:00:00Z" }
      ] };
    } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const [carro] = await loadFrota();
    assert.equal(carro.motoristaNome, "Novo");
    assert.equal(carro.modelo, "Corolla Preto");
    assert.match(queries.find((item) => item.startsWith("cr40f_veiculos")) ?? "", /cr40f_statusdoveiculo eq 202410001 and new_categoriadoveiculo eq 100000000/);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("mock: solicitar, reatribuir, cancelar e salvar modelo padrão único", async () => {
  resetMock();
  await withWindow("localhost", async () => {
    const frota = await loadFrota();
    const semMotorista = frota.find((item) => !item.motoristaId)!;
    const comMotorista = frota.find((item) => item.placa === "QTP4F55")!;
    await solicitarChecklist(comMotorista.id);
    let lista = await loadChecklistsGestao();
    const novo = lista.find((item) => item.veiculoId === comMotorista.id && item.estado === CHECKLIST_ESTADO.pendente);
    assert.ok(novo, "checklist manual deve ir direto para o motorista do carro");
    const aguardando = lista.find((item) => item.veiculoId === semMotorista.id && item.estado === CHECKLIST_ESTADO.aguardandoMotorista)!;
    await reatribuirChecklist(aguardando.id);
    lista = await loadChecklistsGestao();
    assert.match(lista.find((item) => item.id === aguardando.id)!.erroAtribuicao, /Nenhum motorista/);
    await cancelarChecklist(novo!.id, "Carro na oficina");
    lista = await loadChecklistsGestao();
    assert.equal(lista.find((item) => item.id === novo!.id)!.estado, CHECKLIST_ESTADO.cancelado);
    await assert.rejects(cancelarChecklist(novo!.id, "Carro na oficina"), /Somente checklist pendente/);

    const modelos = await loadModelos();
    const outro = { ...modelos.find((item) => !item.padraoQuinzenal)!, ativo: true, padraoQuinzenal: true };
    await saveModelo(outro, modelos.find((item) => item.id === outro.id)!);
    const depois = await loadModelos();
    assert.deepEqual(depois.filter((item) => item.padraoQuinzenal).map((item) => item.id), [outro.id]);
  });
  resetMock();
});

test("concluído com problema deixa o veículo em atenção até um checklist sem problema", () => {
  const veiculo = frota("v1");
  const comProblema = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, concluidoEm: "2026-10-18T12:00:00Z", temProblema: true, qtdProblemas: 2 });
  const s = situacaoVeiculo(veiculo, [comProblema], 15, Date.parse("2026-10-20T12:00:00Z"));
  assert.equal(s.label, "2 itens Não OK");
  assert.equal(s.tone, "danger");
  assert.equal(s.tone, "danger", "entra no KPI Precisam de atenção");
  const limpo = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, concluidoEm: "2026-10-19T12:00:00Z", temProblema: false, qtdProblemas: 0 });
  assert.equal(situacaoVeiculo(veiculo, [comProblema, limpo], 15, Date.parse("2026-10-20T12:00:00Z")).label, "Em dia");
});

test("checklist aberto não esconde o problema do último concluído", () => {
  const veiculo = frota("v1");
  const now = Date.parse("2026-10-20T12:00:00Z");
  const comProblema = checklist({ id: "c1", veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, concluidoEm: "2026-10-18T12:00:00Z", temProblema: true, qtdProblemas: 3 });
  const pendente = checklist({ id: "c2", veiculoId: "v1", estado: CHECKLIST_ESTADO.pendente, motoristaNome: "Ana", solicitadoEm: "2026-10-19T12:00:00Z", atribuidoEm: "2026-10-19T12:00:00Z" });
  const p = situacaoVeiculo(veiculo, [comProblema, pendente], 15, now);
  assert.equal(p.tone, "danger");
  assert.equal(p.ordem, 1);
  assert.equal(p.label, "3 itens Não OK");
  assert.match(p.detail, /^Com Ana desde /);
  assert.equal(p.aberto?.id, "c2");
  assert.equal(p.ultimo?.id, "c1");
  const atribuindo = checklist({ id: "c3", veiculoId: "v1", estado: CHECKLIST_ESTADO.aguardandoMotorista, solicitadoEm: "2026-10-19T12:00:00Z" });
  const a = situacaoVeiculo(veiculo, [comProblema, atribuindo], 15, now);
  assert.equal(a.tone, "danger");
  assert.equal(a.ordem, 1);
  assert.equal(a.label, "3 itens Não OK");
  assert.equal(a.detail, "Procurando quem está com o carro na Infleet");
  assert.equal(a.aberto?.id, "c3");
  const semMotorista = checklist({ id: "c4", veiculoId: "v1", estado: CHECKLIST_ESTADO.aguardandoMotorista, solicitadoEm: "2026-10-19T12:00:00Z", erroAtribuicao: "Sem vínculo" });
  const e = situacaoVeiculo(veiculo, [comProblema, semMotorista], 15, now);
  assert.equal(e.label, "Sem motorista");
  assert.equal(e.ordem, 0);
});

test("payload do item okNok grava opções normalizadas", () => {
  const payload = itemPayloadForTest({ id: "", ordem: 1, rotulo: "Pneus", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "x", opcoesProblema: " Murcho \n\nCareca" }, 1);
  assert.equal(payload.new_tipo, 100000003);
  assert.equal(payload.new_opcoesproblema, "Murcho\nCareca");
  assert.equal(payload.new_unidade, "");
  const foto = itemPayloadForTest({ ...novoItem(1), rotulo: "Frente", opcoesProblema: "Murcho" }, 1);
  assert.equal(foto.new_opcoesproblema, "");
});

test("validação recusa item OK / Não OK com mais de 12 opções ou opção longa", () => {
  const base = { ...novoModelo(), nome: "Vistoria" };
  const item = { ...novoItem(1, "okNok"), rotulo: "Pneus" };
  const opcoes = (n: number) => Array.from({ length: n }, (_, i) => `Problema ${i + 1}`).join("\n");
  assert.equal(validateModelo({ ...base, itens: [{ ...item, opcoesProblema: opcoes(12) }] }), "");
  assert.equal(validateModelo({ ...base, itens: [{ ...item, opcoesProblema: opcoes(13) }] }), "Item 1 (Pneus): use no máximo 12 problemas; remova 1.");
  assert.equal(validateModelo({ ...base, itens: [{ ...item, opcoesProblema: "x".repeat(41) }] }), `Item 1 (Pneus): “${"x".repeat(24)}…” tem 41 caracteres; use até 40.`);
  assert.equal(validateModelo({ ...base, itens: [{ ...item, opcoesProblema: ` ${"x".repeat(40)} \n\n` }] }), "");
});

test("mapeia problemas do checklist e lê opções do item do modelo", () => {
  const row = mapChecklistGestao({ new_checklistveiculoid: "c1", new_estado: 100000002, new_temproblema: true, new_qtdproblemas: 3, new_itensjson: "[]" });
  assert.equal(row.temProblema, true);
  assert.equal(row.qtdProblemas, 3);
  const vazio = mapChecklistGestao({ new_checklistveiculoid: "c2", new_itensjson: "[]" });
  assert.equal(vazio.temProblema, false);
  assert.equal(vazio.qtdProblemas, 0);
});

test("Dataverse: modelos e checklists pedem as colunas do OK / Não OK", async () => {
  const queries: string[] = [];
  const previous = (globalThis as any).window;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (entity: string, query: string) => {
      queries.push(`${entity} ${query}`);
      if (entity === "new_checklistmodelo") return { entities: [{ new_checklistmodeloid: "m1", new_name: "Vistoria" }] };
      if (entity === "new_checklistmodeloitem") return { entities: [{ new_checklistmodeloitemid: "i1", _new_modelo_value: "m1", new_name: "Pneus", new_ordem: 1, new_tipo: 100000003, new_opcoesproblema: "Murcho\nCareca" }] };
      return { entities: [] };
    } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const [modelo] = await loadModelos();
    assert.equal(modelo.itens[0].tipo, "okNok");
    assert.equal(modelo.itens[0].opcoesProblema, "Murcho\nCareca");
    await loadChecklistsGestao();
    assert.match(queries.find((item) => item.includes("new_checklistmodeloitemid")) ?? "", /new_opcoesproblema/);
    assert.match(queries.find((item) => item.includes("new_checklistveiculoid")) ?? "", /new_temproblema,new_qtdproblemas/);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("Dataverse: falha do Xrm passa pelo log de erros e chega intacta à tela", async () => {
  const previous = (globalThis as any).window;
  const failure = { errorCode: -2147220969, message: "Registro não encontrado." };
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async () => { throw failure; } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    await assert.rejects(loadFrota(), (error) => error === failure);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("origem Troca: rótulo e busca por origem e por quem entregou", () => {
  const item = checklist({ origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "Carlos Andrade", trocaDetectadaEm: "2026-10-20T15:00:00Z" });
  assert.equal(origemLabel(item), "Troca");
  assert.match(checklistBuscaTexto(item).toLowerCase(), /troca/);
  assert.match(checklistBuscaTexto(item).toLowerCase(), /carlos andrade/);
  assert.equal(origemLabel(checklist({ origem: CHECKLIST_ORIGEM.manual })), "Solicitado");
  assert.equal(origemLabel(checklist({ origem: CHECKLIST_ORIGEM.quinzenal })), "Quinzenal");
});

test("filtro Trocas mostra checklists de troca em qualquer estado", () => {
  const trocaAberta = checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.pendente });
  const trocaCancelada = checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.cancelado });
  const quinzenal = checklist({ origem: CHECKLIST_ORIGEM.quinzenal, estado: CHECKLIST_ESTADO.pendente });
  assert.deepEqual(CHK_FILTERS.filter((item) => item.grupo === "estado").map((item) => item.label), ["Abertos", "Enviados", "Cancelados", "Todos"]);
  assert.deepEqual(CHK_FILTERS.filter((item) => item.grupo === "origem").map((item) => item.label), ["Trocas"]);
  assert.equal(matchChk("trocas", trocaAberta), true);
  assert.equal(matchChk("trocas", trocaCancelada), true);
  assert.equal(matchChk("trocas", quinzenal), false);
  assert.equal(matchChk("abertos", trocaAberta), true);
  assert.equal(matchChk("todos", quinzenal), true);
});

test("checklist de troca concluído reinicia o prazo do veículo", () => {
  const troca = checklist({ veiculoId: "v1", estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.troca, concluidoEm: "2026-10-19T12:00:00Z", temProblema: false, qtdProblemas: 0 });
  assert.equal(situacaoVeiculo(frota("v1"), [troca], 15, Date.parse("2026-10-20T12:00:00Z")).label, "Em dia");
});

test("Dataverse: checklists pedem entregue por e horário da troca", async () => {
  const queries: string[] = [];
  const previous = (globalThis as any).window;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (entity: string, query: string) => {
      queries.push(`${entity} ${query}`);
      if (entity === "new_checklistveiculo") return { entities: [{ new_checklistveiculoid: "c1", new_estado: 100000001, new_origem: 100000002, "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Carlos Andrade", new_trocadetectadaem: "2026-10-20T15:00:00Z" }] };
      return { entities: [] };
    } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const [row] = await loadChecklistsGestao();
    assert.equal(row.entreguePorNome, "Carlos Andrade");
    assert.equal(row.trocaDetectadaEm, "2026-10-20T15:00:00Z");
    assert.equal(origemLabel(row), "Troca");
    const url = queries.find((item) => item.includes("new_checklistveiculoid")) ?? "";
    assert.match(url, /_new_entreguepor_value/);
    assert.match(url, /new_trocadetectadaem/);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("podeReatribuir espelha o KeepsReceiver do plugin", () => {
  const aviso = "Checklist de troca: fica com quem recebeu o carro.";
  // Troca já atribuída fica com quem recebeu: sem botão, com aviso.
  assert.deepEqual(podeReatribuir(checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.pendente, erroAtribuicao: "Falhou" })), { pode: false, aviso });
  assert.deepEqual(podeReatribuir(checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.aguardandoMotorista })), { pode: false, aviso });
  // Troca nunca atribuída segue a regra normal.
  assert.deepEqual(podeReatribuir(checklist({ origem: CHECKLIST_ORIGEM.troca, motoristaId: "", estado: CHECKLIST_ESTADO.aguardandoMotorista, erroAtribuicao: "Sem usuário" })), { pode: true, aviso: "" });
  // Troca já atribuída sem motivo para reatribuir: nem botão nem aviso.
  assert.deepEqual(podeReatribuir(checklist({ origem: CHECKLIST_ORIGEM.troca, estado: CHECKLIST_ESTADO.pendente })), { pode: false, aviso: "" });
  // Outras origens: aguardando ou com erro de atribuição reatribuem, mesmo com motorista.
  for (const origem of [CHECKLIST_ORIGEM.quinzenal, CHECKLIST_ORIGEM.manual]) {
    assert.deepEqual(podeReatribuir(checklist({ origem, estado: CHECKLIST_ESTADO.aguardandoMotorista, motoristaId: "" })), { pode: true, aviso: "" });
    assert.deepEqual(podeReatribuir(checklist({ origem, estado: CHECKLIST_ESTADO.pendente, erroAtribuicao: "Dois motoristas" })), { pode: true, aviso: "" });
    assert.deepEqual(podeReatribuir(checklist({ origem, estado: CHECKLIST_ESTADO.pendente })), { pode: false, aviso: "" });
  }
});

test("mapeia o id de quem entregou, vazio quando não identificado", () => {
  const row = mapChecklistGestao({ new_checklistveiculoid: "c1", _new_entreguepor_value: "F2", "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Marcos Lima", new_itensjson: "[]" });
  assert.equal(row.entreguePorId, "F2");
  assert.equal(row.entreguePorNome, "Marcos Lima");
  assert.equal(mapChecklistGestao({ new_checklistveiculoid: "c2", new_itensjson: "[]" }).entreguePorId, "");
});

test("Dataverse: padrões leem 180 dias de checklists enviados, paginando, só com as colunas usadas", async () => {
  const queries: string[] = [];
  const previous = (globalThis as any).window;
  const windowMock: any = {
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (entity: string, query: string) => {
      queries.push(`${entity} ${query}`);
      if (queries.length === 1) {
        return {
          entities: [{ new_checklistveiculoid: "c1", new_estado: 100000002, new_origem: 100000002, _new_entreguepor_value: "F2", "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Marcos Lima", new_concluidoem: "2026-10-20T15:00:00Z", new_respostasjson: "[]" }],
          nextLink: "https://org.crm2.dynamics.com/api/data/v9.2/new_checklistveiculos?$select=new_checklistveiculoid&$skiptoken=pagina2"
        };
      }
      return { entities: [{ new_checklistveiculoid: "c2", new_estado: 100000002, new_concluidoem: "2026-05-01T15:00:00Z", new_respostasjson: "[]" }] };
    } } }
  };
  windowMock.parent = windowMock;
  (globalThis as any).window = windowMock;
  try {
    const rows = await loadChecklistsPadroes(Date.parse("2026-10-21T12:00:00Z"));
    assert.deepEqual(rows.map((row) => row.id), ["c1", "c2"]);
    assert.equal(rows[0].entreguePorId, "F2");
    const [primeira, segunda] = queries;
    assert.match(primeira, /^new_checklistveiculo \?\$select=/);
    assert.match(primeira, /\$filter=new_estado eq 100000002 and new_concluidoem ge 2026-04-24T12:00:00\.000Z/);
    for (const coluna of ["_new_veiculo_value", "new_origem", "new_concluidoem", "new_respostasjson", "_new_entreguepor_value", "new_temproblema"]) assert.match(primeira, new RegExp(coluna));
    assert.doesNotMatch(primeira, /new_itensjson|\$top/);
    assert.match(segunda, /\$skiptoken=pagina2/);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("mock: histórico de 180 dias mostra destaque, recorrência e Não identificado sem mudar a aba Veículos", async () => {
  resetMock();
  await withWindow("localhost", async () => {
    const enviados = await loadChecklistsPadroes();
    assert.ok(enviados.every((item) => item.estado === CHECKLIST_ESTADO.concluido));
    const p90 = calcularPadroes(enviados, 90);
    assert.equal(p90.total, 15);
    assert.equal(p90.trocas, 10);
    assert.deepEqual(p90.destaques.map((item) => item.texto), ["Marcos Lima: 3 de 3 carros entregues com 'Lataria: Sujo' (90 dias)"]);
    assert.deepEqual(p90.porEntregador.map((item) => `${item.nome} ${item.trocas} ${item.comProblema} ${item.percentual}%`), ["Marcos Lima 3 3 100%", "Paulo Mendes 3 1 33%"]);
    assert.deepEqual([p90.naoIdentificado?.trocas, p90.naoIdentificado?.comProblema], [2, 1]);
    assert.deepEqual(p90.porVeiculo.map((item) => `${item.placa} ${item.item} — ${item.problemas.join(", ")} (${item.ocorrencias} de ${item.janela})`), [
      "BRA2E19 Pneus — Murcho, Careca (2 de 3)",
      "PRN5K72 Lataria — Amassado, Sujo (2 de 3)",
      "QTP4F55 Pneus — Careca, Murcho (2 de 3)"
    ]);
    assert.deepEqual(p90.problemasFrota.slice(0, 2).map((par) => `${par.item}: ${par.problema} ${par.quantidade}`), ["Lataria: Sujo 3", "Pneus: Murcho 3"]);
    assert.deepEqual(calcularPadroes(enviados, 30).porEntregador, []);
    const p180 = calcularPadroes(enviados, 180);
    assert.equal(p180.total, 17);
    assert.deepEqual(p180.destaques.map((item) => item.texto), ["Marcos Lima: 3 de 4 carros entregues com 'Lataria: Sujo' (180 dias)"]);
    // O histórico é mais antigo que o último checklist de cada carro: a aba Veículos continua igual.
    const [frotaMock, todos] = await Promise.all([loadFrota(), loadChecklistsGestao()]);
    const atencao = frotaMock.filter((veiculo) => situacaoVeiculo(veiculo, todos, 15).tone === "danger").map((veiculo) => veiculo.placa).sort();
    assert.deepEqual(atencao, ["BRA2E19", "MGA3J44", "PRN5K72", "RIO7G21"]);
    assert.equal(todos.length, 23);
  });
  resetMock();
});

test("cada carro vence pela periodicidade do modelo escolhido; sem modelo fica fora da rotina", () => {
  const modelo = (id: string, extra: Partial<Modelo>): Modelo => ({ ...novoModelo(), id, nome: id, ...extra });
  const padrao = modelo("padrao", { padraoQuinzenal: true, periodicidadeDias: 15 });
  const hondas = modelo("hondas", { prioridade: 10, periodicidadeDias: 3, filtroJson: JSON.stringify({ condicoes: [{ campo: "cr40f_marca", operador: "igual", valor: "Honda" }] }) });
  const carro = (id: string, marca: string, categoria = 100000000): VeiculoFiltro => ({ id, placa: id, statecode: 0, status: 202410001, rotulos: {}, campos: { cr40f_marca: marca, new_categoriadoveiculo: categoria } });
  const veiculos = [carro("V1", "Honda"), carro("V2", "Toyota"), carro("V3", "Toyota", 100000001)];
  assert.equal(periodicidadePorVeiculo(veiculos, [padrao, hondas])("V1"), 3, "filtro casa: periodicidade do modelo filtrado");
  assert.equal(periodicidadePorVeiculo(veiculos, [padrao, hondas])("v2"), 15, "nenhum filtro casa: padrão (próprio + ativo)");
  assert.equal(periodicidadePorVeiculo(veiculos, [padrao, hondas])("V3"), null, "terceiro sem filtro: fora da rotina");
  assert.equal(periodicidadePorVeiculo(veiculos, [hondas])("V2"), null, "sem padrão ativo: fora da rotina");
  assert.equal(periodicidadePorVeiculo(veiculos, [padrao, hondas])("V9"), 15, "sem os dados do filtro: vale o padrão");
  assert.equal(periodicidadePorVeiculo(veiculos, [padrao, { ...hondas, periodicidadeDias: 0 }])("V1"), 15, "periodicidade inválida no modelo: 15");

  // Vencimento pela periodicidade do carro: 5 dias atrás vence em 3 dias = vencido; em 15, em dia.
  assert.equal(situacaoVeiculo(veiculo, [checklist({})], 3, NOW).label, "Vencido");
  assert.equal(situacaoVeiculo(veiculo, [checklist({})], 15, NOW).label, "Em dia");
  const fora = situacaoVeiculo(veiculo, [checklist({})], null, NOW);
  assert.deepEqual([fora.label, fora.tone, fora.detail], ["Fora da rotina", "neutral", "Nenhum modelo de checklist se aplica a este carro"]);
  assert.equal(situacaoVeiculo(veiculo, [], null, NOW).label, "Fora da rotina", "sem checklist e sem modelo não é 'Sem checklist'");
  const problema = situacaoVeiculo(veiculo, [checklist({ temProblema: true, qtdProblemas: 1, concluidoEm: new Date(NOW - 40 * DAY).toISOString() })], null, NOW);
  assert.equal(problema.label, "1 item Não OK", "problema continua visível fora da rotina");
  assert.doesNotMatch(problema.detail, /venceu/);
  assert.equal(situacaoVeiculo(veiculo, [checklist({ id: "p", estado: CHECKLIST_ESTADO.pendente, concluidoEm: null })], null, NOW).label, "Pendente", "checklist aberto vale mesmo fora da rotina");
});

test("L1: aviso 'Vence em' usa 1/5 da periodicidade, entre 1 e 3 dias", () => {
  assert.equal(limiarVencimento(3), 1);
  assert.equal(limiarVencimento(1), 1);
  assert.equal(limiarVencimento(10), 2);
  assert.equal(limiarVencimento(15), 3);
  assert.equal(limiarVencimento(30), 3);
  // Periodicidade 3: feito há 1 dia vence em 2, ainda "Em dia"; feito há 2 dias vence amanhã.
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 1 * DAY).toISOString() })], 3, NOW).label, "Em dia");
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 2 * DAY).toISOString() })], 3, NOW).label, "Vence em 1 dia");
  // Periodicidade 1 dia: só vencido ou em dia, sem janela de aviso negativa.
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 12 * 3_600_000).toISOString() })], 1, NOW).label, "Vence em 1 dia");
  assert.equal(situacaoVeiculo(veiculo, [checklist({ concluidoEm: new Date(NOW - 1 * DAY).toISOString() })], 1, NOW).label, "Vencido");
});

test("M10: KPI 'Com o motorista' conta veículos distintos com checklist pendente", () => {
  const pendente = (id: string, veiculoId: string) => checklist({ id, veiculoId, estado: CHECKLIST_ESTADO.pendente, concluidoEm: null });
  assert.equal(veiculosComMotorista([pendente("a", "v1"), pendente("b", "v1"), pendente("c", "V1"), pendente("d", "v2")]), 2);
  assert.equal(veiculosComMotorista([pendente("a", ""), checklist({ id: "b", estado: CHECKLIST_ESTADO.aguardandoMotorista, concluidoEm: null })]), 0);
  assert.equal(situacaoVeiculo(veiculo, [checklist({ temProblema: true, qtdProblemas: 1 })], 15, NOW).label, "1 item Não OK");
});

test("M5: motivo do cancelamento é obrigatório com pelo menos 5 caracteres", async () => {
  assert.match(erroMotivoCancelamento(""), /pelo menos 5/);
  assert.match(erroMotivoCancelamento("  ok  "), /pelo menos 5/);
  assert.equal(erroMotivoCancelamento("Carro na oficina"), "");
  assert.match(erroMotivoCancelamento("x".repeat(501)), /até 500/);
  await withWindow("localhost", () => assert.rejects(cancelarChecklist("qualquer", "ok"), /pelo menos 5/));
});

test("H1: solicitar envia o id do modelo escolhido, inclusive o padrão", async () => {
  resetMock();
  await withWindow("localhost", async () => {
    const modelos = await loadModelos();
    const padrao = modelos.find((item) => item.padraoQuinzenal)!;
    const outro = modelos.find((item) => !item.padraoQuinzenal && item.ativo)!;
    const carro = (await loadFrota()).find((item) => item.placa === "QTP4F55")!;
    await solicitarChecklist(carro.id, padrao.id);
    await solicitarChecklist(carro.id, outro.id);
    const novos = (await loadChecklistsGestao()).filter((item) => item.veiculoId === carro.id && item.origem === CHECKLIST_ORIGEM.manual);
    assert.deepEqual(novos.map((item) => item.modeloNome).sort(), [outro.nome, padrao.nome].sort());
    await assert.rejects(solicitarChecklist(carro.id, "nao-existe"), /modelo/i);
  });
  resetMock();
});

test("L4: erro genérico da lib copiada vira mensagem da ação da operação", () => {
  const semXrm = erroAcaoOperacao(new Error("Abra o aplicativo no Power Apps para enviar o checklist."), "cancelar o checklist") as Error;
  assert.equal(semXrm.message, "Abra esta tela dentro do Sistema Betinhos para cancelar o checklist.");
  const http = erroAcaoOperacao(Object.assign(new Error("Não foi possível enviar o checklist (500)."), { code: 500 }), "solicitar o checklist") as Error & { code: number };
  assert.equal(http.message, "Não foi possível solicitar o checklist (500).");
  assert.equal(http.code, 500);
  assert.equal((erroAcaoOperacao(new Error("Checklist já cancelado."), "cancelar o checklist") as Error).message, "Checklist já cancelado.");
});
