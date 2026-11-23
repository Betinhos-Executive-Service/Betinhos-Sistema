import { EmptyState } from '@betinhos/ui'
import { History } from 'lucide-react'
import { oQueMuda } from '../domain/perfis'
import type { Historico } from '../domain/types'

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtQuando = (d: Date | null) => (d ? fmt.format(d) : '—')

/** Alterações de perfil, da mais nova para a mais velha. `comPessoa` mostra de quem é (histórico geral). */
export function HistoricoLista({ itens, comPessoa }: { itens: Historico[]; comPessoa?: boolean }) {
  if (!itens.length) return <EmptyState align="start" icon={<History size={36} />} title="Nenhuma alteração registrada">As alterações de perfil feitas por esta tela aparecem aqui.</EmptyState>
  return (
    <ol className="ac-hist" aria-label="Histórico de alterações">
      {itens.map((h) => {
        const linhas = oQueMuda(h.antes, h.depois)
        return (
          <li key={h.id} className="ac-hist__item">
            <span className="ac-hist__quando">{fmtQuando(h.quando)} · por {h.alteradoPor}</span>
            {comPessoa ? <strong>{h.usuario}</strong> : null}
            {linhas.length ? <ul className="ac-hist__linhas">{linhas.map((l) => <li key={l}>{l}</li>)}</ul> : <span className="ac-hist__quando">Sem diferença de perfil.</span>}
          </li>
        )
      })}
    </ol>
  )
}
