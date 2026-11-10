/**
 * Leitura rápida simulada para a visualização local (fora do Dynamics), ativada só com ?mockLeitura=<modo> na URL.
 * Com ?mockLeituraValor=<reais> o modo ok devolve esse valor (conferência do comprovante de recebimento);
 * com ?mockLeituraData=<AAAA-MM-DD>, essa data.
 * Modos: ok (2,5 s), lento (11 s, mostra o aviso de demora), ilegivel, falha e timeout (nunca responde).
 */
export type QuickReadMockMode = "ok" | "lento" | "ilegivel" | "falha" | "timeout";

const MODES: QuickReadMockMode[] = ["ok", "lento", "ilegivel", "falha", "timeout"];

export function getQuickReadMockMode(search = globalThis.location?.search ?? ""): QuickReadMockMode | null {
  const value = new URLSearchParams(search).get("mockLeitura");
  return MODES.includes(value as QuickReadMockMode) ? (value as QuickReadMockMode) : null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readReceiptQuickMock(mode: QuickReadMockMode, categorias: string[], formasPagamento: string[], timeoutMs: number): Promise<unknown> {
  if (mode === "timeout") {
    await wait(timeoutMs + 1_000);
    return { ok: false };
  }
  await wait(mode === "lento" ? 11_000 : 2_500);
  if (mode === "falha") return { ok: false, erro: "leitura_indisponivel" };
  if (mode === "ilegivel") {
    return { ok: true, leitura: { legivel: false, valor: null, data: null, hora: null, estabelecimento: null, cnpj: null, litros: null, cidade: null, uf: null, categoria_sugerida: null, forma_pagamento_sugerida: null, motivo_ilegivel: "Foto borrada." } };
  }
  return {
    ok: true,
    leitura: {
      legivel: true,
      valor: Number(new URLSearchParams(globalThis.location?.search ?? "").get("mockLeituraValor")) || 51.9,
      data: new URLSearchParams(globalThis.location?.search ?? "").get("mockLeituraData") || "2026-10-10",
      hora: "18:28",
      estabelecimento: "Burger King",
      cnpj: null,
      litros: null,
      cidade: "São Paulo",
      uf: "SP",
      categoria_sugerida: categorias.find((name) => /almo/i.test(name)) ?? null,
      forma_pagamento_sugerida: formasPagamento.find((name) => /cr[eé]dito/i.test(name)) ?? null,
      motivo_ilegivel: null
    }
  };
}
