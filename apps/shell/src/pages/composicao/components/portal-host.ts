/**
 * Onde desenhar o que sai por portal. O CSS da tela é escopado a `.composicao`, então lista, popup e cartão precisam
 * ficar dentro dessa raiz; fora dela (teste de um componente isolado) cai no `body`.
 */
export function portalHost(from?: Element | null): HTMLElement {
  return from?.closest<HTMLElement>('.composicao') ?? document.querySelector<HTMLElement>('.composicao') ?? document.body
}
