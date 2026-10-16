import { afterEach } from 'vitest'

// jsdom ainda não implementa o modal nativo do <dialog> usado por Drawer e Dialog.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
}
// Nem rolagem até a opção ativa do Select.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {}
// Nem matchMedia (barra de visões e layout responsivo): sem stub do teste, nenhuma media query bate.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })
}
// O estado das telas vive na query do hash (#/pagantes?status=1): sem limpar, o filtro de um teste vazaria para o seguinte.
if (typeof history !== 'undefined') afterEach(() => { history.replaceState(null, '', '#') })
