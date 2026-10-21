import type { DetailData } from "../types.ts";
import { sanitizeCurrencyInput } from "./currencyInput.ts";

// Cobrança por QR code (Stripe Checkout), sempre em reais. O Flow cria a sessão no
// Stripe e devolve este contrato; valores em centavos para não depender de float.
export type QrChargeStatus = "aguardando" | "pago" | "expirado" | "cancelado";

export type QrCharge = {
  sessionId: string;
  url: string;
  status: QrChargeStatus;
  valorCentavos: number;
  expiraEm: string;
  // Motivo da última tentativa recusada (cartão negado etc.); vazio se nenhuma falhou.
  recusa: string;
};

const STATUSES: readonly string[] = ["aguardando", "pago", "expirado", "cancelado"] satisfies QrChargeStatus[];
const CHECKOUT_URL_PREFIX = "https://checkout.stripe.com/";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const isQrChargeStatus = (value: string): value is QrChargeStatus => STATUSES.includes(value);

export function parseAmountToCents(value: string) {
  const sanitized = sanitizeCurrencyInput(value).replace(",", ".");
  const amount = Number(sanitized);
  return sanitized && Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function getReceivableCents(detail: DetailData) {
  const amount = detail.dataverse?.record?.cr40f_valor_a_receber;
  if (typeof amount === "number" && Number.isFinite(amount)) return Math.round(amount * 100);
  const field = detail.fields.find((item) => item.label.toLowerCase() === "valor a receber");
  return field ? parseAmountToCents(field.value) : 0;
}

// QR pago no valor total dispensa a foto do comprovante; pago em parte, o resto ainda precisa dela.
export function qrChargeCoversReceivable(charge: QrCharge | undefined, detail: DetailData) {
  return charge?.status === "pago" && charge.valorCentavos >= getReceivableCents(detail);
}

export function validateQrChargeAmount(cents: number, maxCents: number) {
  if (cents <= 0) return "Informe o valor da cobrança.";
  if (cents > maxCents) return `O valor não pode passar de ${formatQrChargeAmount(maxCents)}.`;
  return "";
}

export function formatQrChargeAmount(cents: number) {
  return BRL.format(cents / 100).replace(/ /g, " ");
}

export function getRemainingSeconds(expiraEm: string, now = Date.now()) {
  const expiresAt = Date.parse(expiraEm);
  return Number.isFinite(expiresAt) ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
}

export function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// Valida a resposta do Flow antes de virar QR: só aceita página de pagamento do Stripe.
export function parseQrChargeResponse(raw: unknown): QrCharge {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sessionId = String(data.sessionId ?? "");
  const url = String(data.url ?? "");
  const status = String(data.status ?? "");
  const valorCentavos = data.valorCentavos;

  if (typeof data.erro === "string" && data.erro) throw new Error(data.erro);
  if (!sessionId) throw new Error("Cobrança sem identificação do Stripe.");
  if (!isQrChargeStatus(status)) throw new Error("Status de cobrança desconhecido.");
  if (typeof valorCentavos !== "number" || !Number.isInteger(valorCentavos) || valorCentavos <= 0) throw new Error("Cobrança sem valor.");
  if (status === "aguardando" && !url.startsWith(CHECKOUT_URL_PREFIX)) throw new Error("Link de pagamento inválido.");
  // Sem validade o app trataria o QR como expirado na hora.
  if (status === "aguardando" && !Number.isFinite(Date.parse(String(data.expiraEm ?? "")))) throw new Error("Cobrança sem prazo de validade.");

  return {
    sessionId,
    url,
    status,
    valorCentavos,
    expiraEm: String(data.expiraEm ?? ""),
    recusa: status === "aguardando" ? String(data.recusa ?? "").trim() : ""
  };
}
