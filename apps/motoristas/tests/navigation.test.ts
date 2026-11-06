import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHashRoute,
  getHashRouteFallbackScreen,
  getHashRouteRestoreScreen,
  getScreenMotion,
  isHashRoutingEnabled,
  parseHashRoute,
  screenNeedsHashDetail,
  shouldAutoRefreshScreen
} from "../src/app/navigation.ts";
import type { Screen } from "../src/types.ts";

// Lista de telas lida do tipo Screen: se uma tela nova for criada sem rota/profundidade, o teste acusa.
const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const screenBlock = /export type Screen =([\s\S]*?);/.exec(typesSource)?.[1] ?? "";
const ALL_SCREENS = [...screenBlock.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1] as Screen);

test("lista de telas foi extraída do tipo Screen", () => {
  assert.ok(ALL_SCREENS.length >= 30);
  assert.ok(ALL_SCREENS.includes("inicio"));
});

test("toda tela gera hash que volta para a mesma tela (ida e volta)", () => {
  for (const screen of ALL_SCREENS) {
    const hash = buildHashRoute(screen);
    assert.match(hash, /^#[a-z-]+/, screen);
    assert.equal(parseHashRoute(hash)?.screen, screen, `rota de ${screen}: ${hash}`);
  }
});

test("buildHashRoute inclui serviceId e type só em telas que precisam de detalhe", () => {
  const detail = { id: "abc-123", type: "SERVICO" };
  assert.equal(buildHashRoute("detalhes", detail), "#detalhes?serviceId=abc-123&type=SERVICO");
  assert.equal(buildHashRoute("reciboPersonalizado", detail), "#recibo-personalizado?serviceId=abc-123&type=SERVICO");
  assert.equal(buildHashRoute("servicos", detail), "#servicos");
  assert.equal(buildHashRoute("detalhes", null), "#detalhes");
  assert.equal(buildHashRoute("detalhes"), "#detalhes");
});

test("hash com detalhe volta com id e tipo, inclusive com caracteres especiais no id", () => {
  const hash = buildHashRoute("receber", { id: "a b&c=d", type: "TROCA" });
  assert.deepEqual(parseHashRoute(hash), { screen: "receber", detailId: "a b&c=d", detailType: "TROCA" });
});

test("parseHashRoute aceita aliases, barra inicial, caixa mista e espaços", () => {
  assert.equal(parseHashRoute("#/Home")?.screen, "inicio");
  assert.equal(parseHashRoute("#services")?.screen, "servicos");
  assert.equal(parseHashRoute("#  HISTORY-DETAILS ")?.screen, "detalhesHistorico");
  assert.equal(parseHashRoute("#termos")?.screen, "multas");
  assert.equal(parseHashRoute("#personalreceipt")?.screen, "reciboPersonalizado");
});

test("parseHashRoute devolve null para hash vazio ou rota desconhecida", () => {
  assert.equal(parseHashRoute(""), null);
  assert.equal(parseHashRoute("#"), null);
  assert.equal(parseHashRoute("#/"), null);
  assert.equal(parseHashRoute("#naoexiste"), null);
});

test("parseHashRoute normaliza o tipo e ignora tipo inválido; detailId alternativo e vazio", () => {
  assert.equal(parseHashRoute("#detalhes?serviceId=1&type=troca")?.detailType, "TROCA");
  assert.equal(parseHashRoute("#detalhes?serviceId=1&type=manutencao")?.detailType, "MANUTENCAO");
  assert.equal(parseHashRoute("#detalhes?serviceId=1&type=HEADER")?.detailType, undefined);
  assert.equal(parseHashRoute("#detalhes?detailId=9")?.detailId, "9");
  assert.equal(parseHashRoute("#detalhes?serviceId=1&detailId=9")?.detailId, "1");
  assert.equal(parseHashRoute("#detalhes?serviceId=%20%20")?.detailId, undefined);
  assert.equal(parseHashRoute("#detalhes")?.detailId, undefined);
});

test("telas de detalhe exigem id no hash; telas de lista e preview não", () => {
  for (const screen of ["detalhes", "detalhesHistorico", "receber", "voucher", "finalizar", "assinatura", "canceladoLocal", "fotoReceber", "fotoManutencao", "cobrancaQr"] as Screen[]) {
    assert.equal(screenNeedsHashDetail(screen), true, screen);
  }
  for (const screen of ["inicio", "servicos", "gastos", "previewFotoReceber", "reciboPersonalizado"] as Screen[]) {
    assert.equal(screenNeedsHashDetail(screen), false, screen);
  }
});

test("restauração de tela: previews e QR voltam para a tela de origem, o resto fica igual", () => {
  assert.equal(getHashRouteRestoreScreen("previewFotoReceber"), "receber");
  assert.equal(getHashRouteRestoreScreen("cobrancaQr"), "receber");
  assert.equal(getHashRouteRestoreScreen("previewFotoGasto"), "gastos");
  assert.equal(getHashRouteRestoreScreen("previewFotoColisao"), "colisoes");
  assert.equal(getHashRouteRestoreScreen("previewFotoSolicitacaoManutencao"), "solicitarManutencao");
  assert.equal(getHashRouteRestoreScreen("previewFotoManutencao"), "finalizar");
  assert.equal(getHashRouteRestoreScreen("servicos"), "servicos");
});

test("fallback sem detalhe cai numa tela segura e nunca fica em loop", () => {
  assert.equal(getHashRouteFallbackScreen("detalhes"), "servicos");
  assert.equal(getHashRouteFallbackScreen("detalhesHistorico"), "historico");
  assert.equal(getHashRouteFallbackScreen("assinatura"), "voucher");
  assert.equal(getHashRouteFallbackScreen("gastos"), "inicio");
  for (const screen of ALL_SCREENS) {
    let current = screen;
    for (let i = 0; i < 10 && current !== "inicio"; i += 1) {
      const next = getHashRouteFallbackScreen(current);
      if (next === current) break;
      current = next;
    }
    assert.equal(screenNeedsHashDetail(current) && current !== "inicio", false, `fallback de ${screen} termina em tela que exige detalhe (${current})`);
  }
});

test("atualização automática só nas telas de agenda", () => {
  const refreshing = ALL_SCREENS.filter(shouldAutoRefreshScreen).sort();
  assert.deepEqual(refreshing, ["comunicados", "detalhes", "detalhesHistorico", "historico", "inicio", "servicos"]);
});

test("getScreenMotion classifica transições principais", () => {
  assert.equal(getScreenMotion("servicos", "inicio").kind, "module-open");
  assert.equal(getScreenMotion("inicio", "servicos").kind, "home");
  assert.equal(getScreenMotion("detalhes", "servicos").kind, "drill-in");
  assert.equal(getScreenMotion("servicos", "detalhes").kind, "drill-out");
});

test("getScreenMotion devolve configuração completa para qualquer par de telas", () => {
  for (const current of ALL_SCREENS) {
    for (const previous of ALL_SCREENS) {
      const motion = getScreenMotion(current, previous);
      assert.ok(motion.kind, `${previous} -> ${current}`);
      assert.ok(motion.initial && motion.exit && motion.transition, `${previous} -> ${current}`);
    }
  }
});

test("isHashRoutingEnabled só liga em localhost", () => {
  const g = globalThis as unknown as { window?: unknown };
  const original = g.window;
  try {
    for (const [hostname, expected] of [["localhost", true], ["127.0.0.1", true], ["::1", true], ["org.crm.dynamics.com", false], ["localhost.evil.com", false]] as const) {
      g.window = { location: { hostname } };
      assert.equal(isHashRoutingEnabled(), expected, hostname);
    }
  } finally {
    if (original === undefined) delete g.window;
    else g.window = original;
  }
});
