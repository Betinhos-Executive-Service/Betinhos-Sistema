import type { DetailData } from "../../types.ts";
import { sanitizeCurrencyInput } from "../../shared/currencyInput.ts";
import { parseSafeDetailHtml } from "../detalhe/detailHtml.ts";
import { RECEIPT_LANGUAGE, type ReceiptLanguage } from "../recibo/receiptLanguage.ts";

// Quem paga: o nome e o e-mail vão para a sessão do Stripe (recibo por e-mail) e para o registro da cobrança.
export type QrChargePayer = { nome: string; email: string };

export type QrChargePayerOption = { nome: string; origem: string; idioma: ReceiptLanguage | null };

// Bandeira do passageiro (data-flag do detalhe, ver buildLanguageFlagHtml) → idioma do texto e da página do Stripe.
const FLAG_LANGUAGE: Record<string, ReceiptLanguage> = {
  BR: RECEIPT_LANGUAGE.portuguese,
  US: RECEIPT_LANGUAGE.english,
  ES: RECEIPT_LANGUAGE.spanish
};

type DetailLine = { text: string; flag: string };

// Uma linha por pessoa: texto (sem o link do telefone) e a bandeira de idioma, se houver.
// Aceita o HTML do detalhe e o texto livre da reserva (quebras de linha).
function getDetailLines(detail: DetailData, label: string): DetailLine[] {
  const lines: DetailLine[] = [{ text: "", flag: "" }];
  const current = () => lines[lines.length - 1];
  for (const part of parseSafeDetailHtml(detail.fields.find((field) => field.label === label)?.value ?? "")) {
    if (part.type === "break") lines.push({ text: "", flag: "" });
    else if (part.type === "flag") current().flag = part.code;
    else if (part.type === "text") {
      part.value.split("\n").forEach((piece, index) => {
        if (index) lines.push({ text: "", flag: "" });
        current().text += piece;
      });
    }
  }
  return lines;
}

// "Nome - telefone" ou texto livre com o telefone no fim: fica só o nome; linha sem letras não é pessoa.
function nameFromLine(text: string) {
  const name = (text.split(" - ")[0] ?? "").replace(/\s*[-–:]?\s*\+?\(?\d[\d\s().-]{6,}$/, "").trim();
  return /\p{L}/u.test(name) ? name : "";
}

// Paga o passageiro (idioma pela bandeira) ou o solicitante; o cliente (empresa) não paga no carro.
export function getQrChargePayerOptions(detail: DetailData): QrChargePayerOption[] {
  const fromField = (label: string, origem: string) =>
    getDetailLines(detail, label).map((line) => ({ nome: nameFromLine(line.text), origem, idioma: FLAG_LANGUAGE[line.flag] ?? null }));
  const candidates = [
    ...fromField("Passageiros e Telefones de Contato", "Passageiro"),
    ...fromField("Solicitante", "Solicitante").slice(0, 1)
  ];
  const seen = new Set<string>();
  return candidates.filter((option) => {
    const key = option.nome.toLowerCase();
    if (!option.nome || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateQrChargePayer(payer: QrChargePayer) {
  const errors: Partial<Record<keyof QrChargePayer, string>> = {};
  const email = payer.email.trim();
  if (!payer.nome.trim()) errors.nome = "Informe quem vai pagar.";
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Confira o e-mail.";
  return errors;
}

export const QR_CHARGE_PASSENGER_COPY: Record<ReceiptLanguage, { title: string; body: string; receipt: string }> = {
  "pt-BR": {
    title: "Pagamento do seu serviço",
    body: "Aponte a câmera do seu celular para o QR code e pague com cartão, Apple Pay ou Google Pay.",
    receipt: "O recibo será enviado para o seu e-mail."
  },
  "en-US": {
    title: "Payment for your service",
    body: "Point your phone camera at the QR code and pay by card, Apple Pay or Google Pay. The amount is charged in Brazilian reais (BRL).",
    receipt: "The receipt will be sent to your email."
  },
  "es-ES": {
    title: "Pago de su servicio",
    body: "Apunte la cámara de su celular al código QR y pague con tarjeta, Apple Pay o Google Pay. El valor se cobra en reales brasileños (BRL).",
    receipt: "El recibo se enviará a su correo electrónico."
  }
};

// Cobrança por QR code (Stripe Checkout), sempre em reais. O plugin (Custom API new_CobrancaQR) cria a sessão no
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

const QR_CHARGE_MINIMUM_CENTS = 50;

export function validateQrChargeAmount(cents: number, maxCents: number) {
  if (cents <= 0) return "Informe o valor da cobrança.";
  // Mínimo do Stripe para BRL; abaixo disso a sessão nem é criada.
  if (cents < QR_CHARGE_MINIMUM_CENTS) return `O valor mínimo é ${formatQrChargeAmount(QR_CHARGE_MINIMUM_CENTS)}.`;
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

// Erro de negócio que o plugin devolve como {erro} para o motorista ler (sem permissão, pagamento em processamento...).
// Diferente de falha de rede: a tela mostra a mensagem em vez de contar como "sem conexão".
export class QrChargeRefusal extends Error {}

// Valida a resposta do plugin antes de virar QR: só aceita página de pagamento do Stripe.
export function parseQrChargeResponse(raw: unknown): QrCharge {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sessionId = String(data.sessionId ?? "");
  const url = String(data.url ?? "");
  const status = String(data.status ?? "");
  const valorCentavos = data.valorCentavos;

  if (typeof data.erro === "string" && data.erro) throw new QrChargeRefusal(data.erro);
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

// ---------- resumo (reidratação depois de recarregar) ----------

// Cobrança aberta devolvida pelo resumo: vem com pagante e idioma para o painel do passageiro sair igual.
export type QrChargeOpen = { charge: QrCharge; pagante: QrChargePayer; idioma: ReceiptLanguage };

export type QrChargeSummary = {
  recebivelCentavos: number;
  pagoCentavos: number;
  // Valor a receber menos o pago e o que está em processamento; teto do QR novo.
  saldoCentavos: number;
  ultimaPaga: (QrCharge & { pagoEm: string; paganteNome: string }) | null;
  aberta: QrChargeOpen | null;
};

const LANGUAGES: readonly string[] = Object.values(RECEIPT_LANGUAGE);

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Resumo da cobrança sem ${label}.`);
  return value;
}

// Valida a resposta da ação "resumo" do plugin.
export function parseQrChargeSummary(raw: unknown): QrChargeSummary {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof data.erro === "string" && data.erro) throw new QrChargeRefusal(data.erro);
  const paid = data.ultimaPaga && typeof data.ultimaPaga === "object" ? (data.ultimaPaga as Record<string, unknown>) : null;
  const open = data.aberta && typeof data.aberta === "object" ? (data.aberta as Record<string, unknown>) : null;
  const openCharge = open ? parseQrChargeResponse(open) : null;
  const idioma = String(open?.idioma ?? "");
  return {
    recebivelCentavos: nonNegativeInteger(data.recebivelCentavos, "valor a receber"),
    pagoCentavos: nonNegativeInteger(data.pagoCentavos, "valor pago"),
    saldoCentavos: nonNegativeInteger(data.saldoCentavos, "saldo"),
    ultimaPaga: paid
      ? { ...parseQrChargeResponse({ ...paid, status: "pago" }), pagoEm: String(paid.pagoEm ?? ""), paganteNome: String(paid.paganteNome ?? "") }
      : null,
    // Só vale retomar o que ainda está aguardando; o resto o app trata pelo pago/saldo.
    aberta: openCharge?.status === "aguardando"
      ? {
          charge: openCharge,
          pagante: { nome: String(open?.paganteNome ?? ""), email: String(open?.paganteEmail ?? "") },
          idioma: LANGUAGES.includes(idioma) ? (idioma as ReceiptLanguage) : RECEIPT_LANGUAGE.portuguese
        }
      : null
  };
}

export type QrChargeReceiveState = {
  receivableCents: number;
  paidCents: number;
  balanceCents: number;
  // Pago no valor total: dispensa a foto do comprovante.
  covers: boolean;
  open: QrChargeOpen | null;
};

// Junta o resumo do plugin com o que foi pago nesta sessão do app (o resumo pode estar sendo revalidado).
export function getQrChargeReceiveState(receivableCents: number, summary: QrChargeSummary | undefined, localPaidCents = 0): QrChargeReceiveState {
  const receivable = summary ? summary.recebivelCentavos : receivableCents;
  const paidCents = Math.max(summary?.pagoCentavos ?? 0, localPaidCents);
  const balanceCents = Math.max(0, Math.min(summary ? summary.saldoCentavos : receivable, receivable - paidCents));
  const covers = receivable > 0 && paidCents >= receivable;
  return { receivableCents: receivable, paidCents, balanceCents, covers, open: covers ? null : summary?.aberta ?? null };
}

// "dd/mm/aaaa HH:mm" no fuso de São Paulo, para a confirmação do pagamento.
export function formatQrChargeDateTime(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

// ---------- formulário passo a passo ----------

export const QR_CHARGE_STEPS = ["valor", "pagante", "email", "idioma", "revisao"] as const;
export type QrChargeStep = (typeof QR_CHARGE_STEPS)[number];

export type QrChargeDraft = {
  amountText: string;
  // Nome de uma das opções ou "" para "Outra pessoa".
  payerChoice: string;
  otherPayerName: string;
  email: string;
  idioma: ReceiptLanguage;
};

export function getQrChargeDraftPayer(draft: QrChargeDraft): QrChargePayer {
  return { nome: (draft.payerChoice || draft.otherPayerName).trim(), email: draft.email.trim() };
}

// Mensagem do passo ou "" quando dá para avançar.
export function validateQrChargeStep(step: QrChargeStep, draft: QrChargeDraft, maxCents: number): string {
  if (step === "valor") return validateQrChargeAmount(parseAmountToCents(draft.amountText), maxCents);
  if (step === "pagante") return validateQrChargePayer(getQrChargeDraftPayer(draft)).nome ?? "";
  if (step === "email") return validateQrChargePayer({ nome: "-", email: draft.email }).email ?? "";
  if (step === "revisao") {
    return QR_CHARGE_STEPS.slice(0, -1).map((item) => validateQrChargeStep(item, draft, maxCents)).find(Boolean) ?? "";
  }
  return "";
}

// Primeiro passo com erro, para a revisão levar o motorista direto a ele.
export function getFirstInvalidQrChargeStep(draft: QrChargeDraft, maxCents: number): QrChargeStep | null {
  return QR_CHARGE_STEPS.slice(0, -1).find((step) => validateQrChargeStep(step, draft, maxCents)) ?? null;
}

export function getQrChargeStepProgress(step: QrChargeStep) {
  const index = QR_CHARGE_STEPS.indexOf(step);
  return { number: index + 1, total: QR_CHARGE_STEPS.length, label: `${index + 1} de ${QR_CHARGE_STEPS.length}` };
}
