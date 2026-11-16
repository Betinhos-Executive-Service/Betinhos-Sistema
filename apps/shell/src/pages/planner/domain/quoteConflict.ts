// Conflito de versão na cotação (outra pessoa gravou depois da leitura da tela). A tela
// reconhece pelo código, recarrega os dados e o drawer oferece "Recarregar cotação".
export const QUOTE_CONFLICT = 'QUOTE_CONFLICT'

export function quoteConflictError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: QUOTE_CONFLICT })
}

export function isQuoteConflict(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === QUOTE_CONFLICT
}
