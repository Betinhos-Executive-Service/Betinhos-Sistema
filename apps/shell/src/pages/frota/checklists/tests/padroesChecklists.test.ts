import assert from "node:assert/strict";
import { test } from "vitest";
import { CHECKLIST_ESTADO, CHECKLIST_ORIGEM, type ChecklistResposta } from "../domain/checklists";
import { PADROES_DIAS_CARREGADOS, type ChecklistGestao } from "../domain/gestaoChecklists";
import {
  calcularPadroes,
  itensNaoOk,
  PERIODO_PADROES_INICIAL,
  PERIODOS_PADROES,
  type PadraoEntregador,
  type PadraoVeiculo
} from "../domain/padroesChecklists";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const DAY = 86_400_000;

type Opcoes = { veiculo?: string; origem?: number; entregue?: string; nok?: Record<string, string[]>; itens?: string[] };

// Checklist enviado há `dias` dias com itens OK / Não OK (Pneus e Lataria por padrão); `nok` marca item → problemas.
function vistoria(id: string, dias: number, opcoes: Opcoes = {}): ChecklistGestao {
  const veiculo = opcoes.veiculo ?? "v1";
  const nok = opcoes.nok ?? {};
  const quando = new Date(NOW - dias * DAY).toISOString();
  const entregue = opcoes.entregue ?? "";
  const respostas = (opcoes.itens ?? ["Pneus", "Lataria"]).map((rotulo): ChecklistResposta => ({
    chave: `k-${rotulo}`, rotulo, tipo: "okNok", valor: nok[rotulo] ? "nok" : "ok", problemas: nok[rotulo] ?? [], observacao: "",
    fotos: nok[rotulo] ? [{ link: `https://example.com/${id}.jpg`, caminho: "Checklists/teste", nomeArquivo: `${id}.jpg` }] : []
  }));
  return {
    id, nome: "", motoristaId: "f1", veiculoId: veiculo, placa: veiculo.toUpperCase(), estado: CHECKLIST_ESTADO.concluido,
    origem: opcoes.origem ?? CHECKLIST_ORIGEM.quinzenal, solicitadoEm: quando, concluidoEm: quando, odometro: null, itens: [], respostas,
    motoristaNome: "Recebedor", modeloNome: "Vistoria quinzenal", erroAtribuicao: "", pushStatus: null, pushErro: "", atribuidoEm: null,
    canceladoEm: null, motivoCancelamento: "", temProblema: Object.keys(nok).length > 0, qtdProblemas: Object.keys(nok).length,
    entreguePorId: entregue ? `id-${entregue}` : "", entreguePorNome: entregue, trocaDetectadaEm: quando
  };
}

const troca = (id: string, dias: number, entregue: string, nok: Record<string, string[]> = {}, veiculo = `car-${id}`) =>
  vistoria(id, dias, { origem: CHECKLIST_ORIGEM.troca, entregue, nok, veiculo });
const principais = (linha: PadraoEntregador) => linha.principais.map((par) => `${par.item}: ${par.problema} (${par.quantidade})`);
const veiculoTexto = (linha: PadraoVeiculo) => `${linha.placa} ${linha.item} — ${linha.problemas.join(", ")} (${linha.ocorrencias} de ${linha.janela})`;
const sujo = { Lataria: ["Sujo"] };

test("períodos 30, 90 e 180 dias, 90 por padrão, e o carregamento cobre o maior", () => {
  assert.deepEqual([...PERIODOS_PADROES], [30, 90, 180]);
  assert.equal(PERIODO_PADROES_INICIAL, 90);
  assert.equal(Math.max(...PERIODOS_PADROES), PADROES_DIAS_CARREGADOS);
});

test("por quem entregou: só troca, mínimo de 3 trocas e ordem pelo % com problema", () => {
  const lista = [
    troca("a1", 10, "Ana", sujo), troca("a2", 20, "Ana"), troca("a3", 30, "Ana"),
    troca("b1", 10, "Bruno", { Pneus: ["Murcho"] }), troca("b2", 20, "Bruno", { Pneus: ["Murcho"] }),
    // Quinzenal não conta para quem entregou, mesmo com o campo preenchido.
    vistoria("q1", 12, { entregue: "Bruno", nok: { Pneus: ["Murcho"] } }),
    troca("c1", 5, "Caio", { Pneus: ["Murcho"] }), troca("c2", 15, "Caio", { Pneus: ["Murcho", "Careca"] }),
    troca("c3", 25, "Caio", sujo), troca("c4", 35, "Caio")
  ];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.equal(padroes.total, 10);
  assert.equal(padroes.trocas, 9);
  assert.deepEqual(padroes.porEntregador.map((linha) => linha.nome), ["Caio", "Ana"]);
  const [caio, ana] = padroes.porEntregador;
  assert.deepEqual([caio.trocas, caio.comProblema, caio.percentual], [4, 3, 75]);
  assert.deepEqual(principais(caio), ["Pneus: Murcho (2)", "Lataria: Sujo (1)"]);
  assert.deepEqual(caio.checklistIds, ["c1", "c2", "c3", "c4"]);
  assert.deepEqual([ana.trocas, ana.comProblema, ana.percentual], [3, 1, 33]);
  assert.deepEqual(padroes.destaques, []);
});

test("entregador vazio vira Não identificado, em linha separada e fora dos destaques", () => {
  const lista = [troca("n1", 5, "", sujo), troca("n2", 6, "", sujo), troca("n3", 7, "", sujo)];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.deepEqual(padroes.porEntregador, []);
  assert.equal(padroes.naoIdentificado?.nome, "Não identificado");
  assert.deepEqual([padroes.naoIdentificado?.trocas, padroes.naoIdentificado?.comProblema, padroes.naoIdentificado?.percentual], [3, 3, 100]);
  assert.deepEqual(padroes.destaques, []);
  assert.equal(calcularPadroes([troca("x", 5, "Ana")], 90, NOW).naoIdentificado, null);
});

test("recorrência por veículo: mesmo item Não OK em 2 dos últimos 3 checklists", () => {
  const lista = [
    vistoria("v1-1", 1, { veiculo: "v1", nok: { Pneus: ["Murcho"] } }), vistoria("v1-10", 10, { veiculo: "v1" }), vistoria("v1-20", 20, { veiculo: "v1", nok: { Pneus: ["Murcho"] } }),
    vistoria("v2-1", 1, { veiculo: "v2", nok: { Pneus: ["Murcho"] } }), vistoria("v2-10", 10, { veiculo: "v2" }), vistoria("v2-20", 20, { veiculo: "v2" }), vistoria("v2-30", 30, { veiculo: "v2", nok: { Pneus: ["Murcho"] } }),
    vistoria("v3-1", 1, { veiculo: "v3", nok: { Pneus: ["Murcho"] } }), vistoria("v3-5", 5, { veiculo: "v3", nok: { Pneus: ["Careca"] } }), vistoria("v3-9", 9, { veiculo: "v3", nok: { Pneus: ["Murcho"] } }),
    vistoria("v4-2", 2, { veiculo: "v4", nok: { Lataria: ["Amassado"] } }), vistoria("v4-4", 4, { veiculo: "v4", nok: { Lataria: ["Amassado"] } }),
    vistoria("v5-1", 1, { veiculo: "v5", nok: { Pneus: ["Furado"] } })
  ];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.deepEqual(padroes.porVeiculo.map(veiculoTexto), ["V3 Pneus — Murcho, Careca (3 de 3)", "V1 Pneus — Murcho (2 de 3)", "V4 Lataria — Amassado (2 de 2)"]);
  assert.deepEqual(padroes.porVeiculo[1].checklistIds, ["v1-1", "v1-20"]);
});

test("período: só checklists enviados dentro da janela entram nas contagens e na recorrência", () => {
  const lista = [10, 60, 150, 200].map((dias) => vistoria(`d${dias}`, dias, { nok: { Pneus: ["Murcho"] } }));
  const pendente = { ...vistoria("pendente", 5, { nok: { Pneus: ["Murcho"] } }), estado: CHECKLIST_ESTADO.pendente, concluidoEm: null };
  const total = (dias: number) => calcularPadroes([...lista, pendente], dias, NOW);
  assert.deepEqual([total(30).total, total(90).total, total(180).total], [1, 2, 3]);
  assert.equal(total(90).desde, new Date(NOW - 90 * DAY).toISOString());
  assert.deepEqual(total(30).porVeiculo, []);
  assert.deepEqual(total(90).porVeiculo.map(veiculoTexto), ["V1 Pneus — Murcho (2 de 2)"]);
  assert.deepEqual(total(180).porVeiculo.map(veiculoTexto), ["V1 Pneus — Murcho (3 de 3)"]);
  assert.equal(total(180).problemasFrota[0].quantidade, 3);
});

test("checklist antigo, sem OK / Não OK, conta no total mas não vira problema nem ocupa a janela", () => {
  const antigo: ChecklistGestao = {
    ...vistoria("antigo", 5),
    respostas: [{ chave: "f1", rotulo: "Frente do veículo", tipo: "foto", valor: "", problemas: [], observacao: "", fotos: [{ link: "https://example.com/f.jpg", caminho: "", nomeArquivo: "f.jpg" }] }],
    temProblema: false,
    qtdProblemas: 0
  };
  const lista = [vistoria("n1", 1, { nok: { Pneus: ["Murcho"] } }), antigo, vistoria("ok9", 9), vistoria("n14", 14, { nok: { Pneus: ["Murcho"] } })];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.equal(padroes.total, 4);
  assert.deepEqual(itensNaoOk(antigo), []);
  assert.deepEqual(padroes.porVeiculo.map(veiculoTexto), ["V1 Pneus — Murcho (2 de 3)"]);
  assert.deepEqual(padroes.problemasFrota.map((par) => `${par.item}: ${par.problema} ${par.quantidade}`), ["Pneus: Murcho 2"]);
  // Resposta sem rótulo usa o rótulo do item copiado no checklist.
  const semRotulo: ChecklistGestao = {
    ...vistoria("sem-rotulo", 2),
    itens: [{ chave: "k9", ordem: 9, rotulo: "Pneus", instrucao: "", tipo: "okNok", obrigatorio: true, unidade: "", opcoesProblema: ["Murcho"] }],
    respostas: [{ chave: "k9", rotulo: "", tipo: "okNok", valor: "nok", problemas: ["Murcho"], observacao: "", fotos: [] }]
  };
  assert.equal(itensNaoOk(semRotulo)[0].item, "Pneus");
});

test("problemas mais comuns: top 10 pares item + problema, contados uma vez por checklist", () => {
  const lista: ChecklistGestao[] = [];
  for (let item = 1; item <= 12; item += 1) {
    const rotulo = `Item ${String(item).padStart(2, "0")}`;
    for (let vez = 0; vez < item; vez += 1) lista.push(vistoria(`i${item}-${vez}`, 3, { veiculo: `car-${item}-${vez}`, itens: [rotulo], nok: { [rotulo]: ["Sujo"] } }));
  }
  const frota = calcularPadroes(lista, 90, NOW).problemasFrota;
  assert.equal(frota.length, 10);
  assert.deepEqual([frota[0].item, frota[0].quantidade, frota[9].item, frota[9].quantidade], ["Item 12", 12, "Item 03", 3]);
  const repetido = vistoria("rep", 1, { nok: { Pneus: ["Murcho", "Murcho", " Murcho ", "Careca"] } });
  assert.deepEqual(calcularPadroes([repetido], 90, NOW).problemasFrota.map((par) => `${par.problema} ${par.quantidade}`), ["Careca 1", "Murcho 1"]);
});

test("destaques: pelo menos 3 ocorrências e 50% das trocas da pessoa", () => {
  const lista = [
    troca("c1", 1, "Caio", sujo), troca("c2", 2, "Caio", sujo), troca("c3", 3, "Caio", sujo), troca("c4", 4, "Caio"),
    ...[1, 2, 3].map((dias) => troca(`d${dias}`, dias, "Dani", sujo)), ...[4, 5, 6].map((dias) => troca(`d${dias}`, dias, "Dani")),
    ...[1, 2, 3].map((dias) => troca(`e${dias}`, dias, "Edu", sujo)), ...[4, 5, 6, 7].map((dias) => troca(`e${dias}`, dias, "Edu")),
    troca("f1", 1, "Fábio", sujo), troca("f2", 2, "Fábio", sujo), troca("f3", 3, "Fábio")
  ];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.deepEqual(padroes.destaques.map((destaque) => destaque.texto), [
    "Caio: 3 de 4 carros entregues com 'Lataria: Sujo' (90 dias)",
    "Dani: 3 de 6 carros entregues com 'Lataria: Sujo' (90 dias)"
  ]);
  assert.deepEqual(padroes.destaques[0].checklistIds, ["c1", "c2", "c3"]);
});

test("destaques: no máximo 3 frases e uma por pessoa", () => {
  const ambos = { Lataria: ["Sujo"], Pneus: ["Murcho"] };
  const lista = ["Gabi", "Hugo", "Iara", "João"].flatMap((nome) => [1, 2, 3].map((dias) => troca(`${nome}${dias}`, dias, nome, nome === "Gabi" ? ambos : sujo)));
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.equal(padroes.porEntregador.length, 4);
  assert.deepEqual(padroes.destaques.map((destaque) => destaque.nome), ["Gabi", "Hugo", "Iara"]);
  assert.equal(padroes.destaques[0].texto, "Gabi: 3 de 3 carros entregues com 'Lataria: Sujo' (90 dias)");
});

test("rótulos com maiúsculas diferentes em checklists diferentes contam como o mesmo item (frota e recorrência)", () => {
  const lista = [
    vistoria("p1", 5, { itens: ["Pneus"], nok: { Pneus: ["Murcho"] } }),
    vistoria("p2", 10, { itens: ["pneus"], nok: { pneus: ["murcho"] } })
  ];
  const padroes = calcularPadroes(lista, 90, NOW);
  assert.deepEqual(padroes.problemasFrota.map((par) => [par.item, par.problema, par.quantidade, par.checklistIds]), [["Pneus", "Murcho", 2, ["p1", "p2"]]]);
  assert.deepEqual(padroes.porVeiculo.map(veiculoTexto), ["V1 Pneus — Murcho (2 de 2)"]);
  assert.deepEqual(padroes.porVeiculo[0].checklistIds, ["p1", "p2"]);
});

test("itensNaoOk tira problemas repetidos sem diferenciar maiúsculas, mantendo a primeira grafia", () => {
  const [entry] = itensNaoOk(vistoria("d1", 1, { itens: ["Pneus"], nok: { Pneus: ["Murcho", " murcho ", "MURCHO", "Careca"] } }));
  assert.deepEqual(entry.problemas, ["Murcho", "Careca"]);
});
