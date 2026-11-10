import type { QuickReadOutcome } from "../despesas/receiptQuickRead.ts";

// Quadro de valores da tela "Enviar comprovante".
export type ReceiveSummaryState = "semValor" | "aReceber" | "parcial" | "quitado";

export function getReceiveSummaryState(totalCents: number, paidCents: number): ReceiveSummaryState {
  if (totalCents <= 0) return "semValor";
  if (paidCents <= 0) return "aReceber";
  return paidCents >= totalCents ? "quitado" : "parcial";
}

// Valor lido em centavos, ou null quando a foto não deu leitura (ilegível, falha, sem valor).
export function quickReadValueCents(outcome: QuickReadOutcome): number | null {
  if (outcome.kind !== "lido") return null;
  const value = outcome.leitura.valor;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

// A IA só confere: os comprovantes lidos somam o que falta? Sem leitura nenhuma, não confirma.
export function proofsCoverBalance(readCents: Array<number | null>, balanceCents: number) {
  if (balanceCents <= 0) return true;
  const total = readCents.reduce<number>((sum, cents) => sum + (cents ?? 0), 0);
  return total >= balanceCents;
}
