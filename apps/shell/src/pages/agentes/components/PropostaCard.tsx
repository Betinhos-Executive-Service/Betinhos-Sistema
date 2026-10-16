import { Button, StatusBadge } from '@betinhos/ui'
import { Check, ExternalLink, X } from 'lucide-react'
import type { Proposta } from '../domain/types'

const fmtData = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

export function PropostaCard({ proposta, linkAlvo, busy, onAprovar, onDescartar }: { proposta: Proposta; linkAlvo: string | null; busy: boolean; onAprovar: () => void; onDescartar: () => void }) {
  const p = proposta
  const decidida = p.decisao !== 'pendente'
  return (
    <article className={decidida ? 'proposta proposta--decidida surface' : 'proposta surface'} aria-label={p.titulo}>
      <header className="proposta__cabecalho">
        <StatusBadge tone={p.prioridade === 'alta' ? 'danger' : p.prioridade === 'media' ? 'warning' : 'neutral'} dot>{p.tipo}</StatusBadge>
        {linkAlvo && <a className="proposta__alvo" href={linkAlvo} target="_blank" rel="noreferrer">Abrir registro <ExternalLink size={14} aria-hidden /></a>}
      </header>
      <h3 className="proposta__titulo">{p.titulo}</h3>
      <p className="proposta__justificativa">{p.justificativa}</p>
      {decidida ? (
        <p className="proposta__decisao">{p.decisao === 'aprovada' ? 'Aprovada' : 'Descartada'} por {p.decididoPor || 'alguém'} em {fmtData(p.decididoEm)}{p.motivoDescarte ? ` · ${p.motivoDescarte}` : ''}</p>
      ) : (
        <footer className="proposta__acoes">
          <Button variant="secondary" size="compact" icon={<X size={16} />} disabled={busy} onClick={onDescartar}>Descartar</Button>
          <Button variant="primary" size="compact" icon={<Check size={16} />} loading={busy} onClick={onAprovar}>Aprovar</Button>
        </footer>
      )}
    </article>
  )
}
