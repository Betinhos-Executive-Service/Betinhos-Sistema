import assert from "node:assert/strict";
import test from "node:test";
import type { DetailData } from "../src/types.ts";
import { getScreenAfterQrPayment } from "../src/app/detailFlow.ts";
import {
  formatQrChargeDateTime,
  getFirstInvalidQrChargeStep,
  getQrChargeDraftPayer,
  getQrChargeReceiveState,
  getQrChargeStepProgress,
  parseQrChargeSummary,
  validateQrChargeStep,
  type QrChargeDraft,
  type QrChargeSummary
} from "../src/features/recebimento/qrCharge.ts";
import { createMockQrCharge, getMockQrChargeSummary, resetMockQrCharges, updateMockQrCharge } from "../src/features/recebimento/qrChargeMock.ts";

const open = {
  sessionId: "cs_test_aberta",
  url: "https://checkout.stripe.com/c/pay/cs_test_aberta",
  status: "aguardando",
  valorCentavos: 28000,
  expiraEm: "2026-10-21T15:32:00Z",
  recusa: "",
  paganteNome: "John Smith",
  paganteEmail: "john@mail.com",
  idioma: "en-US"
};

const summary = (overrides: Partial<QrChargeSummary> = {}): QrChargeSummary => ({
  recebivelCentavos: 38000,
  pagoCentavos: 0,
  saldoCentavos: 38000,
  ultimaPaga: null,
  aberta: null,
  ...overrides
});

const service = (cliente = "Empresa X"): DetailData =>
  ({ type: "SERVICO", id: "OS-1939", title: "Serviço", fields: [{ label: "Cliente", value: cliente }], actions: ["receber"] }) as unknown as DetailData;

test("resumo do plugin vira pago, saldo, última paga e cobrança aberta para retomar", () => {
  const parsed = parseQrChargeSummary({
    recebivelCentavos: 38000,
    pagoCentavos: 10000,
    saldoCentavos: 28000,
    ultimaPaga: { sessionId: "cs_test_pago", url: "", status: "pago", valorCentavos: 10000, expiraEm: "", recusa: "", pagoEm: "2026-10-21T14:40:20Z", paganteNome: "Ana" },
    aberta: open
  });
  assert.equal(parsed.pagoCentavos, 10000);
  assert.equal(parsed.ultimaPaga?.sessionId, "cs_test_pago");
  assert.equal(parsed.ultimaPaga?.paganteNome, "Ana");
  assert.equal(parsed.aberta?.charge.sessionId, "cs_test_aberta");
  assert.deepEqual(parsed.aberta?.pagante, { nome: "John Smith", email: "john@mail.com" });
  assert.equal(parsed.aberta?.idioma, "en-US");
});

test("resumo sem cobrança, com erro de negócio ou malformado", () => {
  const empty = { recebivelCentavos: 38000, pagoCentavos: 0, saldoCentavos: 38000, ultimaPaga: null, aberta: null };
  const parsed = parseQrChargeSummary(empty);
  assert.equal(parsed.ultimaPaga, null);
  assert.equal(parsed.aberta, null);
  assert.throws(() => parseQrChargeSummary({ erro: "Este serviço não está com você." }), /não está com você/);
  assert.throws(() => parseQrChargeSummary({ recebivelCentavos: 1, pagoCentavos: -1, saldoCentavos: 0 }), /valor pago/);
  // Link fora do Stripe na cobrança aberta não vira QR.
  assert.throws(() => parseQrChargeSummary({ ...empty, aberta: { ...open, url: "https://evil.example" } }), /Link de pagamento inválido/);
  // Idioma desconhecido cai no português.
  assert.equal(parseQrChargeSummary({ ...empty, aberta: { ...open, idioma: "fr-FR" } }).aberta?.idioma, "pt-BR");
});

test("reidratação: pago no total dispensa a foto mesmo depois de recarregar (só o resumo)", () => {
  const state = getQrChargeReceiveState(38000, summary({ pagoCentavos: 38000, saldoCentavos: 0 }));
  assert.equal(state.covers, true);
  assert.equal(state.balanceCents, 0);
  assert.equal(state.open, null);
});

test("reidratação: pago parcial pede o restante e limita o QR novo ao saldo", () => {
  const state = getQrChargeReceiveState(38000, summary({ pagoCentavos: 10000, saldoCentavos: 28000 }));
  assert.equal(state.covers, false);
  assert.equal(state.paidCents, 10000);
  assert.equal(state.balanceCents, 28000);
});

test("reidratação: cobrança aberta vira retomar; pagamento da sessão vale antes do resumo revalidar", () => {
  const withOpen = summary({ aberta: parseQrChargeSummary({ ...summary(), aberta: open }).aberta });
  assert.equal(getQrChargeReceiveState(38000, withOpen).open?.charge.sessionId, "cs_test_aberta");
  // Pago agora no app (local) e resumo ainda antigo: conta o pago local e some o "retomar".
  const paidLocally = getQrChargeReceiveState(38000, withOpen, 38000);
  assert.equal(paidLocally.covers, true);
  assert.equal(paidLocally.open, null);
  // Sem resumo (falhou): segue com o valor do serviço e o que foi pago na sessão.
  assert.deepEqual(getQrChargeReceiveState(38000, undefined, 0), { receivableCents: 38000, paidCents: 0, balanceCents: 38000, covers: false, open: null });
  // Processamento no banco compromete o saldo mesmo sem pago.
  assert.equal(getQrChargeReceiveState(50000, summary({ recebivelCentavos: 50000, saldoCentavos: 20000 })).balanceCents, 20000);
  // Serviço sem valor a receber nunca conta como pago.
  assert.equal(getQrChargeReceiveState(0, undefined, 0).covers, false);
});

test("rota depois do QR pago: total segue para voucher/finalizar, parcial volta ao Recebimento", () => {
  assert.equal(getScreenAfterQrPayment(service(), true), "finalizar");
  assert.equal(getScreenAfterQrPayment(service("Tennaris Brasil"), true), "voucher");
  assert.equal(getScreenAfterQrPayment(service(), false), "receber");
});

test("horário da confirmação em dd/mm/aaaa HH:mm no fuso de São Paulo", () => {
  assert.equal(formatQrChargeDateTime(new Date("2026-10-21T15:32:00Z")), "21/10/2026 12:32");
  assert.equal(formatQrChargeDateTime(new Date("2026-01-02T02:05:00Z")), "01/01/2026 23:05");
});

const draft = (overrides: Partial<QrChargeDraft> = {}): QrChargeDraft => ({
  amountText: "380,00",
  payerChoice: "Ana Souza",
  otherPayerName: "",
  email: "",
  idioma: "pt-BR",
  ...overrides
});

test("passos do formulário: valor, pagante, e-mail opcional, idioma e revisão", () => {
  assert.equal(validateQrChargeStep("valor", draft(), 38000), "");
  assert.equal(validateQrChargeStep("valor", draft({ amountText: "380,01" }), 38000), "O valor não pode passar de R$ 380,00.");
  assert.equal(validateQrChargeStep("valor", draft({ amountText: "0,49" }), 38000), "O valor mínimo é R$ 0,50.");
  assert.equal(validateQrChargeStep("pagante", draft({ payerChoice: "", otherPayerName: " " }), 38000), "Informe quem vai pagar.");
  assert.equal(validateQrChargeStep("pagante", draft({ payerChoice: "", otherPayerName: "John" }), 38000), "");
  assert.deepEqual(getQrChargeDraftPayer(draft({ payerChoice: "", otherPayerName: " John ", email: " j@x.com " })), { nome: "John", email: "j@x.com" });
  assert.equal(validateQrChargeStep("email", draft({ email: "" }), 38000), "");
  assert.equal(validateQrChargeStep("email", draft({ email: "john@mail" }), 38000), "Confira o e-mail.");
  assert.equal(validateQrChargeStep("idioma", draft(), 38000), "");
  assert.equal(validateQrChargeStep("revisao", draft({ email: "x" }), 38000), "Confira o e-mail.");
  assert.equal(getFirstInvalidQrChargeStep(draft({ payerChoice: "", email: "x" }), 38000), "pagante");
  assert.equal(getFirstInvalidQrChargeStep(draft(), 38000), null);
  assert.deepEqual(getQrChargeStepProgress("valor"), { number: 1, total: 5, label: "1 de 5" });
  assert.equal(getQrChargeStepProgress("revisao").label, "5 de 5");
});

test("mock: resumo reconhece o pago, o parcial e a cobrança aberta", () => {
  resetMockQrCharges();
  const start = Date.parse("2026-10-21T15:00:00Z");
  const pagante = { nome: "Ana", email: "ana@mail.com" };
  const first = createMockQrCharge({ reservaId: "r1", valorCentavos: 10000, pagante, idioma: "en-US" }, "", start);
  const pending = getMockQrChargeSummary("r1", 38000, start + 1000);
  assert.equal(pending.aberta?.charge.sessionId, first.sessionId);
  assert.equal(pending.aberta?.idioma, "en-US");
  assert.equal(pending.pagoCentavos, 0);

  const paid = getMockQrChargeSummary("r1", 38000, start + 6000);
  assert.equal(paid.pagoCentavos, 10000);
  assert.equal(paid.saldoCentavos, 28000);
  assert.equal(paid.aberta, null);
  assert.equal(paid.ultimaPaga?.paganteNome, "Ana");
  assert.equal(updateMockQrCharge(first.sessionId, "consultar", "", start + 7000).status, "pago");

  // ?mockPagaEm=60 segura o pagamento para testar o "Retomar cobrança"; um QR novo cancela o aberto anterior.
  const slow = createMockQrCharge({ reservaId: "r1", valorCentavos: 5000, pagante, idioma: "pt-BR" }, "?mockPagaEm=60", start + 8000);
  const newer = createMockQrCharge({ reservaId: "r1", valorCentavos: 5000, pagante, idioma: "pt-BR" }, "?mockPagaEm=60", start + 9000);
  assert.equal(updateMockQrCharge(slow.sessionId, "consultar", "", start + 10000).status, "cancelado");
  assert.equal(getMockQrChargeSummary("r1", 38000, start + 10000).aberta?.charge.sessionId, newer.sessionId);
  assert.equal(getMockQrChargeSummary("outra", 38000, start + 10000).pagoCentavos, 0);
});
