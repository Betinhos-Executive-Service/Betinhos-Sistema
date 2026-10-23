import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChecklistRespostasJson,
  CHECKLIST_ESTADO,
  CHECKLIST_ORIGEM,
  checklistCardTexto,
  CHECKLIST_MAX_PROBLEMAS,
  CHECKLIST_PROBLEMAS_PADRAO,
  checklistPhotoItems,
  concluirChecklist,
  countChecklistProgress,
  createChecklistDraft,
  isChecklistPending,
  loadDriverChecklist,
  loadDriverChecklists,
  mapChecklist,
  normalizeChecklistNumber,
  parseChecklistItems,
  setChecklistOkNok,
  setChecklistValor,
  toggleChecklistProblema,
  validateChecklistDraft,
  type ChecklistDraft,
  type ChecklistItem,
  type ChecklistVeiculo
} from "../src/lib/checklists.ts";

const driverId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itens: ChecklistItem[] = [
  { chave: "k-foto", ordem: 1, rotulo: "Frente", instrucao: "", tipo: "foto", obrigatorio: true, unidade: "", opcoesProblema: [] },
  { chave: "k-km", ordem: 2, rotulo: "Quilometragem", instrucao: "", tipo: "numero", obrigatorio: true, unidade: "km", opcoesProblema: [] },
  { chave: "k-comb", ordem: 3, rotulo: "Combustível", instrucao: "", tipo: "numero", obrigatorio: false, unidade: "%", opcoesProblema: [] },
  { chave: "k-obs", ordem: 4, rotulo: "Observações", instrucao: "", tipo: "texto", obrigatorio: false, unidade: "", opcoesProblema: [] }
];

function checklist(overrides: Partial<ChecklistVeiculo> = {}): ChecklistVeiculo {
  return {
    id: "c1", nome: "Checklist", motoristaId: driverId, veiculoId: "v1", placa: "ABC1D23", estado: CHECKLIST_ESTADO.pendente,
    origem: 100000000, solicitadoEm: "2026-10-19T09:00:00Z", concluidoEm: null, odometro: 45210.4, itens, respostas: [], ...overrides
  };
}

function withWindow<T>(windowMock: any, run: () => Promise<T>) {
  const previous = (globalThis as any).window;
  windowMock.parent ??= windowMock;
  (globalThis as any).window = windowMock;
  return run().finally(() => { (globalThis as any).window = previous; });
}

test("mapeia o registro do Dataverse com itens ordenados, placa e respostas", () => {
  const row = mapChecklist({
    new_checklistveiculoid: "c1",
    new_name: "Checklist ABC1D23 - 19/10/2026",
    _new_motorista_value: driverId,
    _new_veiculo_value: "v1",
    "_new_veiculo_value@OData.Community.Display.V1.FormattedValue": "ABC1D23",
    new_estado: 100000002,
    new_origem: 100000001,
    new_solicitadoem: "2026-10-19T09:00:00Z",
    new_concluidoem: "2026-10-19T10:00:00Z",
    new_odometroinfleet: 45210,
    new_itensjson: JSON.stringify([...itens].reverse()),
    new_respostasjson: JSON.stringify([{ chave: "k-foto", rotulo: "Frente", tipo: "foto", valor: "", fotos: [{ link: "https://x/1", caminho: "c", nomeArquivo: "f.jpg" }] }])
  });
  assert.equal(row.placa, "ABC1D23");
  assert.deepEqual(row.itens.map((item) => item.chave), ["k-foto", "k-km", "k-comb", "k-obs"]);
  assert.equal(row.respostas[0].fotos[0].link, "https://x/1");
  assert.equal(row.odometro, 45210);
  assert.equal(isChecklistPending(row), false);
});

test("JSON inválido vira lista vazia sem derrubar a tela", () => {
  const row = mapChecklist({ new_checklistveiculoid: "c1", new_itensjson: "{quebrado", new_respostasjson: null, new_estado: 100000001 });
  assert.deepEqual(row.itens, []);
  assert.deepEqual(row.respostas, []);
  assert.equal(row.odometro, null);
  assert.equal(isChecklistPending(row), true);
});

test("número aceita milhar com ponto, decimal com vírgula e recusa texto", () => {
  assert.equal(normalizeChecklistNumber("45210"), "45210");
  assert.equal(normalizeChecklistNumber("45.210"), "45210");
  assert.equal(normalizeChecklistNumber("1.045.210"), "1045210");
  assert.equal(normalizeChecklistNumber("12,5"), "12.5");
  assert.equal(normalizeChecklistNumber("1.234,5"), "1234.5");
  assert.equal(normalizeChecklistNumber("12.5"), "12.5");
  assert.equal(normalizeChecklistNumber(" "), "");
  assert.equal(normalizeChecklistNumber("abc"), null);
  assert.equal(normalizeChecklistNumber("-3"), null);
  assert.equal(normalizeChecklistNumber("99999999"), null);
});

test("rascunho sugere o KM do hodômetro só no item em km", () => {
  const draft = createChecklistDraft(checklist());
  assert.equal(draft.valores["k-km"], "45210");
  assert.equal(draft.valores["k-comb"], undefined);
  assert.equal(createChecklistDraft(checklist({ odometro: null })).valores["k-km"], undefined);
});

test("KM sugerido não conta no progresso até o motorista mexer, mas vale no envio", () => {
  const draft = createChecklistDraft(checklist());
  assert.deepEqual(draft.sugeridos, ["k-km"]);
  assert.deepEqual(countChecklistProgress(itens, draft), { done: 0, total: 4 });
  assert.equal(validateChecklistDraft(itens, draft)["k-km"], undefined);
  assert.equal(JSON.parse(buildChecklistRespostasJson([itens[1]], draft, {}))[0].valor, "45210");

  const edited = setChecklistValor(draft, "k-km", "45300");
  assert.deepEqual(edited.sugeridos, []);
  assert.equal(edited.valores["k-km"], "45300");
  assert.deepEqual(countChecklistProgress(itens, edited), { done: 1, total: 4 });

  // Rascunho antigo (sem sugeridos) salvo no aparelho continua contando o valor.
  const legacy: ChecklistDraft = { checklistId: "c1", valores: { "k-km": "45210" }, fotos: {}, updatedAt: "2026-10-19T09:00:00Z" };
  assert.deepEqual(countChecklistProgress(itens, legacy), { done: 1, total: 4 });
  assert.deepEqual(countChecklistProgress(itens, createChecklistDraft(checklist({ odometro: null }))), { done: 0, total: 4 });
});

test("validação exige foto e campos obrigatórios, sem reprovar opcionais", () => {
  const draft = createChecklistDraft(checklist({ odometro: null }));
  const errors = validateChecklistDraft(itens, draft);
  assert.deepEqual(Object.keys(errors).sort(), ["k-foto", "k-km"]);
  draft.fotos["k-foto"] = [{ id: "p1", dataUrl: "data:image/jpeg;base64,AAA" }];
  draft.valores["k-km"] = "45.210";
  draft.valores["k-comb"] = "meio";
  assert.deepEqual(Object.keys(validateChecklistDraft(itens, draft)), ["k-comb"]);
  draft.valores["k-comb"] = "";
  assert.deepEqual(validateChecklistDraft(itens, draft), {});
  assert.deepEqual(countChecklistProgress(itens, draft), { done: 2, total: 4 });
});

test("respostas seguem o contrato do plugin com fotos enviadas e número normalizado", () => {
  const draft = createChecklistDraft(checklist());
  draft.valores["k-km"] = "45.211";
  draft.valores["k-obs"] = "  Arranhão no para-choque  ";
  const json = JSON.parse(buildChecklistRespostasJson(itens, draft, { "k-foto": [{ link: "https://x/1", caminho: "c", nomeArquivo: "f.jpg" }] }));
  assert.deepEqual(json, [
    { chave: "k-foto", fotos: [{ link: "https://x/1", caminho: "c", nomeArquivo: "f.jpg" }] },
    { chave: "k-km", valor: "45211" },
    { chave: "k-comb", valor: "" },
    { chave: "k-obs", valor: "Arranhão no para-choque" }
  ]);
});

test("Dataverse: lista só pendentes e concluídos do motorista logado", async () => {
  let query = "";
  await withWindow({
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { retrieveMultipleRecords: async (_entity: string, options: string) => {
      query = options;
      return { entities: [
        { new_checklistveiculoid: "c1", _new_motorista_value: driverId, new_estado: 100000001, new_itensjson: "[]" },
        { new_checklistveiculoid: "c2", _new_motorista_value: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", new_estado: 100000001, new_itensjson: "[]" }
      ] };
    } } }
  }, async () => {
    const rows = await loadDriverChecklists(driverId.toUpperCase());
    assert.deepEqual(rows.map((row) => row.id), ["c1"]);
  });
  assert.match(query, /_new_motorista_value eq aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.match(query, /new_estado eq 100000001 or new_estado eq 100000002/);
});

test("Dataverse: motorista sem id não consulta", async () => {
  await withWindow({ location: { hostname: "org.crm2.dynamics.com" } }, async () => {
    await assert.rejects(loadDriverChecklists(""), /Motorista não identificado/);
  });
});

test("conclusão envia Custom API com parâmetros em texto e mostra a mensagem do plugin", async () => {
  const calls: any[] = [];
  await withWindow({
    location: { hostname: "org.crm2.dynamics.com" },
    Xrm: { WebApi: { online: { execute: async function (this: unknown, request: any) {
      calls.push({ request, metadata: request.getMetadata(), bound: this });
      return calls.length === 1
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ error: { message: "Envie a foto: Frente." } }), { status: 400 });
    } } } }
  }, async () => {
    await concluirChecklist("{C1000000-0000-4000-8000-000000000001}", "[]");
    await assert.rejects(concluirChecklist("c1000000-0000-4000-8000-000000000001", "[]"), (error: any) => {
      assert.equal(error.message, "Envie a foto: Frente.");
      assert.equal(error.code, 400);
      return true;
    });
  });
  assert.equal(calls[0].request.new_ChecklistId, "c1000000-0000-4000-8000-000000000001");
  assert.equal(calls[0].metadata.operationName, "new_ConcluirChecklistVeiculo");
  assert.equal(calls[0].metadata.parameterTypes.new_RespostasJson.typeName, "Edm.String");
  assert.ok(calls[0].bound, "execute precisa manter o this do Xrm");
});

test("mock local: conclui o pendente e mantém o histórico", async () => {
  await withWindow({ location: { hostname: "localhost" }, setTimeout: (fn: () => void) => setTimeout(fn, 0) }, async () => {
    const [pending] = (await loadDriverChecklists("")).filter(isChecklistPending);
    assert.ok(pending);
    const draft = createChecklistDraft(pending);
    const uploaded = Object.fromEntries(pending.itens.filter((item) => item.tipo === "foto").map((item) => [item.chave, [{ link: "https://x/1", caminho: "c", nomeArquivo: "f.jpg" }]]));
    await concluirChecklist(pending.id, buildChecklistRespostasJson(pending.itens, draft, uploaded));
    const after = await loadDriverChecklist(pending.id);
    assert.equal(after?.estado, CHECKLIST_ESTADO.concluido);
    assert.equal(after?.respostas.find((row) => row.tipo === "numero" && row.rotulo === "Quilometragem")?.valor, "45210");
  });
});

const okNokItem = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  chave: "pneus", ordem: 1, rotulo: "Pneus", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "",
  opcoesProblema: ["Murcho", "Careca"], ...overrides
});
const draftWith = (parts: Partial<ChecklistDraft>): ChecklistDraft => ({ checklistId: "c", valores: {}, fotos: {}, updatedAt: "", ...parts });

test("parse do item okNok usa a lista do item ou a padrão", () => {
  const [comLista, semLista] = parseChecklistItems(JSON.stringify([
    { chave: "a", ordem: 1, rotulo: "Pneus", tipo: "okNok", opcoesProblema: ["Murcho"] },
    { chave: "b", ordem: 2, rotulo: "Limpeza", tipo: "okNok" }
  ]));
  assert.deepEqual(comLista.opcoesProblema, ["Murcho"]);
  assert.deepEqual(semLista.opcoesProblema, [...CHECKLIST_PROBLEMAS_PADRAO]);
});

test("parse mantém opcoesProblema vazia nos tipos antigos", () => {
  const [item] = parseChecklistItems(JSON.stringify([{ chave: "a", ordem: 1, rotulo: "Frente", tipo: "foto", opcoesProblema: ["X"] }]));
  assert.deepEqual(item.opcoesProblema, []);
});

test("validação do okNok: escolha, foto e problema", () => {
  const item = okNokItem();
  assert.equal(validateChecklistDraft([item], draftWith({}))[item.chave], "Escolha OK ou Não OK.");
  assert.equal(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" } }))[item.chave], "Tire a foto do problema.");
  assert.equal(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] } }))[item.chave], "Escolha o problema.");
  assert.deepEqual(validateChecklistDraft([item], draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] } })), {});
  assert.deepEqual(validateChecklistDraft([item], draftWith({ valores: { pneus: "ok" } })), {});
});

test("validação do okNok recusa mais de 10 problemas", () => {
  const opcoes = Array.from({ length: 12 }, (_, index) => `Problema ${index + 1}`);
  const item = okNokItem({ opcoesProblema: opcoes });
  const base = { valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] } };
  assert.equal(CHECKLIST_MAX_PROBLEMAS, 10);
  assert.equal(validateChecklistDraft([item], draftWith({ ...base, problemas: { pneus: opcoes.slice(0, 11) } }))[item.chave], "Escolha até 10 problemas.");
  assert.deepEqual(validateChecklistDraft([item], draftWith({ ...base, problemas: { pneus: opcoes.slice(0, 10) } })), {});
});

test("voltar para OK limpa problemas, observação e fotos do item", () => {
  const draft = draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] }, observacoes: { pneus: "x" } });
  const next = setChecklistOkNok(draft, "pneus", "ok");
  assert.equal(next.valores.pneus, "ok");
  assert.deepEqual(next.fotos.pneus ?? [], []);
  assert.deepEqual(next.problemas?.pneus ?? [], []);
  assert.equal(next.observacoes?.pneus ?? "", "");
});

test("payload e fila de fotos do okNok", () => {
  const item = okNokItem();
  const draft = draftWith({ valores: { pneus: "nok" }, fotos: { pneus: [{ id: "f", dataUrl: "d" }] }, problemas: { pneus: ["Murcho"] }, observacoes: { pneus: " dianteiro " } });
  assert.deepEqual(checklistPhotoItems([item], draft).map((entry) => entry.chave), ["pneus"]);
  assert.deepEqual(checklistPhotoItems([item], { ...draft, valores: { pneus: "ok" } }), []);
  const [resposta] = JSON.parse(buildChecklistRespostasJson([item], draft, { pneus: [{ link: "https://x/p", caminho: "c", nomeArquivo: "p.jpg" }] }));
  assert.deepEqual(resposta, { chave: "pneus", valor: "nok", problemas: ["Murcho"], observacao: "dianteiro", fotos: [{ link: "https://x/p", caminho: "c", nomeArquivo: "p.jpg" }] });
});

test("payload do okNok não repete problemas e o ok vai sem extras", () => {
  const item = okNokItem();
  const nok = draftWith({ valores: { pneus: "nok" }, problemas: { pneus: ["Murcho", "Murcho", "Careca"] } });
  assert.deepEqual(JSON.parse(buildChecklistRespostasJson([item], nok, {}))[0].problemas, ["Murcho", "Careca"]);
  assert.deepEqual(JSON.parse(buildChecklistRespostasJson([item], draftWith({ valores: { pneus: "ok" } }), {}))[0], { chave: "pneus", valor: "ok" });
});

test("progresso conta okNok respondido", () => {
  assert.deepEqual(countChecklistProgress([okNokItem()], draftWith({ valores: { pneus: "ok" } })), { done: 1, total: 1 });
});

test("marcar o 11º problema é recusado com aviso e desmarcar continua livre", () => {
  const opcoes = Array.from({ length: 12 }, (_, index) => `Problema ${index + 1}`);
  const cheio = draftWith({ valores: { pneus: "nok" }, problemas: { pneus: opcoes.slice(0, 10) } });
  const recusado = toggleChecklistProblema(cheio, "pneus", opcoes[10]);
  assert.equal(recusado.erro, "Escolha até 10 problemas.");
  assert.deepEqual(recusado.draft.problemas?.pneus, opcoes.slice(0, 10));
  const livre = toggleChecklistProblema(cheio, "pneus", opcoes[0]);
  assert.equal(livre.erro, undefined);
  assert.deepEqual(livre.draft.problemas?.pneus, opcoes.slice(1, 10));
  const nono = toggleChecklistProblema(draftWith({ problemas: { pneus: opcoes.slice(0, 9) } }), "pneus", opcoes[9]);
  assert.equal(nono.erro, undefined);
  assert.equal(nono.draft.problemas?.pneus?.length, 10);
});

test("progresso só conta Não OK com foto e problema", () => {
  const item = okNokItem();
  const foto = { id: "f", dataUrl: "d" };
  const done = (parts: Partial<ChecklistDraft>) => countChecklistProgress([item], draftWith(parts)).done;
  assert.equal(done({}), 0);
  assert.equal(done({ valores: { pneus: "ok" } }), 1);
  assert.equal(done({ valores: { pneus: "nok" } }), 0);
  assert.equal(done({ valores: { pneus: "nok" }, problemas: { pneus: ["Murcho"] } }), 0);
  assert.equal(done({ valores: { pneus: "nok" }, fotos: { pneus: [foto] } }), 0);
  assert.equal(done({ valores: { pneus: "nok" }, fotos: { pneus: [foto] }, problemas: { pneus: ["Murcho"] } }), 1);
});

test("mapChecklist lê entregue por e horário da troca", () => {
  const item = mapChecklist({
    new_checklistveiculoid: "c1", new_origem: 100000002, new_estado: 100000001,
    "_new_veiculo_value@OData.Community.Display.V1.FormattedValue": "ABC1D23",
    _new_entreguepor_value: "f9", "_new_entreguepor_value@OData.Community.Display.V1.FormattedValue": "Carlos Andrade",
    new_trocadetectadaem: "2026-10-20T15:00:00Z"
  });
  assert.equal(item.origem, CHECKLIST_ORIGEM.troca);
  assert.equal(item.entreguePorNome, "Carlos Andrade");
  assert.equal(item.trocaDetectadaEm, "2026-10-20T15:00:00Z");
  const antigo = mapChecklist({ new_checklistveiculoid: "c2", new_origem: 100000000, new_estado: 100000001 });
  assert.equal(antigo.entreguePorNome, "");
  assert.equal(antigo.trocaDetectadaEm, null);
});

test("texto do card por origem", () => {
  const base = mapChecklist({ new_checklistveiculoid: "c", new_estado: 100000001, "_new_veiculo_value@OData.Community.Display.V1.FormattedValue": "ABC1D23" });
  assert.deepEqual(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "Carlos Andrade" }),
    { label: "RECEBIMENTO DO CARRO", descricao: "Veículo ABC1D23 · entregue por Carlos Andrade" });
  assert.deepEqual(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.troca, entreguePorNome: "" }),
    { label: "RECEBIMENTO DO CARRO", descricao: "Veículo ABC1D23 · entregue por: não identificado" });
  assert.equal(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.manual }).label, "SOLICITADO PELA OPERAÇÃO");
  assert.equal(checklistCardTexto({ ...base, origem: CHECKLIST_ORIGEM.quinzenal }).label, "VISTORIA QUINZENAL");
  assert.equal(checklistCardTexto({ ...base, estado: CHECKLIST_ESTADO.concluido, origem: CHECKLIST_ORIGEM.troca }).label, "CHECKLIST ENVIADO");
});
