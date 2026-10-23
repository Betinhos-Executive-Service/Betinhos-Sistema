/**
 * Ficha aberta a partir de outra tela (ex.: multa sem aditivo, `#/funcionarios?ficha=<id>&voltar=#/frota-multas?…`):
 * ao salvar ou fechar, a ficha volta para a origem. Só aceita rota interna do shell.
 */
export function destinoDeVolta(query: URLSearchParams): string | null {
  const voltar = query.get('voltar')
  return voltar && /^#\/[a-z0-9-]+(\?|$)/i.test(voltar) ? voltar : null
}
