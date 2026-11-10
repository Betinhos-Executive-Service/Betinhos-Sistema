import assert from "node:assert/strict";
import test from "node:test";
import { buildHashRoute, getHashRouteFallbackScreen, getHashRouteRestoreScreen, parseHashRoute, screenNeedsHashDetail } from "../src/app/navigation.ts";
import type { Screen } from "../src/types.ts";

// Caracterização das rotas hash (deep link do push e restauração em localhost):
// a refatoração por funcionalidade não pode mudar nenhum caminho nem fallback.
const SCREENS: Screen[] = [
  "inicio", "servicos", "comunicados", "checklists", "historico", "detalhes", "detalhesHistorico", "receber",
  "cobrancaQr", "reciboPersonalizado", "voucher", "assinatura", "finalizar", "gastos", "fotoReceber",
  "previewFotoReceber", "fotoGasto", "previewFotoGasto", "colisoesInicio", "colisoes", "fotoColisao",
  "previewFotoColisao", "solicitarManutencao", "fotoSolicitacaoManutencao", "previewFotoSolicitacaoManutencao",
  "canceladoLocal", "fotoManutencao", "previewFotoManutencao", "boasIdeias", "meuCarro", "multas"
];
const DETAIL = { id: "11111111-2222-3333-4444-555555555555", type: "SERVICO" };

test("cada tela gera o mesmo hash e volta para a mesma rota", () => {
  const table = SCREENS.map((screen) => {
    const hash = buildHashRoute(screen, DETAIL);
    return [screen, hash, parseHashRoute(hash), screenNeedsHashDetail(screen), getHashRouteRestoreScreen(screen), getHashRouteFallbackScreen(screen)];
  });
  assert.deepEqual(JSON.parse(JSON.stringify(table)), EXPECTED);
});

test("aliases e parametros legados continuam aceitos", () => {
  assert.deepEqual(parseHashRoute("#/home"), { screen: "inicio", detailId: undefined, detailType: undefined });
  assert.deepEqual(parseHashRoute("#detalhe?detailId=abc&type=troca"), { screen: "detalhes", detailId: "abc", detailType: "TROCA" });
  assert.equal(parseHashRoute("#preview"), null);
  assert.equal(parseHashRoute(""), null);
  assert.equal(parseHashRoute("#nao-existe"), null);
});

const EXPECTED: unknown[] = [
  ["inicio","#inicio",{screen: "inicio"},false,"inicio","inicio"],
  ["servicos","#servicos",{screen: "servicos"},false,"servicos","inicio"],
  ["comunicados","#comunicados",{screen: "comunicados"},false,"comunicados","inicio"],
  ["checklists","#checklists",{screen: "checklists"},false,"checklists","inicio"],
  ["historico","#historico",{screen: "historico"},false,"historico","inicio"],
  ["detalhes","#detalhes?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "detalhes",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"detalhes","servicos"],
  ["detalhesHistorico","#detalhes-historico?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "detalhesHistorico",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"detalhesHistorico","historico"],
  ["receber","#receber?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "receber",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"receber","detalhes"],
  ["cobrancaQr","#cobranca-qr?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "cobrancaQr",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"receber","inicio"],
  ["reciboPersonalizado","#recibo-personalizado?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "reciboPersonalizado",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},false,"reciboPersonalizado","inicio"],
  ["voucher","#voucher?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "voucher",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"voucher","detalhes"],
  ["assinatura","#assinatura?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "assinatura",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"assinatura","voucher"],
  ["finalizar","#finalizar?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "finalizar",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"finalizar","detalhes"],
  ["gastos","#gastos",{screen: "gastos"},false,"gastos","inicio"],
  ["fotoReceber","#foto-receber?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "fotoReceber",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"fotoReceber","receber"],
  ["previewFotoReceber","#preview-foto-receber",{screen: "previewFotoReceber"},false,"receber","inicio"],
  ["fotoGasto","#foto-gasto",{screen: "fotoGasto"},false,"fotoGasto","inicio"],
  ["previewFotoGasto","#preview-foto-gasto",{screen: "previewFotoGasto"},false,"gastos","inicio"],
  ["colisoesInicio","#colisoes",{screen: "colisoesInicio"},false,"colisoesInicio","inicio"],
  ["colisoes","#registro-colisao",{screen: "colisoes"},false,"colisoes","inicio"],
  ["fotoColisao","#foto-colisao",{screen: "fotoColisao"},false,"fotoColisao","inicio"],
  ["previewFotoColisao","#preview-foto-colisao",{screen: "previewFotoColisao"},false,"colisoes","inicio"],
  ["solicitarManutencao","#manutencao",{screen: "solicitarManutencao"},false,"solicitarManutencao","inicio"],
  ["fotoSolicitacaoManutencao","#foto-solicitacao-manutencao",{screen: "fotoSolicitacaoManutencao"},false,"fotoSolicitacaoManutencao","inicio"],
  ["previewFotoSolicitacaoManutencao","#preview-foto-solicitacao-manutencao",{screen: "previewFotoSolicitacaoManutencao"},false,"solicitarManutencao","inicio"],
  ["canceladoLocal","#cancelado-local?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "canceladoLocal",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"canceladoLocal","detalhes"],
  ["fotoManutencao","#foto-manutencao?serviceId=11111111-2222-3333-4444-555555555555&type=SERVICO",{screen: "fotoManutencao",detailId: "11111111-2222-3333-4444-555555555555",detailType: "SERVICO"},true,"fotoManutencao","finalizar"],
  ["previewFotoManutencao","#preview-foto-manutencao",{screen: "previewFotoManutencao"},false,"finalizar","inicio"],
  ["boasIdeias","#boas-ideias",{screen: "boasIdeias"},false,"boasIdeias","inicio"],
  ["meuCarro","#meu-carro",{screen: "meuCarro"},false,"meuCarro","inicio"],
  ["multas","#multas",{screen: "multas"},false,"multas","inicio"]
];
