import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENDA_OFFLINE_KEY,
  avisoAgendaOffline,
  lerAgendaOffline,
  limparAgendaOffline,
  removerDaAgendaOffline,
  salvarAgendaOffline
} from "../src/features/servicos/agendaOffline.ts";
import type { AgendaItem } from "../src/types.ts";

const memoria = () => {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => { dados.set(chave, valor); },
    removeItem: (chave: string) => { dados.delete(chave); }
  };
};

const agora = new Date(2026, 10, 16, 9, 30);
const em = (dias: number, hora = 10) => new Date(2026, 10, 16 + dias, hora, 0).toISOString();

const servico = (id: string, saida: string): AgendaItem => ({
  id,
  tipo: "SERVICO",
  label: id,
  detail: { type: "SERVICO", id, title: id, fields: [], actions: [], dataverse: { entitySetName: "cr40f_reservadeveculos", id: `dv-${id}`, record: { cr40f_dataehorriodesada: saida } } }
});
const cabecalho = (id: string): AgendaItem => ({ id, tipo: "HEADER", tituloData: id });

const driver = { id: "m1", name: "Motorista" } as never;

test("agenda offline: guarda hoje e amanhã e descarta ontem, depois de amanhã e item sem data", () => {
  const armazem = memoria();
  salvarAgendaOffline({
    driver,
    agenda: [
      cabecalho("h-ontem"), servico("ontem", em(-1)),
      cabecalho("h-hoje"), servico("hoje", em(0)),
      cabecalho("h-amanha"), servico("amanha", em(1)),
      cabecalho("h-depois"), servico("depois", em(2)),
      { id: "sem-data", tipo: "SERVICO", label: "sem data" }
    ]
  }, agora, armazem);
  const lida = lerAgendaOffline(agora, armazem);
  assert.deepEqual(lida?.agenda.map((item) => item.id), ["h-hoje", "hoje", "h-amanha", "amanha"]);
  assert.equal(lida?.salvoEm, agora.toISOString());
  assert.deepEqual(Object.keys(lida?.inicios ?? {}).sort(), ["amanha", "hoje"]);
});

test("agenda offline: sem cache devolve null e dado corrompido não derruba o app", () => {
  const armazem = memoria();
  assert.equal(lerAgendaOffline(agora, armazem), null);
  armazem.setItem(AGENDA_OFFLINE_KEY, "{não é json");
  assert.equal(lerAgendaOffline(agora, armazem), null);
});

test("agenda offline: na leitura do dia seguinte o serviço de ontem sai e, sem itens, o cache é apagado", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("hoje", em(0))] }, agora, armazem);
  const doisDiasDepois = new Date(2026, 10, 18, 8, 0);
  assert.equal(lerAgendaOffline(doisDiasDepois, armazem), null);
  assert.equal(armazem.getItem(AGENDA_OFFLINE_KEY), null);
});

test("agenda offline: salvar de novo com rede substitui a agenda (atualiza online)", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("a", em(0))] }, agora, armazem);
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("b", em(0, 14))] }, new Date(2026, 10, 16, 10, 0), armazem);
  assert.deepEqual(lerAgendaOffline(agora, armazem)?.agenda.map((item) => item.id), ["h", "b"]);
});

test("agenda offline: removerDaAgendaOffline tira o serviço enviado e o cabeçalho que sobra", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h1"), servico("a", em(0)), cabecalho("h2"), servico("b", em(1))] }, agora, armazem);
  removerDaAgendaOffline("a", armazem, agora);
  assert.deepEqual(lerAgendaOffline(agora, armazem)?.agenda.map((item) => item.id), ["h2", "b"]);
});

test("agenda offline: limparAgendaOffline apaga tudo (reset de dados locais)", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("a", em(0))] }, agora, armazem);
  limparAgendaOffline(armazem);
  assert.equal(armazem.getItem(AGENDA_OFFLINE_KEY), null);
  assert.equal(lerAgendaOffline(agora, armazem), null);
});

test("agenda offline: aviso mostra a hora da última leitura em America/Sao_Paulo", () => {
  assert.equal(avisoAgendaOffline("2026-11-16T12:30:00.000Z"), "Agenda de 09:30 (sem conexão)");
});

test("agenda offline: cache de outro usuário não é mostrado e é apagado", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("hoje", em(0))] }, agora, armazem, "usuario-a");
  assert.ok(lerAgendaOffline(agora, armazem, "usuario-a"));
  assert.equal(lerAgendaOffline(agora, armazem, "usuario-b"), null);
  assert.equal(armazem.getItem(AGENDA_OFFLINE_KEY), null);
});

test("agenda offline: usuário ainda desconhecido (partida a frio sem rede) mantém o cache", () => {
  const armazem = memoria();
  salvarAgendaOffline({ driver, agenda: [cabecalho("h"), servico("hoje", em(0))] }, agora, armazem, "usuario-a");
  assert.ok(lerAgendaOffline(agora, armazem, ""));
});
