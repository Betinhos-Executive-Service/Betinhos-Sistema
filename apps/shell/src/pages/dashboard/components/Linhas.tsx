import { useEffect, useId, type ReactNode } from 'react'
import { Button } from '@betinhos/ui'
import { useQueryConjunto } from '../../../nav/queryState'
import { int } from '../domain/format'

/** Viewport em que o `Table` do DS esconde o cabeçalho e mostra só duas colunas. */
export const MEDIA_MOBILE = '(max-width: 820px)'
/** Largura da 2ª coluna das variantes empilhadas (a 1ª usa o padrão `minmax(0, 1fr)`). */
export const COLUNA_LARGA = 'minmax(0, 2fr)'

/** Várias linhas de texto dentro de uma célula (ex.: uma por mês). Valores vazios são ignorados. */
export function Linhas({ itens }: { itens: string[] }) {
  return <span className="dash-linhas">{itens.filter(Boolean).map((texto, i) => <span key={i}>{texto}</span>)}</span>
}

/** Quantas linhas as listas longas mostram no celular antes do "Ver todos". */
export const TOP_CELULAR = 10

/**
 * Listas longas no celular (≤ 820 px): só as 10 primeiras linhas e o botão "Ver todos (N)", que alterna com "Mostrar só as 10 primeiras".
 * No desktop devolve todas as linhas e nenhum botão (comportamento inalterado).
 */
export function useTopCelular<T>(linhas: T[], mobile: boolean, chave: string): { linhas: T[]; botao: ReactNode } {
  // "Ver todos" de cada lista vive na URL (`todos=<chave>`): reabrir o link mostra a lista inteira.
  const { valores, alternar } = useQueryConjunto('todos')
  const todas = valores.has(chave)
  if (!mobile || linhas.length <= TOP_CELULAR) return { linhas, botao: null }
  return {
    linhas: todas ? linhas : linhas.slice(0, TOP_CELULAR),
    botao: (
      <Button className="dash-ver-todos" variant="secondary" size="touch" fullWidth aria-expanded={todas} onClick={() => alternar(chave)}>
        {todas ? `Mostrar só as ${TOP_CELULAR} primeiras` : `Ver todos (${int(linhas.length)})`}
      </Button>
    ),
  }
}

/** Junta partes de uma linha rotulada: "Meta R$ 1,0k · Realizado R$ 2,0k". */
export const juntar = (...partes: string[]) => partes.join(' · ')

/** Rótulos do botão das listas mensais do celular. */
export const VER_MESES = ['Ver meses', 'Ocultar meses'] as const
export const VER_RANKING = ['Ver ranking', 'Ocultar ranking'] as const

/**
 * Linhas abertas (por chave) das listas expansíveis do celular; todas fechadas por padrão.
 * Ao trocar o filtro, a chave que deixou de existir sai do conjunto, então não reabre se voltar depois.
 */
export function useLinhasAbertas(chaves: string[]) {
  // As linhas abertas vivem na URL (`linha=<chave>`): reabrir o link mostra as mesmas linhas abertas.
  const { valores, alternar, manter } = useQueryConjunto('linha')
  const assinatura = JSON.stringify(chaves)
  useEffect(() => { manter(new Set<string>(JSON.parse(assinatura))) }, [assinatura, manter])
  return { aberta: (chave: string) => valores.has(chave), alternar }
}

type ExpansivelProps = {
  /** Texto da linha fechada (ex.: "Total R$ 1,0k · Participação 12,0%"). */
  resumo: string
  /** Linhas de detalhe (meses ou ranking) mostradas abaixo do resumo quando aberta. Vazio: sem botão. */
  itens: string[]
  /** [rótulo para abrir, rótulo para fechar]. */
  rotulos: readonly [string, string]
  aberta: boolean
  onAlternar: () => void
}

/**
 * Célula das listas do celular: só o resumo da linha e um botão (alvo de 44 px) que abre o detalhe
 * logo abaixo, na mesma célula, sem rolagem horizontal. O detalhe só existe no DOM quando aberto.
 */
export function Expansivel({ resumo, itens, rotulos: [abrir, fechar], aberta, onAlternar }: ExpansivelProps) {
  const id = useId()
  const mostrar = aberta && itens.length > 0
  return (
    <span className="dash-expansivel">
      <span id={`${id}-resumo`} className="dash-expansivel__resumo">{resumo}</span>
      {itens.length ? (
        <Button className="dash-expansivel__botao" variant="ghost" size="touch" aria-expanded={mostrar} aria-controls={mostrar ? `${id}-detalhe` : undefined} aria-describedby={`${id}-resumo`} onClick={onAlternar}>
          {mostrar ? fechar : abrir}
        </Button>
      ) : null}
      {mostrar ? <span id={`${id}-detalhe`} className="dash-expansivel__detalhe"><Linhas itens={itens} /></span> : null}
    </span>
  )
}
