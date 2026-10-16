import { StatusBadge } from '@betinhos/ui'
import type { Execucao } from '../domain/types'

const fmt = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const TONE = { concluida: 'success', erro: 'danger', processando: 'info', pendente: 'neutral' } as const
const LABEL = { concluida: 'Concluída', erro: 'Erro', processando: 'Processando', pendente: 'Pendente' } as const

export function Historico({ execucoes, atualId, onAbrir }: { execucoes: Execucao[]; atualId: string | null; onAbrir: (id: string) => void }) {
  return (
    <section className="historico surface" aria-label="Histórico">
      <h2 className="historico__titulo">Últimas execuções</h2>
      <ul className="historico__lista">
        {execucoes.map((e) => (
          <li key={e.id}>
            <button type="button" className={e.id === atualId ? 'historico__item historico__item--ativo' : 'historico__item'} onClick={() => onAbrir(e.id)} aria-current={e.id === atualId ? 'true' : undefined}>
              <span>{fmt(e.criadaEm)} · {e.origem === 'agendado' ? 'Agendado' : 'Manual'}{e.pergunta ? ` · "${e.pergunta}"` : ''}</span>
              <span className="historico__meta"><StatusBadge tone={TONE[e.status]} dot>{LABEL[e.status]}</StatusBadge>{e.status === 'concluida' && <span className="texto-secundario">{e.tokensEntrada + e.tokensSaida} tokens</span>}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
