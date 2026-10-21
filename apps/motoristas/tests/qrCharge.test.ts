import assert from "node:assert/strict";
import test from "node:test";
import type { DetailData } from "../src/types.ts";
import type { ExpensePhoto } from "../src/lib/expenses.ts";
import { isReceiveStepPending } from "../src/app/detailFlow.ts";
import {
  formatCountdown,
  formatQrChargeAmount,
  getReceivableCents,
  getRemainingSeconds,
  parseAmountToCents,
  getQrChargePayerOptions,
  parseQrChargeResponse,
  QR_CHARGE_PASSENGER_COPY,
  qrChargeCoversReceivable,
  validateQrChargeAmount,
  validateQrChargePayer
} from "../src/lib/qrCharge.ts";
import { RECEIPT_LANGUAGE_OPTIONS } from "../src/lib/receiptLanguage.ts";

const detail = (record?: Record<string, unknown>, valorCampo = ""): DetailData => ({
  type: "SERVICO",
  id: "RV-1",
  title: "Serviço",
  fields: valorCampo ? [{ label: "Valor a receber", value: valorCampo }] : [],
  actions: [],
  dataverse: record ? { entitySetName: "x", id: "1", record } : undefined
} as DetailData);

const validResponse = {
  sessionId: "cs_test_1",
  url: "https://checkout.stripe.com/c/pay/cs_test_1",
  status: "aguardando",
  valorCentavos: 15000,
  expiraEm: "2026-10-21T15:30:00Z"
};

test("valor a receber vem do Dataverse em centavos, com fallback para o campo exibido", () => {
  assert.equal(getReceivableCents(detail({ cr40f_valor_a_receber: 150.1 })), 15010);
  assert.equal(getReceivableCents(detail(undefined, "R$ 1.234,56")), 123456);
  assert.equal(getReceivableCents(detail()), 0);
});

test("valor digitado vira centavos", () => {
  assert.equal(parseAmountToCents("120,50"), 12050);
  assert.equal(parseAmountToCents("1.250"), 125000);
  assert.equal(parseAmountToCents(""), 0);
});

test("valor da cobrança aceita menor ou igual ao valor a receber", () => {
  assert.equal(validateQrChargeAmount(15000, 15000), "");
  assert.equal(validateQrChargeAmount(9000, 15000), "");
  assert.match(validateQrChargeAmount(15001, 15000), /não pode passar de R\$ 150,00/);
  assert.match(validateQrChargeAmount(0, 15000), /Informe o valor/);
  assert.equal(validateQrChargeAmount(49, 15000), "O valor mínimo é R$ 0,50.");
  assert.equal(validateQrChargeAmount(50, 15000), "");
});

test("valor aparece em reais no padrão pt-BR", () => {
  assert.equal(formatQrChargeAmount(123456), "R$ 1.234,56");
});

test("contagem regressiva não fica negativa", () => {
  const now = Date.parse("2026-10-21T15:00:00Z");
  assert.equal(getRemainingSeconds("2026-10-21T15:29:59Z", now), 1799);
  assert.equal(getRemainingSeconds("2026-10-21T14:00:00Z", now), 0);
  assert.equal(getRemainingSeconds("", now), 0);
  assert.equal(formatCountdown(1799), "29:59");
  assert.equal(formatCountdown(5), "00:05");
});

test("resposta válida do plugin vira cobrança", () => {
  const charge = parseQrChargeResponse(validResponse);
  assert.equal(charge.valorCentavos, 15000);
  assert.equal(charge.status, "aguardando");
  assert.equal(charge.recusa, "");
});

test("QR só é gerado para página de pagamento do Stripe", () => {
  assert.throws(() => parseQrChargeResponse({ ...validResponse, url: "https://evil.example/pay" }), /Link de pagamento inválido/);
  assert.throws(() => parseQrChargeResponse({ ...validResponse, url: "http://checkout.stripe.com/x" }), /Link de pagamento inválido/);
});

test("resposta incompleta ou com erro do plugin é recusada com a mensagem certa", () => {
  assert.throws(() => parseQrChargeResponse({ erro: "Você não está liberado para cobrar por QR code." }), /não está liberado/);
  assert.throws(() => parseQrChargeResponse({ ...validResponse, sessionId: "" }), /identificação/);
  assert.throws(() => parseQrChargeResponse({ ...validResponse, status: "talvez" }), /Status/);
  assert.throws(() => parseQrChargeResponse({ ...validResponse, valorCentavos: 150.5 }), /sem valor/);
  assert.throws(() => parseQrChargeResponse(null), /identificação/);
});

test("QR pago no total dispensa a foto; pago em parte, não", () => {
  const paid = parseQrChargeResponse({ ...validResponse, status: "pago" });
  assert.equal(qrChargeCoversReceivable(paid, detail({ cr40f_valor_a_receber: 150 })), true);
  assert.equal(qrChargeCoversReceivable(paid, detail({ cr40f_valor_a_receber: 200 })), false);
  assert.equal(qrChargeCoversReceivable({ ...paid, status: "aguardando" }, detail({ cr40f_valor_a_receber: 150 })), false);
  assert.equal(qrChargeCoversReceivable(undefined, detail({ cr40f_valor_a_receber: 150 })), false);
});

test("recusa do cartão aparece só enquanto a cobrança está aberta", () => {
  assert.equal(parseQrChargeResponse({ ...validResponse, recusa: " Cartão recusado pelo banco. " }).recusa, "Cartão recusado pelo banco.");
  assert.equal(parseQrChargeResponse({ ...validResponse, status: "pago", recusa: "Cartão recusado" }).recusa, "");
});

test("cobrança aberta sem prazo de validade é recusada", () => {
  assert.throws(() => parseQrChargeResponse({ ...validResponse, expiraEm: "" }), /prazo de validade/);
  assert.equal(parseQrChargeResponse({ ...validResponse, status: "pago", expiraEm: "" }).status, "pago");
});

test("etapa Receber some só com comprovante enviado ou QR pago no total", () => {
  const service = { ...detail({ cr40f_receber: true, cr40f_valor_a_receber: 150 }) };
  const base = { receiveProofs: {}, receiveUploadedCounts: {}, remoteMode: true, proofWaived: false };
  assert.equal(isReceiveStepPending(service, base), true);
  assert.equal(isReceiveStepPending(service, { ...base, proofWaived: true }), false);
  const photo = { id: "p1" } as unknown as ExpensePhoto;
  assert.equal(isReceiveStepPending(service, { ...base, receiveProofs: { [service.id]: [photo] } }), true);
  assert.equal(isReceiveStepPending(service, { ...base, receiveProofs: { [service.id]: [photo] }, receiveUploadedCounts: { [service.id]: 1 } }), false);
  assert.equal(isReceiveStepPending({ ...service, type: "TROCA" }, base), false);
});

test("opções de pagante: passageiros com idioma pela bandeira e solicitante, sem cliente e sem repetir", () => {
  const service = {
    ...detail(),
    fields: [
      {
        label: "Passageiros e Telefones de Contato",
        value: '<span><span data-flag="US"></span>John Smith - <a href="https://wa.me/1555">+1 555</a></span><br><span><span data-flag="ES"></span>Ana López - <span style="color:#8a8a8a">Sem telefone</span></span>'
      },
      { label: "Solicitante", value: 'John Smith - <a href="https://wa.me/1555">+1 555</a>' },
      { label: "Cliente", value: "Tenaris" }
    ]
  } as DetailData;
  assert.deepEqual(getQrChargePayerOptions(service), [
    { nome: "John Smith", origem: "Passageiro", idioma: "en-US" },
    { nome: "Ana López", origem: "Passageiro", idioma: "es-ES" }
  ]);
  assert.deepEqual(getQrChargePayerOptions(detail()), []);
});

test("texto livre da reserva: telefone sai do nome e linha sem nome é ignorada", () => {
  const service = {
    ...detail(),
    fields: [{ label: "Passageiros e Telefones de Contato", value: "Maria Souza 11 90000-0001\n+55 11 90000-0014\nPedro: (21) 3333-4444" }]
  } as DetailData;
  assert.deepEqual(getQrChargePayerOptions(service).map((option) => option.nome), ["Maria Souza", "Pedro"]);
});

test("pagante exige nome; e-mail é opcional mas validado", () => {
  assert.deepEqual(validateQrChargePayer({ nome: "John", email: "" }), {});
  assert.deepEqual(validateQrChargePayer({ nome: "John", email: "john@mail.com" }), {});
  assert.equal(validateQrChargePayer({ nome: " ", email: "" }).nome, "Informe quem vai pagar.");
  assert.equal(validateQrChargePayer({ nome: "John", email: "john@mail" }).email, "Confira o e-mail.");
});

test("texto do passageiro existe nos três idiomas do recibo", () => {
  for (const option of RECEIPT_LANGUAGE_OPTIONS) {
    assert.ok(QR_CHARGE_PASSENGER_COPY[option.value].title);
    assert.ok(QR_CHARGE_PASSENGER_COPY[option.value].body);
  }
});

test("cobrança já paga não exige link", () => {
  const charge = parseQrChargeResponse({ ...validResponse, status: "pago", url: "" });
  assert.equal(charge.status, "pago");
});
