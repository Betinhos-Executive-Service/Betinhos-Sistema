/** Prazos do portal por cliente. Espelha `apps/portal-cliente/src/domain/prazos.ts` (textos e padrões); o shell não importa o app do portal. */
export const PADRAO_ANTECEDENCIA_H = 4
export const PADRAO_CANCELAR_H = 2
export const MAX_PRAZO_H = 720
export const MAX_CONTATO = 100

/** Horas digitadas: vazio = padrão (`null`), 0 = sem limite; `undefined` quando não é inteiro de 0 a 720. */
export function lerHoras(texto: string): number | null | undefined {
  const t = texto.trim()
  if (!t) return null
  if (!/^\d+$/.test(t)) return undefined
  const n = Number(t)
  return n <= MAX_PRAZO_H ? n : undefined
}

/** Valor da coluna lido da Web API: inteiro de 0 a 720, senão vazio (padrão). */
export const horasDaColuna = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PRAZO_H ? v : null)

const faleComBetinhos = (contato: string) => (contato.trim() ? `Fale com a Betinhos: ${contato.trim().replace(/[.\s]+$/, '')}.` : 'Fale com a Betinhos.')

/** O que o cliente lê no portal com estes prazos (mesmas frases do Pedir e do painel do pedido). */
export function previaPrazos({ antecedenciaPedidoH, prazoCancelarH, contato }: { antecedenciaPedidoH: number | null; prazoCancelarH: number | null; contato: string }): string[] {
  const ant = antecedenciaPedidoH ?? PADRAO_ANTECEDENCIA_H
  const can = prazoCancelarH ?? PADRAO_CANCELAR_H
  return [
    ...(ant > 0 ? [`Pedidos com pelo menos ${ant} h de antecedência.`] : []),
    can > 0 ? `Você cancela até ${can} h antes da saída.` : 'Você cancela até a hora da saída.',
    faleComBetinhos(contato),
  ]
}
