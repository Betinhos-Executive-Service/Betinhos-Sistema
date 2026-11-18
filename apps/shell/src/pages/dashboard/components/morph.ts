/* Transição do card ampliado (shared element por FLIP + WAAPI): o clone do item e o painel esticam juntos e se fundem. A curva vale para o transform; opacidades usam tempo linear. */

export const CURVA = 'cubic-bezier(.23, 1, .32, 1)'
export const ABRIR_MS = 320
export const FECHAR_MS = 220
export const FUNDO_MS = 250
export const FADE_MS = 200
export const REDUZIDO_MS = 150
/** Fração da abertura em que o corpo do painel começa a aparecer; a cascata das seções parte daí (ver `dashboard.css`). */
export const CORPO_ENTRA = 0.35

export const reduzidoAgora = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** `el.animate` com a curva padrão; `null` onde não há WAAPI (jsdom): quem chama trata como "terminou". */
export function animar(el: Element, quadros: Keyframe[], duration: number, easing = CURVA): Animation | null {
  return typeof el.animate === 'function' ? el.animate(quadros, { duration, easing, fill: 'both' }) : null
}

/** Transform (origem no canto superior esquerdo) que leva a caixa `para` ao lugar e tamanho de `de`. */
export const transformPara = (de: DOMRect, para: DOMRect) =>
  `translate(${de.left - para.left}px, ${de.top - para.top}px) scale(${de.width / para.width}, ${de.height / para.height})`

/** Cópia visual do item de origem, fixa sobre ele: o que o usuário vê esticar. Sem ids nem `data-origem`, inerte e escondida de leitor de tela. */
export function criarClone(el: HTMLElement, r: DOMRect): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement
  for (const no of [clone, ...clone.querySelectorAll('[id], [data-origem]')]) { no.removeAttribute('id'); no.removeAttribute('data-origem') }
  clone.inert = true
  clone.setAttribute('aria-hidden', 'true')
  const cs = getComputedStyle(el)
  Object.assign(clone.style, {
    position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', boxSizing: 'border-box',
    pointerEvents: 'none', visibility: 'visible', transformOrigin: 'top left', borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, color: cs.color, fontFamily: cs.fontFamily,
  })
  return clone
}
