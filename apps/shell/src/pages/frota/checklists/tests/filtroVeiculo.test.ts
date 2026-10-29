import assert from "node:assert/strict";
import { test } from "vitest";
import {
  casaCondicao,
  casaFiltro,
  compararPrioridade,
  descreverCondicao,
  erroCondicao,
  criarResolvedor,
  lerFiltro,
  previaFiltro,
  serializarFiltro,
  veiculoElegivel,
  VEICULO_STATUS,
  type Condicao,
  type ModeloFiltravel,
  type VeiculoFiltro
} from "../domain/filtroVeiculo";

// Espelho dos casos do contrato (mesmos do plugin C#).

const P = 100000000;
const veiculo = (id: string, campos: VeiculoFiltro["campos"] = {}, extra: Partial<VeiculoFiltro> = {}): VeiculoFiltro => ({
  id, placa: id, statecode: 0, status: VEICULO_STATUS.ativo, rotulos: {},
  campos: { cr40f_marca: null, cr40f_modelo: null, cr40f_cor: null, cr40f_placa: id, cr40f_anodemodelo: null, cr40f_anodefabricacao: null, cr40f_hodometro: null, cr40f_blindado: null, new_categoriadoveiculo: P, new_propriedade: null, ...campos },
  ...extra
});
const c = (campo: string, operador: string, valor: unknown): Condicao => ({ campo, operador, valor });
const casa = (campos: VeiculoFiltro["campos"], condicao: Condicao) => casaCondicao(veiculo("X", campos).campos, condicao);
const filtro = (...condicoes: Condicao[]) => JSON.stringify({ condicoes });
const modelo = (id: string, extra: Partial<ModeloFiltravel> = {}): ModeloFiltravel => ({ id, nome: id, ativo: true, padraoQuinzenal: false, prioridade: null, filtroJson: "", ...extra });

test("texto: igual, diferente e contém sem diferenciar maiúsculas nem acento, com trim", () => {
  const campos = { cr40f_marca: "  Citroën " };
  assert.equal(casa(campos, c("cr40f_marca", "igual", "citroen")), true);
  assert.equal(casa(campos, c("cr40f_marca", "igual", " CITROËN")), true);
  assert.equal(casa(campos, c("cr40f_marca", "diferente", "citroen")), false);
  assert.equal(casa(campos, c("cr40f_marca", "diferente", "Toyota")), true);
  assert.equal(casa(campos, c("cr40f_marca", "contem", "TRO")), true);
  assert.equal(casa(campos, c("cr40f_marca", "contem", "fiat")), false);
});

test("texto vazio: igual e contém falham, diferente passa", () => {
  for (const vazio of [null, "", "   "]) {
    const campos = { cr40f_cor: vazio };
    assert.equal(casa(campos, c("cr40f_cor", "igual", "Preto")), false);
    assert.equal(casa(campos, c("cr40f_cor", "contem", "Pre")), false);
    assert.equal(casa(campos, c("cr40f_cor", "diferente", "Preto")), true);
  }
});

test("inteiro: igual, diferente, maior e menor estritos, entre inclusivo", () => {
  const campos = { cr40f_anodemodelo: 2022 };
  assert.equal(casa(campos, c("cr40f_anodemodelo", "igual", 2022)), true);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "diferente", 2022)), false);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "diferente", 2021)), true);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "maior", 2022)), false, "maior é estrito");
  assert.equal(casa(campos, c("cr40f_anodemodelo", "maior", 2021)), true);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "menor", 2022)), false, "menor é estrito");
  assert.equal(casa(campos, c("cr40f_anodemodelo", "menor", 2023)), true);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "entre", [2022, 2024])), true, "limite inferior entra");
  assert.equal(casa(campos, c("cr40f_anodemodelo", "entre", [2020, 2022])), true, "limite superior entra");
  assert.equal(casa(campos, c("cr40f_anodemodelo", "entre", [2023, 2025])), false);
  assert.equal(casa(campos, c("cr40f_anodemodelo", "igual", 2022.5)), false, "valor fracionado em campo inteiro não casa (igual ao C#)");
  assert.equal(casa(campos, c("cr40f_anodemodelo", "entre", [2021.5, 2024])), false);
});

test("inteiro vazio: qualquer operador falha, inclusive diferente", () => {
  const campos = { cr40f_hodometro: null };
  for (const [operador, valor] of [["igual", 1], ["diferente", 1], ["maior", 0], ["menor", 999999], ["entre", [0, 999999]]] as const) {
    assert.equal(casa(campos, c("cr40f_hodometro", operador, valor)), false, operador);
  }
});

test("booleano: só igual; campo vazio conta como false", () => {
  assert.equal(casa({ cr40f_blindado: true }, c("cr40f_blindado", "igual", true)), true);
  assert.equal(casa({ cr40f_blindado: false }, c("cr40f_blindado", "igual", true)), false);
  assert.equal(casa({ cr40f_blindado: null }, c("cr40f_blindado", "igual", false)), true, "vazio = false");
  assert.equal(casa({ cr40f_blindado: null }, c("cr40f_blindado", "igual", true)), false);
  assert.equal(casa({ cr40f_blindado: true }, c("cr40f_blindado", "diferente", false)), false, "diferente não é permitido para booleano");
});

test("choice: em e fora com valores reais; vazio faz em falhar e fora passar", () => {
  assert.equal(casa({ new_categoriadoveiculo: 100000001 }, c("new_categoriadoveiculo", "em", [100000001, 100000002])), true);
  assert.equal(casa({ new_categoriadoveiculo: P }, c("new_categoriadoveiculo", "em", [100000001, 100000002])), false);
  assert.equal(casa({ new_categoriadoveiculo: P }, c("new_categoriadoveiculo", "fora", [100000001])), true);
  assert.equal(casa({ new_categoriadoveiculo: 100000001 }, c("new_categoriadoveiculo", "fora", [100000001])), false);
  assert.equal(casa({ new_propriedade: null }, c("new_propriedade", "em", [P])), false);
  assert.equal(casa({ new_propriedade: null }, c("new_propriedade", "fora", [P])), true);
});

test("operador não permitido para o tipo ou valor do tipo errado: a condição falha", () => {
  assert.equal(casa({ cr40f_marca: "Toyota" }, c("cr40f_marca", "maior", "A")), false);
  assert.equal(casa({ cr40f_marca: "Toyota" }, c("cr40f_marca", "igual", 1)), false);
  assert.equal(casa({ cr40f_anodemodelo: 2022 }, c("cr40f_anodemodelo", "igual", "2022")), false);
  assert.equal(casa({ cr40f_anodemodelo: 2022 }, c("cr40f_anodemodelo", "contem", 20)), false);
  assert.equal(casa({ cr40f_anodemodelo: 2022 }, c("cr40f_anodemodelo", "entre", [2020])), false);
  assert.equal(casa({ cr40f_anodemodelo: 2022 }, c("cr40f_anodemodelo", "entre", 2022)), false);
  assert.equal(casa({ cr40f_blindado: true }, c("cr40f_blindado", "igual", "true")), false);
  assert.equal(casa({ new_categoriadoveiculo: P }, c("new_categoriadoveiculo", "em", P)), false);
  assert.equal(casa({ new_categoriadoveiculo: P }, c("new_categoriadoveiculo", "em", ["100000000"])), false);
  assert.equal(casa({ new_categoriadoveiculo: P }, c("new_categoriadoveiculo", "igual", [P])), false);
});

test("todas as condições precisam bater; campo fora da allowlist ou JSON ilegível não casa com nada", () => {
  const campos = veiculo("A", { cr40f_marca: "Toyota", cr40f_blindado: true }).campos;
  assert.equal(casaFiltro(campos, lerFiltro(filtro(c("cr40f_marca", "contem", "toy"), c("cr40f_blindado", "igual", true)))), true);
  assert.equal(casaFiltro(campos, lerFiltro(filtro(c("cr40f_marca", "contem", "toy"), c("cr40f_blindado", "igual", false)))), false);
  const fora = lerFiltro(filtro(c("cr40f_marca", "contem", "toy"), c("cr40f_chassi", "igual", "X")));
  assert.deepEqual(fora.naoSuportados, ["cr40f_chassi"]);
  assert.equal(casaFiltro(campos, fora), false);
  assert.equal(casaCondicao(campos, c("cr40f_chassi", "igual", "X")), false);
  assert.equal(lerFiltro("{nao é json").invalido, true);
  assert.equal(lerFiltro("[1]").invalido, true, "raiz que não é objeto");
  assert.equal(lerFiltro('{"condicoes":"x"}').invalido, true, "condicoes que não é lista");
  for (const semFiltro of ["{}", '{"outra":[]}', '{"condicoes":null}', "null", "   ", ""]) {
    assert.deepEqual(lerFiltro(semFiltro), { condicoes: [], invalido: false, naoSuportados: [] }, `sem filtro: ${semFiltro}`);
  }
  assert.equal(casaFiltro(campos, lerFiltro("{nao é json")), false);
  assert.deepEqual(lerFiltro(null), { condicoes: [], invalido: false, naoSuportados: [] });
  assert.deepEqual(lerFiltro('{"condicoes":[]}').condicoes, [], "lista vazia = sem filtro");
  assert.equal(serializarFiltro([]), "", "sem condição grava nulo");
  assert.equal(serializarFiltro([c("cr40f_blindado", "igual", true)]), '{"condicoes":[{"campo":"cr40f_blindado","operador":"igual","valor":true}]}');
});

test("universo: statecode 0 e status diferente de Vendido (vazio entra)", () => {
  assert.equal(veiculoElegivel(veiculo("A")), true);
  assert.equal(veiculoElegivel(veiculo("B", {}, { status: VEICULO_STATUS.vendido })), false);
  assert.equal(veiculoElegivel(veiculo("C", {}, { status: null })), true);
  assert.equal(veiculoElegivel(veiculo("D", {}, { statecode: 1 })), false);
});

test("prioridade: menor vence, nulo vai para o fim, empate por nome ordinal sem caixa e depois id", () => {
  const ordem = [modelo("z", { nome: "beta", prioridade: null }), modelo("y", { nome: "Alfa", prioridade: 20 }), modelo("b", { nome: "alfa", prioridade: 20 }), modelo("a", { nome: "ALFA", prioridade: 20 }), modelo("x", { nome: "Zeta", prioridade: 10 })]
    .sort(compararPrioridade).map((entry) => entry.id);
  assert.deepEqual(ordem, ["x", "a", "b", "y", "z"]);
});

test("escolha: primeiro filtro que casa vence; sem filtro nunca é escolhido; inativo fica de fora", () => {
  const blindado = filtro(c("cr40f_blindado", "igual", true));
  const toyota = filtro(c("cr40f_marca", "contem", "toyota"));
  const padrao = modelo("padrao", { padraoQuinzenal: true, filtroJson: toyota });
  const modelos = [
    padrao,
    modelo("toyota", { prioridade: 20, filtroJson: toyota }),
    modelo("blindados", { prioridade: 10, filtroJson: blindado }),
    modelo("semFiltro", { prioridade: 1 }),
    modelo("inativo", { prioridade: 0, ativo: false, filtroJson: toyota })
  ];
  assert.equal(criarResolvedor(modelos)(veiculo("A", { cr40f_marca: "Toyota", cr40f_blindado: true }))?.id, "blindados");
  assert.equal(criarResolvedor(modelos)(veiculo("B", { cr40f_marca: "Toyota" }))?.id, "toyota");
  assert.equal(criarResolvedor(modelos)(veiculo("C", { cr40f_marca: "Honda" }))?.id, "padrao", "o padrão ignora o próprio filtro");
});

test("padrão só para Próprio + Ativo; terceiro, aluguel e status vazio sem filtro que case ficam sem modelo", () => {
  const modelos = [modelo("padrao", { padraoQuinzenal: true }), modelo("terceiros", { prioridade: 10, filtroJson: filtro(c("new_categoriadoveiculo", "em", [100000001])) })];
  assert.equal(criarResolvedor(modelos)(veiculo("A"))?.id, "padrao");
  assert.equal(criarResolvedor(modelos)(veiculo("T", { new_categoriadoveiculo: 100000001 }))?.id, "terceiros", "filtro alcança terceiro");
  assert.equal(criarResolvedor(modelos)(veiculo("L", { new_categoriadoveiculo: 100000002 })), null, "aluguel sem filtro: sem checklist");
  assert.equal(criarResolvedor(modelos)(veiculo("S", {}, { status: null })), null, "status vazio não é Ativo");
  assert.equal(criarResolvedor(modelos)(veiculo("V", {}, { status: VEICULO_STATUS.vendido })), null);
});

test("prévia: recebem, ficam com outro de prioridade maior, também se encaixa e Vendido fora", () => {
  const blindados = modelo("blindados", { nome: "Carros blindados", prioridade: 10, filtroJson: filtro(c("cr40f_blindado", "igual", true)) });
  const pretos = modelo("pretos", { nome: "Pretos", prioridade: 30, filtroJson: filtro(c("cr40f_cor", "igual", "preto")) });
  const padrao = modelo("padrao", { nome: "Vistoria", padraoQuinzenal: true });
  const veiculos = [
    veiculo("A", { cr40f_marca: "Toyota", cr40f_blindado: true }),
    veiculo("B", { cr40f_marca: "Toyota", cr40f_cor: "Preto" }),
    veiculo("C", { cr40f_marca: "Toyota" }),
    veiculo("D", { cr40f_marca: "Honda" }),
    veiculo("V", { cr40f_marca: "Toyota" }, { status: VEICULO_STATUS.vendido })
  ];
  const editado = modelo("", { nome: "Toyota", prioridade: 20, filtroJson: filtro(c("cr40f_marca", "contem", "toyota")) });
  const previa = previaFiltro(editado, [blindados, pretos, padrao], veiculos);
  assert.deepEqual(previa.recebem.map(({ veiculo: v, tambem }) => [v.id, tambem]), [["B", ["Pretos"]], ["C", []]]);
  assert.deepEqual(previa.ficamComOutro.map(({ veiculo: v, modelo: m }) => [v.id, m]), [["A", "Carros blindados"]]);
  // Subindo o editado para antes dos blindados, o A passa a receber este modelo.
  const subiu = previaFiltro({ ...editado, prioridade: 5 }, [blindados, pretos, padrao], veiculos);
  assert.deepEqual(subiu.recebem.map(({ veiculo: v, tambem }) => [v.id, tambem]), [["A", ["Carros blindados"]], ["B", ["Pretos"]], ["C", []]]);
  assert.equal(subiu.ficamComOutro.length, 0);
  // A versão gravada do próprio modelo não concorre com a editada.
  const gravado = { ...editado, id: "toyota", filtroJson: filtro(c("cr40f_marca", "igual", "nada")) };
  assert.equal(previaFiltro({ ...editado, id: "toyota" }, [gravado, blindados], veiculos).recebem.length, 2);
  // Sem condição: ninguém recebe. Padrão: próprios ativos que não caem em outro modelo.
  assert.equal(previaFiltro({ ...editado, filtroJson: "" }, [blindados], veiculos).recebem.length, 0);
  // Condição ainda sem valor não entra na conta (antes "Marca contém" vazio pegava a frota toda).
  const soVazia = previaFiltro({ ...editado, filtroJson: filtro(c("cr40f_marca", "contem", "")) }, [blindados, pretos, padrao], veiculos);
  assert.deepEqual([soVazia.recebem.length, soVazia.ficamComOutro.length, soVazia.incompletas], [0, 0, 1]);
  const comVazia = previaFiltro({ ...editado, filtroJson: filtro(c("cr40f_marca", "contem", "toyota"), c("cr40f_cor", "igual", "")) }, [blindados, pretos, padrao], veiculos);
  assert.deepEqual(comVazia.recebem.map(({ veiculo: v }) => v.id), ["B", "C"]);
  assert.equal(comVazia.incompletas, 1);
  assert.deepEqual(previaFiltro(padrao, [blindados, pretos, padrao], veiculos).recebem.map(({ veiculo: v }) => v.id), ["C", "D"]);
  // Marcado como padrão nesta edição: substitui o padrão gravado na prévia (antes de salvar).
  assert.deepEqual(previaFiltro({ ...padrao, id: "novo-padrao" }, [blindados, pretos, padrao], veiculos).recebem.map(({ veiculo: v }) => v.id), ["C", "D"]);
  // Inativo é avaliado como ativo (a tela avisa à parte).
  assert.equal(previaFiltro({ ...editado, ativo: false }, [blindados], veiculos).recebem.length, 2);
});

test("condição como frase e o que falta para salvar", () => {
  const opcoes = { new_categoriadoveiculo: [{ valor: P, rotulo: "Próprio" }, { valor: 100000001, rotulo: "Terceiro" }] };
  assert.equal(descreverCondicao(c("cr40f_marca", "contem", " Toyota "), opcoes), "Marca contém Toyota");
  assert.equal(descreverCondicao(c("cr40f_blindado", "igual", true)), "Blindado é Sim");
  assert.equal(descreverCondicao(c("cr40f_anodemodelo", "maior", 2022)), "Ano de modelo maior que 2022");
  assert.equal(descreverCondicao(c("cr40f_hodometro", "entre", [10000, 50000])), "Hodômetro (km) entre 10.000 e 50.000");
  assert.equal(descreverCondicao(c("new_categoriadoveiculo", "em", [P, 100000009]), opcoes), "Categoria é um destes: Próprio, Valor 100000009");
  assert.equal(descreverCondicao(c("cr40f_chassi", "igual", "X")), "Campo não suportado (cr40f_chassi)");
  assert.equal(erroCondicao(c("cr40f_marca", "contem", "  ")), "Escreva o valor.");
  assert.equal(erroCondicao(c("cr40f_anodemodelo", "maior", null)), "Informe um número inteiro.");
  assert.equal(erroCondicao(c("cr40f_anodemodelo", "entre", [2024, 2020])), "O primeiro número precisa ser menor ou igual ao segundo.");
  assert.equal(erroCondicao(c("new_propriedade", "em", [])), "Escolha pelo menos uma opção.");
  assert.equal(erroCondicao(c("cr40f_blindado", "igual", false)), "");
  assert.equal(erroCondicao(c("cr40f_chassi", "igual", "")), "", "campo não suportado só avisa");
});
