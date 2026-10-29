import assert from "node:assert/strict";
import { test } from "vitest";
import {
  adicionarProblemas,
  comUids,
  contarUsoModelo,
  duplicarModelo,
  errosModelo,
  FalhaAoSalvarModelo,
  itemDePronto,
  ITENS_PRONTOS,
  loadModelos,
  loadOpcoesFiltro,
  loadVeiculosFiltro,
  mapVeiculoFiltro,
  opcoesDosVeiculos,
  moverItem,
  moverPrioridade,
  novoItem,
  novoModelo,
  ordenarModelos,
  podeSalvar,
  proximaPrioridade,
  prontoNoModelo,
  resetMock,
  resumoErros,
  salvarPrioridades,
  saveModelo,
  type Modelo,
  type ModeloItem,
  type ModeloStore
} from "../domain/gestaoChecklists";
import { montarChangeset } from "../data/dataverse";
import { usarXrmFalso } from "./xrmFalso";

usarXrmFalso();

// ---------- Fake do Dataverse para o salvar ----------

type Chamada = [string, ...unknown[]];
type Gravado = { modelos: Map<string, { padrao: boolean; ativo: boolean }>; itens: Map<string, { modeloId: string; ordem: number; rotulo: string }> };

function fakeStore(gravado: Gravado = { modelos: new Map(), itens: new Map() }, falhas: Partial<Record<keyof ModeloStore, (args: unknown[], vez: number) => boolean>> = {}) {
  const chamadas: Chamada[] = [];
  const vezes: Record<string, number> = {};
  let seq = 0;
  const call = <T>(nome: keyof ModeloStore, args: unknown[], run: () => T): Promise<T> => {
    vezes[nome] = (vezes[nome] ?? 0) + 1;
    chamadas.push([nome, ...args]);
    if (falhas[nome]?.(args, vezes[nome])) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(run());
  };
  const store: ModeloStore = {
    criarModelo: (modelo) => call("criarModelo", [modelo.nome], () => { const id = `M${++seq}`; gravado.modelos.set(id, { padrao: false, ativo: modelo.ativo }); return id; }),
    atualizarModelo: (id, modelo) => call("atualizarModelo", [id], () => { gravado.modelos.get(id)!.ativo = modelo.ativo; }),
    trocarPadrao: (id, desmarcar) => call("trocarPadrao", [id, desmarcar], () => { gravado.modelos.get(id)!.padrao = true; desmarcar.forEach((outro) => { gravado.modelos.get(outro)!.padrao = false; }); }),
    criarItem: (modeloId, item, ordem) => call("criarItem", [item.rotulo, ordem], () => { const id = `I${++seq}`; gravado.itens.set(id, { modeloId, ordem, rotulo: item.rotulo }); return id; }),
    atualizarItem: (id, item, ordem) => call("atualizarItem", [id, ordem], () => { Object.assign(gravado.itens.get(id)!, { ordem, rotulo: item.rotulo }); }),
    desativarItem: (id) => call("desativarItem", [id], () => { gravado.itens.delete(id); }),
    padroesAtivos: () => call("padroesAtivos", [], () => [...gravado.modelos].filter(([, row]) => row.padrao && row.ativo).map(([id]) => id))
  };
  return { store, chamadas, gravado, nomes: () => chamadas.map(([nome]) => nome) };
}

const item = (rotulo: string, extra: Partial<ModeloItem> = {}): ModeloItem => ({ ...novoItem(1, "foto"), rotulo, ...extra });
const modeloCom = (nome: string, rotulos: string[]): Modelo => ({ ...novoModelo(), nome, itens: rotulos.map((rotulo, index) => ({ ...item(rotulo), ordem: index + 1 })) });

test("erros ficam no item certo, com resumo para o topo", () => {
  const modelo = { ...modeloCom("Vistoria", ["Frente", "", "Pneus"]) };
  modelo.itens[2] = { ...modelo.itens[2], tipo: "okNok", opcoesProblema: "x".repeat(41) };
  const erros = errosModelo(modelo);
  assert.deepEqual(erros.map((erro) => erro.alvo === "item" ? [erro.indice, erro.campo, erro.uid] : [erro.campo]), [
    [1, "rotulo", modelo.itens[1].uid],
    [2, "problemas", modelo.itens[2].uid]
  ]);
  assert.equal(erros[0].mensagem, "Dê um nome ao item.");
  assert.equal(resumoErros(erros), "2 itens precisam de ajuste");
  assert.equal(resumoErros(errosModelo({ ...modelo, nome: "" })), "3 pontos precisam de ajuste");
  assert.equal(resumoErros(errosModelo({ ...modelo, itens: [modelo.itens[1]] })), "1 item precisa de ajuste");
  assert.deepEqual(errosModelo({ ...modelo, itens: [] }).map((erro) => erro.campo), ["itens"], "modelo sem itens não salva");
});

test("problemas como chips: vírgula, Enter, repetido, 40 caracteres e limite de 12", () => {
  assert.deepEqual(adicionarProblemas([], " Murcho, Careca ,\nFurado "), { lista: ["Murcho", "Careca", "Furado"], aviso: "" });
  assert.deepEqual(adicionarProblemas(["Murcho"], "MURCHO"), { lista: ["Murcho"], aviso: "“MURCHO” já está na lista." });
  assert.equal(adicionarProblemas([], "x".repeat(41)).aviso, `“${"x".repeat(24)}…” tem 41 caracteres; use até 40.`);
  assert.equal(adicionarProblemas([], "x".repeat(40)).lista.length, 1);
  const onze = Array.from({ length: 11 }, (_, i) => `P${i}`);
  assert.deepEqual(adicionarProblemas(onze, "Doze, Treze"), { lista: [...onze, "Doze"], aviso: "Limite de 12 problemas atingido." });
});

test("mover item 4 posições mantém o uid (o foco acompanha) e renumera", () => {
  const itens = modeloCom("V", ["A", "B", "C", "D", "E", "F"]).itens;
  const movido = moverItem(itens, 5, 1);
  assert.deepEqual(movido.map((row) => row.rotulo), ["A", "F", "B", "C", "D", "E"]);
  assert.equal(movido[1].uid, itens[5].uid);
  assert.deepEqual(movido.map((row) => row.ordem), [1, 2, 3, 4, 5, 6]);
  assert.equal(moverItem(itens, 0, 9), itens);
});

test("itens prontos: fotos e OK / Não OK com problemas, obrigatório pelo tipo, marcados quando já estão no modelo", () => {
  assert.equal(ITENS_PRONTOS.length, 14);
  const pneus = itemDePronto(ITENS_PRONTOS.find((pronto) => pronto.chave === "pneus")!, 3);
  assert.deepEqual({ tipo: pneus.tipo, obrigatorio: pneus.obrigatorio, opcoes: pneus.opcoesProblema, ordem: pneus.ordem }, { tipo: "okNok", obrigatorio: true, opcoes: "Murcho\nCareca\nFurado\nOutro", ordem: 3 });
  const obs = itemDePronto(ITENS_PRONTOS.find((pronto) => pronto.chave === "observacoes")!, 1);
  assert.equal(obs.obrigatorio, false);
  assert.match(itemDePronto(ITENS_PRONTOS[0], 1).instrucao, /placa/);
  assert.ok(ITENS_PRONTOS.every((pronto) => pronto.problemas.length <= 12 && pronto.problemas.every((p) => p.length <= 40)));
  const modelo = modeloCom("V", ["  frente DO veiculo "]);
  assert.equal(prontoNoModelo(modelo, ITENS_PRONTOS[0]), true, "compara sem acento, espaço e maiúscula");
  assert.equal(prontoNoModelo(modelo, ITENS_PRONTOS[1]), false);
});

test("duplicar modelo cria cópia sem ids e fora da rotina", () => {
  const original: Modelo = { ...modeloCom("Vistoria", ["A", "B"]), id: "M1", padraoQuinzenal: true, ativo: false };
  original.itens = original.itens.map((row, index) => ({ ...row, id: `I${index}` }));
  const copia = duplicarModelo(original);
  assert.equal(copia.id, "");
  assert.equal(copia.nome, "Cópia de Vistoria");
  assert.equal(copia.padraoQuinzenal, false);
  assert.equal(copia.ativo, true);
  assert.ok(copia.itens.every((row) => !row.id && row.uid));
  assert.notEqual(copia.itens[0].uid, original.itens[0].uid);
  assert.equal(comUids({ ...original }).itens[0].uid, original.itens[0].uid);
});

test("salvar modelo novo: cria cabeçalho e itens, sem PATCH à toa", async () => {
  const fake = fakeStore();
  const { modelo } = await saveModelo(modeloCom("Vistoria", ["Frente", "Traseira"]), null, { store: fake.store });
  assert.deepEqual(fake.nomes(), ["criarModelo", "criarItem", "criarItem"]);
  assert.ok(modelo.id && modelo.itens.every((row) => row.id));
});

test("salvar envia só o que mudou", async () => {
  const fake = fakeStore();
  const { modelo: salvo } = await saveModelo(modeloCom("Vistoria", ["A", "B", "C"]), null, { store: fake.store });
  fake.chamadas.length = 0;
  const semMudanca = await saveModelo(salvo, salvo, { store: fake.store });
  assert.deepEqual(fake.nomes(), [], "sem mudança, nada é enviado");
  const editado = { ...semMudanca.modelo, itens: semMudanca.modelo.itens.map((row) => row.rotulo === "B" ? { ...row, rotulo: "B2" } : row) };
  await saveModelo(editado, salvo, { store: fake.store });
  assert.deepEqual(fake.chamadas, [["atualizarItem", salvo.itens[1].id, 2]]);
  fake.chamadas.length = 0;
  const reordenado = { ...salvo, itens: moverItem(salvo.itens, 2, 0).slice(0, 2) };
  await saveModelo(reordenado, salvo, { store: fake.store });
  assert.deepEqual(fake.chamadas, [["atualizarItem", salvo.itens[2].id, 1], ["atualizarItem", salvo.itens[0].id, 2], ["desativarItem", salvo.itens[1].id]]);
});

test("falha no meio do salvar devolve os ids gravados e a nova tentativa não duplica", async () => {
  const fake = fakeStore(undefined, { criarItem: (_args, vez) => vez === 3 });
  const modelo = modeloCom("Vistoria", ["A", "B", "C", "D"]);
  const falha = await saveModelo(modelo, null, { store: fake.store }).then(() => null, (error: unknown) => error);
  assert.ok(falha instanceof FalhaAoSalvarModelo);
  assert.match(falha.message, /Sem conexão/);
  assert.ok(falha.modelo.id, "o id do modelo criado volta para a tela");
  assert.deepEqual(falha.modelo.itens.map((row) => Boolean(row.id)), [true, true, false, false]);
  assert.equal(falha.persistido.itens.length, 2);
  await saveModelo(falha.modelo, falha.persistido, { store: fake.store });
  assert.equal(fake.nomes().filter((nome) => nome === "criarModelo").length, 1);
  assert.deepEqual([...fake.gravado.itens.values()].map((row) => row.rotulo).sort(), ["A", "B", "C", "D"], "quatro itens, nenhum repetido");
});

test("trocar o padrão: depois dos itens, uma transação marca o novo e desmarca o antigo, e sobra exatamente um", async () => {
  const gravado: Gravado = { modelos: new Map([["OLD", { padrao: true, ativo: true }]]), itens: new Map() };
  const fake = fakeStore(gravado);
  const novo = { ...modeloCom("Nova vistoria", ["A"]), padraoQuinzenal: true };
  const { modelo, aviso } = await saveModelo(novo, null, { store: fake.store });
  const troca = fake.chamadas.findIndex(([nome]) => nome === "trocarPadrao");
  assert.ok(troca > fake.nomes().lastIndexOf("criarItem"), "o padrão só muda depois dos itens gravados");
  assert.deepEqual(fake.chamadas[troca], ["trocarPadrao", modelo.id, ["OLD"]], "uma chamada: marca este e desmarca o antigo");
  assert.equal(fake.nomes().filter((nome) => nome === "trocarPadrao").length, 1);
  assert.equal(fake.nomes().at(-1), "padroesAtivos", "confere na fonte depois da troca");
  assert.deepEqual(await fake.store.padroesAtivos(), [modelo.id]);
  assert.equal(aviso, "");
});

test("falha na transação do padrão: nada muda na rotina, o Salvar continua habilitado e a nova tentativa resolve", async () => {
  const gravado: Gravado = { modelos: new Map([["OLD", { padrao: true, ativo: true }], ["M9", { padrao: false, ativo: true }]]), itens: new Map() };
  const fake = fakeStore(gravado, { trocarPadrao: (_args, vez) => vez === 1 });
  const modelo: Modelo = { ...modeloCom("Nova", []), id: "M9", padraoQuinzenal: true, itens: [{ ...item("A"), id: "IA", ordem: 1 }] };
  const original: Modelo = { ...modelo, padraoQuinzenal: false };
  const falha = await saveModelo(modelo, original, { store: fake.store, padraoAoAbrir: false }).then(() => null, (error: unknown) => error);
  assert.ok(falha instanceof FalhaAoSalvarModelo);
  assert.match(falha.message, /Sem conexão/);
  assert.deepEqual(await fake.store.padroesAtivos(), ["OLD"], "transação atômica: o antigo continua, sem dois padrões");
  assert.equal(falha.persistido.padraoQuinzenal, false, "o estado gravado reflete a fonte");
  assert.ok(podeSalvar({ busy: false, dirty: JSON.stringify(falha.modelo) !== JSON.stringify(falha.persistido), falhaSalvar: true }));
  const { modelo: salvo } = await saveModelo(falha.modelo, falha.persistido, { store: fake.store, padraoAoAbrir: false });
  assert.equal(salvo.padraoQuinzenal, true);
  assert.deepEqual(await fake.store.padroesAtivos(), ["M9"]);
});

test("conferência acha dois padrões: o estado mostra a fonte, o Salvar segue habilitado mesmo sem diferença e a nova tentativa corrige", async () => {
  const gravado: Gravado = { modelos: new Map([["OLD", { padrao: true, ativo: true }], ["M9", { padrao: false, ativo: true }]]), itens: new Map() };
  const fake = fakeStore(gravado);
  const trocar = fake.store.trocarPadrao;
  let concorrente = true;
  // Outra sessão remarca o antigo logo depois da primeira transação.
  fake.store.trocarPadrao = async (id, desmarcar) => { await trocar(id, desmarcar); if (concorrente) { concorrente = false; gravado.modelos.get("OLD")!.padrao = true; } };
  const modelo: Modelo = { ...modeloCom("Nova", []), id: "M9", padraoQuinzenal: true, itens: [{ ...item("A"), id: "IA", ordem: 1 }] };
  const falha = await saveModelo(modelo, { ...modelo, padraoQuinzenal: false }, { store: fake.store, padraoAoAbrir: false }).then(() => null, (error: unknown) => error);
  assert.ok(falha instanceof FalhaAoSalvarModelo);
  assert.match(falha.message, /ficou com 2 modelos padrão/);
  assert.equal(falha.persistido.padraoQuinzenal, true, "este está marcado na fonte");
  assert.equal(JSON.stringify(falha.modelo), JSON.stringify(falha.persistido), "sem diferença local: era o caso que desativava o Salvar");
  assert.equal(podeSalvar({ busy: false, dirty: false, falhaSalvar: true }), true);
  assert.equal(podeSalvar({ busy: false, dirty: false, falhaSalvar: false }), false);
  await saveModelo(falha.modelo, falha.persistido, { store: fake.store, padraoAoAbrir: false });
  assert.deepEqual(await fake.store.padroesAtivos(), ["M9"]);
});

test("checkbox intocado: não remarca o padrão e avisa quando ele mudou em outro lugar", async () => {
  const gravado: Gravado = { modelos: new Map([["M1", { padrao: false, ativo: true }], ["OUTRO", { padrao: true, ativo: true }]]), itens: new Map() };
  const fake = fakeStore(gravado);
  const original: Modelo = { ...modeloCom("Vistoria", []), id: "M1", padraoQuinzenal: true, itens: [{ ...item("A"), id: "IA", ordem: 1 }] };
  const { modelo, aviso } = await saveModelo({ ...original, nome: "Vistoria 2" }, original, { store: fake.store });
  assert.equal(fake.nomes().includes("trocarPadrao"), false, "não remarca");
  assert.equal(modelo.padraoQuinzenal, false, "o estado passa a refletir a fonte");
  assert.match(aviso, /mudou em outro lugar: “Vistoria 2” não é mais o padrão/);
  assert.deepEqual(await fake.store.padroesAtivos(), ["OUTRO"]);
  // Fonte ainda com este como padrão: nada a avisar e nenhuma troca.
  gravado.modelos.get("M1")!.padrao = true; gravado.modelos.get("OUTRO")!.padrao = false;
  const segundo = await saveModelo({ ...original, nome: "Vistoria 3" }, original, { store: fake.store });
  assert.equal(segundo.aviso, "");
  assert.equal(segundo.modelo.padraoQuinzenal, true);
});

test("inativar ou desmarcar o modelo padrão é bloqueado com explicação", async () => {
  const padrao: Modelo = { ...modeloCom("Vistoria", ["A"]), id: "M1", padraoQuinzenal: true };
  padrao.itens[0].id = "I1";
  for (const mudanca of [{ ativo: false }, { padraoQuinzenal: false }]) {
    const editado = { ...padrao, ...mudanca };
    assert.deepEqual(errosModelo(editado, padrao).map((erro) => erro.campo), ["padrao"]);
    const fake = fakeStore();
    await assert.rejects(saveModelo(editado, padrao, { store: fake.store }), /Marque outro modelo para a rotina antes/);
    assert.equal(fake.chamadas.length, 0);
  }
  assert.deepEqual(errosModelo({ ...padrao, nome: "Outro nome" }, padrao), []);
});

test("changeset do padrão: um array dentro do array, Update com operationType 2", () => {
  const requests = montarChangeset([
    { entitySet: "new_checklistmodelos", id: "new", data: { new_padraoquinzenal: true } },
    { entitySet: "new_checklistmodelos", id: "old", data: { new_padraoquinzenal: false } }
  ]) as unknown as Array<Array<{ etn: string; id: string; payload: unknown; getMetadata: () => Record<string, unknown> }>>;
  assert.equal(requests.length, 1, "um único changeset");
  assert.ok(Array.isArray(requests[0]) && requests[0].length === 2);
  assert.deepEqual(requests[0].map(({ etn, id, payload }) => ({ etn, id, payload })), [
    { etn: "new_checklistmodelo", id: "new", payload: { new_padraoquinzenal: true } },
    { etn: "new_checklistmodelo", id: "old", payload: { new_padraoquinzenal: false } }
  ]);
  assert.deepEqual(requests[0][0].getMetadata(), { boundParameter: null, parameterTypes: {}, operationType: 2, operationName: "Update" });
});

function dataverseFalso(padroes: Set<string>, opcoes: { semExecuteMultiple?: boolean; falharTransacao?: boolean } = {}) {
  const chamadas: unknown[][] = [];
  const webApi: Record<string, unknown> = {
    createRecord: async (entity: string, data: Record<string, unknown>) => { chamadas.push(["POST", entity, data]); return { id: entity === "new_checklistmodelo" ? "NEW" : "ITEM" }; },
    updateRecord: async (entity: string, id: string, data: Record<string, unknown>) => { chamadas.push(["PATCH", entity, id, data]); return {}; },
    retrieveMultipleRecords: async (entity: string, query: string) => { chamadas.push(["GET", entity, query]); return { entities: [...padroes].map((id) => ({ new_checklistmodeloid: id })) }; }
  };
  if (!opcoes.semExecuteMultiple) {
    webApi.online = {
      executeMultiple: async (requests: Array<Array<{ etn: string; id: string; payload: { new_padraoquinzenal: boolean } }>>) => {
        chamadas.push(["executeMultiple", requests]);
        if (opcoes.falharTransacao) throw { errorCode: 1, message: "falhou", httpStatusCode: 500 };
        for (const request of requests[0]) { if (request.payload.new_padraoquinzenal) padroes.add(request.id); else padroes.delete(request.id); }
        return [];
      }
    };
  }
  return { chamadas, window: { location: { hostname: "org.crm2.dynamics.com", search: "" }, Xrm: { WebApi: webApi } } };
}

test("Dataverse: cria o modelo fora da rotina, liga o item e troca o padrão num só executeMultiple", async () => {
  const previous = (globalThis as any).window;
  const padroes = new Set(["old"]);
  const fake = dataverseFalso(padroes);
  (globalThis as any).window = fake.window;
  try {
    await saveModelo({ ...modeloCom("Nova", ["Pneus"]), padraoQuinzenal: true }, null);
    const { chamadas } = fake;
    assert.deepEqual(chamadas[0], ["POST", "new_checklistmodelo", { new_name: "Nova", new_descricao: "", new_ativo: true, new_periodicidadedias: 15, new_filtrojson: null, new_prioridade: null, new_padraoquinzenal: false }]);
    assert.equal((chamadas[1][2] as Record<string, unknown>)["new_Modelo@odata.bind"], "/new_checklistmodelos(new)");
    assert.match(String(chamadas[2][2]), /new_ativo eq true and new_padraoquinzenal eq true/);
    const [, requests] = chamadas[3] as [string, Array<Array<{ id: string; payload: unknown }>>];
    assert.equal(chamadas[3][0], "executeMultiple");
    assert.deepEqual(requests[0].map(({ id, payload }) => [id, payload]), [["new", { new_padraoquinzenal: true }], ["old", { new_padraoquinzenal: false }]]);
    assert.equal(chamadas.filter(([tipo, , , data]) => tipo === "PATCH" && data && "new_padraoquinzenal" in (data as object)).length, 0, "nenhum PATCH solto do padrão");
    assert.equal(chamadas[4][0], "GET", "confere depois");
    assert.deepEqual([...padroes], ["new"]);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("Dataverse: transação do padrão recusada não muda nada e sem executeMultiple não troca aos pedaços", async () => {
  const previous = (globalThis as any).window;
  try {
    const padroes = new Set(["old"]);
    (globalThis as any).window = dataverseFalso(padroes, { falharTransacao: true }).window;
    const falha = await saveModelo({ ...modeloCom("Nova", ["Pneus"]), padraoQuinzenal: true }, null).then(() => null, (error: unknown) => error);
    assert.ok(falha instanceof FalhaAoSalvarModelo && /a troca do padrão não foi feita \(nada mudou na rotina\)/.test(falha.message));
    assert.deepEqual([...padroes], ["old"]);
    const semMultiple = dataverseFalso(new Set(["old"]), { semExecuteMultiple: true });
    (globalThis as any).window = semMultiple.window;
    const erro = await saveModelo({ ...modeloCom("Outra", ["Pneus"]), padraoQuinzenal: true }, null).then(() => null, (error: unknown) => error);
    assert.ok(erro instanceof FalhaAoSalvarModelo && /executeMultiple/.test(erro.message));
    assert.equal(semMultiple.chamadas.filter(([tipo, , , data]) => tipo === "PATCH" && data && "new_padraoquinzenal" in (data as object)).length, 0);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("mock: uso do modelo e salvar com falha forçada não duplica", async () => {
  resetMock();
  const previous = (globalThis as any).window;
  (globalThis as any).window = { location: { hostname: "localhost", search: "?mockModeloFalha=3" } };
  try {
    const uso = await contarUsoModelo("mod-quinzenal");
    assert.ok(uso.total > 10 && uso.abertos > 0);
    assert.deepEqual(await contarUsoModelo("mod-entrega"), { total: 1, abertos: 0 });
    const novo = modeloCom("Nova", ["A", "B", "C"]);
    const falha = await saveModelo(novo, null).then(() => null, (error: unknown) => error);
    assert.ok(falha instanceof FalhaAoSalvarModelo);
    await saveModelo(falha.modelo, falha.persistido);
    const modelos = await loadModelos();
    const salvos = modelos.filter((modelo) => modelo.nome === "Nova");
    assert.equal(salvos.length, 1);
    assert.deepEqual(salvos[0].itens.map((row) => row.rotulo), ["A", "B", "C"]);
    assert.ok(salvos[0].itens.every((row) => row.uid === undefined), "uid não é gravado");
  } finally {
    (globalThis as any).window = previous;
    resetMock();
  }
});

// ---------- Filtro de veículos e prioridade ----------

const BLINDADO = JSON.stringify({ condicoes: [{ campo: "cr40f_blindado", operador: "igual", valor: true }] });

test("salvar grava new_filtrojson (nulo sem condição) e new_prioridade, só quando mudam", async () => {
  const previous = (globalThis as any).window;
  const padroes = new Set<string>();
  const fake = dataverseFalso(padroes);
  (globalThis as any).window = fake.window;
  try {
    const { modelo: salvo } = await saveModelo({ ...modeloCom("Blindados", ["Vidros"]), prioridade: 30, filtroJson: BLINDADO }, null);
    const [, , criado] = fake.chamadas[0] as [string, string, Record<string, unknown>];
    assert.equal(criado.new_filtrojson, BLINDADO);
    assert.equal(criado.new_prioridade, 30);
    fake.chamadas.length = 0;
    await saveModelo(salvo, salvo);
    assert.equal(fake.chamadas.length, 0, "sem mudança, nada é enviado");
    await saveModelo({ ...salvo, filtroJson: "" }, salvo);
    assert.deepEqual(fake.chamadas.map(([tipo, entity, , data]) => [tipo, entity, (data as Record<string, unknown>).new_filtrojson, (data as Record<string, unknown>).new_prioridade]),
      [["PATCH", "new_checklistmodelo", null, 30]], "condição removida grava nulo no cabeçalho");
    fake.chamadas.length = 0;
    await saveModelo({ ...salvo, prioridade: 10 }, salvo);
    assert.equal((fake.chamadas[0][3] as Record<string, unknown>).new_prioridade, 10);
    fake.chamadas.length = 0;
    // Padrão ignora o filtro e a tela esconde a seção: nenhuma condição fica gravada escondida.
    await saveModelo({ ...salvo, padraoQuinzenal: true, filtroJson: JSON.stringify({ condicoes: [{ campo: "cr40f_marca", operador: "contem", valor: "" }] }) }, salvo);
    const cabecalho = fake.chamadas.map((chamada) => chamada[3] ?? chamada[2]).find((data) => data && typeof data === "object" && "new_filtrojson" in (data as object)) as Record<string, unknown>;
    assert.equal(cabecalho.new_filtrojson, null);
  } finally {
    (globalThis as any).window = previous;
  }
});

test("mudar uma condição deixa o modelo diferente do gravado e o salvar manda o cabeçalho", async () => {
  const fake = fakeStore();
  const { modelo: salvo } = await saveModelo({ ...modeloCom("Toyota", ["Frente"]), filtroJson: BLINDADO }, null, { store: fake.store });
  fake.chamadas.length = 0;
  const mudou = { ...salvo, filtroJson: JSON.stringify({ condicoes: [{ campo: "cr40f_blindado", operador: "igual", valor: false }] }) };
  assert.notEqual(JSON.stringify(mudou), JSON.stringify(salvo), "dirty: o editor compara o modelo inteiro");
  await saveModelo(mudou, salvo, { store: fake.store });
  assert.deepEqual(fake.nomes(), ["atualizarModelo"]);
});

test("condição incompleta não salva e o padrão ignora o filtro", () => {
  const incompleto = { ...modeloCom("Toyota", ["Frente"]), filtroJson: JSON.stringify({ condicoes: [{ campo: "cr40f_marca", operador: "contem", valor: " " }, { campo: "cr40f_anodemodelo", operador: "maior", valor: 2022 }] }) };
  const erros = errosModelo(incompleto);
  assert.deepEqual(erros.map((erro) => [erro.campo, erro.alvo === "modelo" ? erro.condicao : -1, erro.mensagem]), [["filtro", 0, "Condição 1 do filtro: escreva o valor."]]);
  assert.deepEqual(errosModelo({ ...incompleto, padraoQuinzenal: true }), []);
  assert.match(errosModelo({ ...incompleto, filtroJson: JSON.stringify({ condicoes: [{ campo: "cr40f_marca", operador: "contem", valor: "x".repeat(4000) }] }) })[0].mensagem, /grande demais/);
});

test("ordem dos modelos: por prioridade, padrão por último; Subir/Descer renumera 10, 20, 30 e manda só o que mudou", () => {
  const m = (id: string, prioridade: number | null, extra: Partial<Modelo> = {}): Modelo => ({ ...novoModelo(), id, nome: id, prioridade, ...extra });
  const modelos = [m("padrao", null, { padraoQuinzenal: true }), m("c", null), m("a", 10), m("b", 20)];
  assert.deepEqual(ordenarModelos(modelos).map((row) => row.id), ["a", "b", "c", "padrao"]);
  assert.deepEqual(moverPrioridade(modelos, "c", -1), { mudancas: [{ id: "c", prioridade: 20 }, { id: "b", prioridade: 30 }], posicao: 1, total: 3 });
  assert.deepEqual(moverPrioridade(modelos, "b", -1).mudancas, [{ id: "b", prioridade: 10 }, { id: "a", prioridade: 20 }, { id: "c", prioridade: 30 }]);
  assert.deepEqual(moverPrioridade(modelos, "a", -1).mudancas, [], "o primeiro não sobe");
  assert.deepEqual(moverPrioridade(modelos, "c", 1).mudancas, [], "o último antes do padrão não desce");
  assert.deepEqual(moverPrioridade(modelos, "padrao", -1).mudancas, [], "o padrão não entra na ordem");
  assert.equal(proximaPrioridade(modelos), 30);
  assert.equal(proximaPrioridade([m("padrao", 500, { padraoQuinzenal: true })]), 10, "a prioridade do padrão não conta");
});

test("mock: veículos da prévia variados, opções das choices e prioridade gravada", async () => {
  resetMock();
  const previous = (globalThis as any).window;
  (globalThis as any).window = { location: { hostname: "127.0.0.1", search: "" } };
  try {
    const veiculos = await loadVeiculosFiltro();
    assert.ok(veiculos.some((v) => v.status === 202410000), "tem um Vendido (a prévia tira)");
    assert.ok(veiculos.some((v) => v.campos.new_categoriadoveiculo === 100000001) && veiculos.some((v) => v.campos.new_categoriadoveiculo === 100000002));
    assert.ok(veiculos.some((v) => v.campos.cr40f_marca === null && v.campos.cr40f_anodemodelo === null));
    const opcoes = await loadOpcoesFiltro();
    assert.deepEqual(opcoes?.new_categoriadoveiculo.map((o) => o.rotulo), ["Próprio", "Terceiro", "Aluguel"]);
    await salvarPrioridades([{ id: "mod-entrega", prioridade: 5 }]);
    assert.equal((await loadModelos()).find((row) => row.id === "mod-entrega")?.prioridade, 5);
  } finally {
    (globalThis as any).window = previous;
    resetMock();
  }
});

test("veículo do Dataverse vira valores crus e rótulos formatados", () => {
  const v = mapVeiculoFiltro({ cr40f_veiculosid: "id1", cr40f_placa: "ABC1D23", cr40f_marca: "Toyota", cr40f_anodemodelo: 2023, cr40f_blindado: true, new_categoriadoveiculo: 100000000,
    "new_categoriadoveiculo@OData.Community.Display.V1.FormattedValue": "Próprio", cr40f_statusdoveiculo: 202410001, statecode: 0 });
  assert.deepEqual([v.campos.cr40f_marca, v.campos.cr40f_anodemodelo, v.campos.cr40f_blindado, v.campos.new_categoriadoveiculo, v.campos.cr40f_cor, v.rotulos.new_categoriadoveiculo, v.status],
    ["Toyota", 2023, true, 100000000, null, "Próprio", 202410001]);
});

test("sem metadata, as opções das choices vêm dos rótulos dos veículos (só os valores em uso)", () => {
  const v = (valor: number | null, rotulo: string) => mapVeiculoFiltro({ cr40f_veiculosid: String(valor), new_categoriadoveiculo: valor, "new_categoriadoveiculo@OData.Community.Display.V1.FormattedValue": rotulo });
  assert.deepEqual(opcoesDosVeiculos([v(100000001, "Terceiro"), v(100000000, "Próprio"), v(100000001, "Terceiro"), v(null, "")]).new_categoriadoveiculo,
    [{ valor: 100000000, rotulo: "Próprio" }, { valor: 100000001, rotulo: "Terceiro" }]);
});
