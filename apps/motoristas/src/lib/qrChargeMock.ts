import type { QrCharge, QrChargePayer, QrChargeSummary } from "./qrCharge.ts";
import type { ReceiptLanguage } from "./receiptLanguage.ts";

/**
 * Cobrança por QR simulada para a visualização local (fora do Dynamics): vira "pago" 5 s depois de criada
 * (ou ?mockPagaEm=<segundos>). Com ?mockRecusa=1 na URL, as consultas antes disso mostram um cartão recusado;
 * ?mockExpira=<segundos> encurta o prazo do QR e ?mockOffline=<n> faz as n primeiras consultas falharem como sem rede.
 * Fica no sessionStorage para o "resumo" reconhecer o pagamento depois de recarregar a página.
 */
type MockEntry = { reservaId: string; charge: QrCharge; paidAt: number; pagante: QrChargePayer; idioma: ReceiptLanguage; pagoEm: string };

const STORAGE_KEY = "betinhos.qrChargeMock.v1";
let memory: Record<string, MockEntry> | null = null;
let offlineFailuresLeft = 0;

function load(): Record<string, MockEntry> {
  if (memory) return memory;
  try {
    memory = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    memory = {};
  }
  return memory as Record<string, MockEntry>;
}

function save() {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(memory ?? {}));
  } catch {
    // Sem armazenamento (aba privada): o mock segue só na memória.
  }
}

function param(name: string, search: string) {
  return new URLSearchParams(search).get(name);
}

// Aplica o pagamento simulado quando chega a hora; pago nunca volta atrás.
function settle(entry: MockEntry, now: number) {
  if (entry.charge.status === "aguardando" && now >= entry.paidAt) {
    entry.charge = { ...entry.charge, status: "pago", recusa: "" };
    entry.pagoEm = new Date(entry.paidAt).toISOString();
  }
}

export function resetMockQrCharges() {
  memory = {};
  save();
}

export function createMockQrCharge(
  request: { reservaId: string; valorCentavos: number; pagante: QrChargePayer; idioma: ReceiptLanguage },
  search = globalThis.location?.search ?? "",
  now = Date.now()
): QrCharge {
  const charges = load();
  const sessionId = `cs_test_mock_${now.toString(36)}${Object.keys(charges).length + 1}`;
  const delaySeconds = Number(param("mockPagaEm", search) ?? 5);
  const expiresInSeconds = Number(param("mockExpira", search)) || 30 * 60;
  offlineFailuresLeft = Number(param("mockOffline", search)) || 0;
  const charge: QrCharge = {
    sessionId,
    url: `https://checkout.stripe.com/c/pay/${sessionId}`,
    status: "aguardando",
    valorCentavos: request.valorCentavos,
    expiraEm: new Date(now + expiresInSeconds * 1000).toISOString(),
    recusa: ""
  };
  // Como o plugin: um QR aberto por reserva.
  Object.values(charges).forEach((entry) => {
    settle(entry, now);
    if (entry.reservaId === request.reservaId && entry.charge.status === "aguardando") entry.charge = { ...entry.charge, status: "cancelado" };
  });
  charges[sessionId] = {
    reservaId: request.reservaId,
    charge,
    paidAt: now + (Number.isFinite(delaySeconds) && delaySeconds >= 0 ? delaySeconds : 5) * 1000,
    pagante: request.pagante,
    idioma: request.idioma,
    pagoEm: ""
  };
  save();
  return charge;
}

export function updateMockQrCharge(sessionId: string, acao: "consultar" | "cancelar", search = globalThis.location?.search ?? "", now = Date.now()): QrCharge {
  const entry = load()[sessionId];
  if (!entry) throw new Error("Cobrança não encontrada.");
  if (acao === "consultar" && offlineFailuresLeft > 0) {
    offlineFailuresLeft -= 1;
    throw new Error("Failed to fetch");
  }
  settle(entry, now);
  if (entry.charge.status === "aguardando") {
    if (acao === "cancelar") entry.charge = { ...entry.charge, status: "cancelado" };
    else if (param("mockRecusa", search) === "1") entry.charge = { ...entry.charge, recusa: "Cartão recusado pelo banco emissor (teste)." };
  }
  save();
  return entry.charge;
}

// Mesmo contrato da ação "resumo" do plugin, com o que foi cobrado nesta aba.
export function getMockQrChargeSummary(reservaId: string, receivableCents: number, now = Date.now()): QrChargeSummary {
  const entries = Object.values(load()).filter((entry) => entry.reservaId === reservaId);
  entries.forEach((entry) => settle(entry, now));
  save();
  const paid = entries.filter((entry) => entry.charge.status === "pago");
  const pagoCentavos = paid.reduce((sum, entry) => sum + entry.charge.valorCentavos, 0);
  const last = paid.sort((a, b) => b.paidAt - a.paidAt)[0];
  const open = entries.find((entry) => entry.charge.status === "aguardando" && Date.parse(entry.charge.expiraEm) > now);
  return {
    recebivelCentavos: receivableCents,
    pagoCentavos,
    saldoCentavos: Math.max(0, receivableCents - pagoCentavos),
    ultimaPaga: last ? { ...last.charge, pagoEm: last.pagoEm, paganteNome: last.pagante.nome } : null,
    aberta: open ? { charge: open.charge, pagante: open.pagante, idioma: open.idioma } : null
  };
}
