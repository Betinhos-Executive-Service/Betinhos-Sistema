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
// O jsdom calcula `label.control` e `labels` varrendo o documento inteiro a cada leitura. Toda consulta por papel e
// nome (getByRole) lê `labels` de cada botão e campo: nas tabelas grandes (Geral: 100 linhas, cada uma com <label>)
// isso fica quadrático e o arquivo de testes leva dezenas de minutos. Mesmas regras do HTML, olhando só o `for` e os
// ancestrais (custom elements associados a formulário não são labelable aqui; o app não usa).
if (typeof HTMLLabelElement !== 'undefined') {
  const LABELABLE = 'button, input, meter, output, progress, select, textarea'
  const isLabelable = (el: Element | null): el is HTMLElement =>
    !!el && el.namespaceURI === 'http://www.w3.org/1999/xhtml' && el.matches(LABELABLE) && !(el instanceof HTMLInputElement && el.type === 'hidden')
  const firstWithId = (root: Node, id: string): Element | null => {
    if (root instanceof Element && root.id === id) return root
    for (const el of (root as ParentNode).querySelectorAll?.('[id]') ?? []) if (el.id === id) return el
    return null
  }
  Object.defineProperty(HTMLLabelElement.prototype, 'control', {
    configurable: true,
    get(this: HTMLLabelElement) {
      const id = this.getAttribute('for')
      if (id === null) return [...this.querySelectorAll(LABELABLE)].find(isLabelable) ?? null
      if (id === '') return null
      const target = firstWithId(this.getRootNode(), id)
      return isLabelable(target) ? target : null
    },
  })
  const labelables = [HTMLButtonElement, HTMLInputElement, HTMLMeterElement, HTMLOutputElement, HTMLProgressElement, HTMLSelectElement, HTMLTextAreaElement]
  for (const { prototype } of labelables) {
    Object.defineProperty(prototype, 'labels', {
      configurable: true,
      get(this: HTMLElement) {
        if (!isLabelable(this)) return null
        const candidates = new Set<HTMLLabelElement>()
        for (let el = this.parentElement; el; el = el.parentElement) if (el instanceof HTMLLabelElement) candidates.add(el)
        if (this.id) for (const label of (this.getRootNode() as ParentNode).querySelectorAll?.<HTMLLabelElement>('label[for]') ?? []) if (label.htmlFor === this.id) candidates.add(label)
        return [...candidates].filter((label) => label.control === this).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      },
    })
  }
}
// O estado das telas vive na query do hash (#/pagantes?status=1): sem limpar, o filtro de um teste vazaria para o seguinte.
if (typeof history !== 'undefined') afterEach(() => { history.replaceState(null, '', '#') })
import { cleanup } from '@testing-library/react'
afterEach(cleanup)
