/** Viewport em que o `Table` do DS esconde o cabeçalho e mostra só duas colunas. */
export const MEDIA_MOBILE = '(max-width: 820px)'
/** Largura da 2ª coluna das variantes empilhadas (a 1ª usa o padrão `minmax(0, 1fr)`). */
export const COLUNA_LARGA = 'minmax(0, 2fr)'

/** Várias linhas de texto dentro de uma célula (ex.: uma por mês). Valores vazios são ignorados. */
export function Linhas({ itens }: { itens: string[] }) {
  return <span className="dash-linhas">{itens.filter(Boolean).map((texto, i) => <span key={i}>{texto}</span>)}</span>
}

/** Junta partes de uma linha rotulada: "Meta R$ 1,0k · Realizado R$ 2,0k". */
export const juntar = (...partes: string[]) => partes.join(' · ')
