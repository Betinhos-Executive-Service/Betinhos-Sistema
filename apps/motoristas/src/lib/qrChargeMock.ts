import type { QrCharge } from "./qrCharge.ts";

/**
 * Cobrança por QR simulada para a visualização local (fora do Dynamics): vira "pago" 5 s depois de criada.
 * Com ?mockRecusa=1 na URL, as consultas antes disso mostram um cartão recusado.
 */
const charges = new Map<string, { charge: QrCharge; paidAt: number }>();

export function createMockQrCharge(valorCentavos: number): QrCharge {
  const sessionId = `cs_test_mock_${charges.size + 1}`;
  const charge: QrCharge = {
    sessionId,
    url: `https://checkout.stripe.com/c/pay/${sessionId}`,
    status: "aguardando",
    valorCentavos,
    expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    recusa: ""
  };
  charges.set(sessionId, { charge, paidAt: Date.now() + 5000 });
  return charge;
}

export function updateMockQrCharge(sessionId: string, acao: "consultar" | "cancelar", search = globalThis.location?.search ?? ""): QrCharge {
  const entry = charges.get(sessionId);
  if (!entry) throw new Error("Cobrança não encontrada.");
  if (entry.charge.status === "aguardando") {
    if (acao === "cancelar") entry.charge = { ...entry.charge, status: "cancelado" };
    else if (Date.now() >= entry.paidAt) entry.charge = { ...entry.charge, status: "pago", recusa: "" };
    else if (new URLSearchParams(search).get("mockRecusa") === "1") {
      entry.charge = { ...entry.charge, recusa: "Cartão recusado pelo banco emissor (teste)." };
    }
  }
  return entry.charge;
}
