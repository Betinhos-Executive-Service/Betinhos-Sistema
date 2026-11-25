import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterAll, afterEach } from 'vitest'

// Timer que vence depois do arquivo dispara já sem jsdom e derruba o run com "window is not defined" (o toast de 4 s do
// ToastProvider do @betinhos/ui não limpa o timer no unmount, e vários arquivos terminam com toast na tela). O fim do
// arquivo cancela os pendentes.
const pendentes = new Set<ReturnType<typeof setTimeout> | undefined>()
const { setTimeout: agendar, clearTimeout: cancelar } = globalThis
globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  const id = agendar((...a: unknown[]) => { pendentes.delete(id); fn(...a) }, ms, ...args)
  pendentes.add(id)
  return id
}) as typeof setTimeout
globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => { pendentes.delete(id); cancelar(id) }) as typeof clearTimeout
afterAll(() => { for (const id of pendentes) cancelar(id) })

// Três custos do jsdom/React que dominavam os testes de tela (perfil de CPU da Geral). Nada aqui muda o que as consultas
// encontram: só deixa de calcular o que ninguém lê. Importados aqui dentro para os testes em Node não pagarem a carga.
if (typeof window !== 'undefined') {
  const { configure, getConfig } = await import('@testing-library/react')
  const React = await import('react')
  // 1. Toda consulta por papel e nome chama getComputedStyle em cada nó e lê só `display` e `visibility`, mas o jsdom
  //    resolve antes cerca de 18 propriedades (quase todas cores e bordas). Aqui essas duas saem pelo mesmo
  //    getResolvedValue do jsdom, e a declaração completa só é montada se alguém ler outra coisa. Usa módulos internos do
  //    jsdom: se uma atualização mudar os caminhos, o require falha na hora.
  const require = createRequire(import.meta.url)
  const jsdom = dirname(require.resolve('jsdom/package.json'))
  const { getResolvedValue } = require(join(jsdom, 'lib/jsdom/living/helpers/style-rules.js')) as { getResolvedValue: (impl: unknown, property: string) => string }
  const { implForWrapper } = require(join(jsdom, 'lib/jsdom/living/generated/utils.js')) as { implForWrapper: (wrapper: Element) => unknown }
  const completo = window.getComputedStyle.bind(window)
  window.getComputedStyle = (element: Element, pseudo?: string | null) => {
    if (pseudo || !(element instanceof Element)) return completo(element, pseudo)
    let declaracao: CSSStyleDeclaration | undefined
    const tudo = () => (declaracao ??= completo(element))
    const ler = (property: string) => (property === 'display' || property === 'visibility' ? getResolvedValue(implForWrapper(element), property) : tudo().getPropertyValue(property))
    return new Proxy({} as CSSStyleDeclaration, {
      get: (_, chave) => {
        if (chave === 'getPropertyValue') return ler
        if (chave === 'display' || chave === 'visibility') return ler(chave)
        const alvo = tudo()
        const valor: unknown = Reflect.get(alvo, chave)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })
  }

  // 2. Cada tentativa de um waitFor/findBy que ainda não achou serializava o DOM inteiro para a mensagem de um erro que é
  //    descartado. No estouro do tempo o waitFor chama getElementError de novo, fora da tentativa: a falha segue com o DOM.
  //    Sem mensagem é o getBy montando a lista dos elementos repetidos, que vai para o erro final: essa fica completa.
  const padrao = getConfig().getElementError
  configure({
    getElementError: (message, container) => (message && (getConfig() as unknown as { _disableExpensiveErrorDiagnostics?: boolean })._disableExpensiveErrorDiagnostics
      ? Object.assign(new Error(message), { name: 'TestingLibraryElementError' })
      : padrao(message, container)),
  })

  // 3. Em desenvolvimento o React 19 captura uma pilha (`new Error`) para cada elemento JSX, até 10 mil por segundo, só
  //    para enfeitar avisos com o "owner stack". Marcando a cota como esgotada ele usa a pilha genérica.
  const interno = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: object }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  if (interno) Object.defineProperty(interno, 'recentlyCreatedOwnerStacks', { configurable: true, get: () => Number.MAX_SAFE_INTEGER, set: () => undefined })
}

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
