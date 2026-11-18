/* Transição do card ampliado, no padrão dos sistemas de celular ao abrir um app: a moldura do painel cresce a partir do card (clip-path, sem esticar o conteúdo),
   o conteúdo do card acompanha o canto e some, e o corpo do painel cresce por igual junto com a moldura. A curva vale para recorte e posição; opacidades usam tempo linear. */

export const CURVA = 'cubic-bezier(.23, 1, .32, 1)'
export const ABRIR_MS = 320
export const FECHAR_MS = 220
export const FUNDO_MS = 250
export const FADE_MS = 200
export const REDUZIDO_MS = 150

export const reduzidoAgora = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `el.animate` com a curva padrão; `null` onde não há WAAPI (jsdom): quem chama trata como "terminou". */
export function animar(el: Element, quadros: Keyframe[], duration: number, easing = CURVA): Animation | null {
  return typeof el.animate === 'function' ? el.animate(quadros, { duration, easing, fill: 'both' }) : null
}

/** Recorte do painel `para` que deixa à mostra só a área de `de`, com o raio dado (inset negativo vira 0: o card nunca passa da moldura). */
export function recorte(de: DOMRect, para: DOMRect, raio: string) {
  const px = (n: number) => `${Math.max(0, n)}px`
  return `inset(${px(de.top - para.top)} ${px(para.right - de.right)} ${px(para.bottom - de.bottom)} ${px(de.left - para.left)} round ${raio})`
}

/** Corpo do painel reduzido por igual (sem distorcer) e posto sobre o card `de`: cresce junto com a moldura, como o app que abre a partir do ícone. Origem no canto superior esquerdo. */
export const encolher = (de: DOMRect, para: DOMRect) =>
  `translate(${de.left - para.left}px, ${de.top - para.top}px) scale(${de.width / para.width})`

/** Deslocamento que leva o canto superior esquerdo de `de` ao de `para`, sem mudar o tamanho. */
export const deslocar = (de: DOMRect, para: DOMRect) => `translate(${para.left - de.left}px, ${para.top - de.top}px)`

/** Cópia visual do item de origem, fixa sobre ele: o que o usuário vê sair do lugar e sumir dentro da moldura. Sem ids nem `data-origem`, inerte e escondida de leitor de tela. */
export function criarClone(el: HTMLElement, r: DOMRect): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement
  for (const no of [clone, ...clone.querySelectorAll('[id], [data-origem]')]) { no.removeAttribute('id'); no.removeAttribute('data-origem') }
  clone.inert = true
  clone.setAttribute('aria-hidden', 'true')
  const cs = getComputedStyle(el)
  Object.assign(clone.style, {
    position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', boxSizing: 'border-box',
    pointerEvents: 'none', visibility: 'visible', borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, color: cs.color, fontFamily: cs.fontFamily,
    // Fora do grid de origem (.dash-bento > .bt-stat) o clone perderia as trilhas e chegaria com outro layout.
    gridTemplateRows: cs.gridTemplateRows, gridTemplateColumns: cs.gridTemplateColumns,
  })
  return clone
}
