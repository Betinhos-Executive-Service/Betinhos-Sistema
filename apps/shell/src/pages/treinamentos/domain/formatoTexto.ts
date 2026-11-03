export type Formato = 'titulo' | 'negrito' | 'lista'
export type Edicao = { texto: string; inicio: number; fim: number }

const PREFIXO: Record<'titulo' | 'lista', string> = { titulo: '# ', lista: '- ' }
const MARCA = /^(#{1,3}\s+|[-*•]\s+)/

/** Aplica negrito na seleção, ou título/lista nas linhas tocadas pela seleção (repetir o formato desfaz). */
export function aplicarFormato(texto: string, inicio: number, fim: number, formato: Formato): Edicao {
  if (formato === 'negrito') {
    const sel = texto.slice(inicio, fim)
    const em = inicio >= 2 && texto.slice(inicio - 2, inicio) === '**' && texto.slice(fim, fim + 2) === '**'
    if (em) return { texto: texto.slice(0, inicio - 2) + sel + texto.slice(fim + 2), inicio: inicio - 2, fim: fim - 2 }
    if (/^\*\*[^*]+\*\*$/.test(sel)) return { texto: texto.slice(0, inicio) + sel.slice(2, -2) + texto.slice(fim), inicio, fim: fim - 4 }
    return { texto: `${texto.slice(0, inicio)}**${sel}**${texto.slice(fim)}`, inicio: inicio + 2, fim: fim + 2 }
  }
  const comeco = texto.lastIndexOf('\n', inicio - 1) + 1
  const proxima = texto.indexOf('\n', fim)
  const termino = proxima === -1 ? texto.length : proxima
  const linhas = texto.slice(comeco, termino).split('\n')
  const prefixo = PREFIXO[formato]
  const desfazer = linhas.filter((l) => l.trim()).every((l) => l.startsWith(prefixo))
  const novas = linhas.map((l) => {
    if (!l.trim()) return l
    return desfazer ? l.slice(prefixo.length) : prefixo + l.replace(MARCA, '')
  })
  const bloco = novas.join('\n')
  const delta = bloco.length - (termino - comeco)
  return { texto: texto.slice(0, comeco) + bloco + texto.slice(termino), inicio: comeco, fim: termino + delta }
}
