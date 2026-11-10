import type { PDFFont, PDFPage, RGB } from 'pdf-lib'

// WinAnsi (Helvetica padrão): ASCII + Latin-1 (sem os controles C1) + aspas e travessões tipográficos. O resto (emoji etc.) sai.
const EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'])
const codificavel = (c: string) => c === '\n' || (c >= ' ' && c <= '~') || (c >= '\u00a0' && c <= 'ÿ') || EXTRAS.has(c)
export const paraWinAnsi = (texto: string) => [...texto].filter(codificavel).join('')

export function quebrar(texto: string, font: PDFFont, size: number, max: number) {
  const linhas: string[] = []
  for (const paragrafo of texto.split('\n')) {
    let atual = ''
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra
      if (font.widthOfTextAtSize(tentativa, size) <= max) { atual = tentativa; continue }
      if (atual) linhas.push(atual)
      atual = ''
      // Palavra maior que a linha (URL longa): corta por caracteres.
      for (const c of palavra) {
        if (atual && font.widthOfTextAtSize(atual + c, size) > max) { linhas.push(atual); atual = '' }
        atual += c
      }
    }
    linhas.push(atual)
  }
  return linhas
}

/** Traços em coordenadas 0–1 (como a tela de assinatura) dentro de uma caixa; (x, y) é o canto inferior esquerdo. */
export function desenharAssinatura(page: PDFPage, traces: [number, number][][], x: number, y: number, w: number, h: number, cor: RGB, borda: RGB) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: borda, borderWidth: 0.5 })
  for (const traco of traces) {
    for (let i = 1; i < traco.length; i += 1) {
      const [x0, y0] = traco[i - 1]
      const [x1, y1] = traco[i]
      page.drawLine({ start: { x: x + x0 * w, y: y + (1 - y0) * h }, end: { x: x + x1 * w, y: y + (1 - y1) * h }, thickness: 1.2, color: cor })
    }
  }
}
