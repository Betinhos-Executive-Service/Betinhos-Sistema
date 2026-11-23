import type { KeyboardEvent } from 'react'
import { Skeleton, StatusBadge } from '@betinhos/ui'
import type { Linha } from '../domain/painel'

type Props = {
  linhas: Linha[]
  /** Projeto aberto no painel. */
  selecionado: string | null
  onSelect: (projetoId: string) => void
}

/** Move o foco entre as linhas com as setas (Home/End vão às pontas). */
function navegar(ev: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return
  const itens = Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('[data-linha]'))
  const i = itens.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  ev.preventDefault()
  const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? itens.length - 1 : Math.min(itens.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)))
  itens[j]?.focus()
}

/** Uma linha por projeto: nome, situação (pílula) e o que falta. Clicar abre o painel. */
export function Lista({ linhas, selecionado, onSelect }: Props) {
  return (
    <div className="pj-lista" role="region" aria-label="Projetos" onKeyDown={navegar}>
      <div className="pj-linha pj-linha--cab" aria-hidden="true"><span>Projeto</span><span>Situação</span><span>O que falta</span></div>
      {linhas.map(({ projeto: p, situacao, falta }) => {
        const ativa = selecionado === p.id
        return (
          <button key={p.id} type="button" data-linha className={`pj-linha${ativa ? ' is-ativa' : ''}`} aria-current={ativa || undefined} onClick={() => onSelect(p.id)}
            aria-label={`${p.codigo} ${p.nome || 'Sem nome'}. ${situacao.rotulo}. O que falta: ${falta}.`}>
            <span className="pj-linha__nome"><span>{p.nome || 'Sem nome'}</span><span className="pj-linha__sub">{p.codigo}{p.area ? ` · ${p.area}` : ''}</span></span>
            <span className="pj-linha__sit"><StatusBadge tone={situacao.tom}>{situacao.rotulo}</StatusBadge></span>
            <span className="pj-linha__falta">{falta}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ListaCarregando() {
  return (
    <div className="pj-lista" aria-busy="true" aria-label="Carregando projetos">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="pj-linha"><Skeleton width={i % 2 ? 180 : 140} /><Skeleton width={80} height={22} shape="rect" /><Skeleton width={200} /></div>
      ))}
    </div>
  )
}
