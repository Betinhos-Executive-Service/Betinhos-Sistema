import { StatusBadge } from '@betinhos/ui'
import { formatDay } from '../../../app/format'
import type { Source } from '../data/source'
import { autorLabel } from '../domain/choices'
import type { Atualizacao } from '../domain/types'
import { AnexoMiniatura } from './AnexoMiniatura'

const hora = (iso: string) => iso.slice(11, 16)

/** Linha do tempo do projeto: autor, data, texto e miniaturas dos anexos; mais recente primeiro. */
export function Timeline({ itens, source }: { itens: Atualizacao[]; source: Source }) {
  if (!itens.length) return <p className="pj-muted">Nenhuma atualização ainda.</p>
  return (
    <ol className="pj-timeline" aria-label="Linha do tempo">
      {itens.map((a) => (
        <li key={a.id} className="pj-timeline__item">
          <div className="pj-timeline__head">
            <strong>{autorLabel(a.autor)}</strong>
            <span className="pj-num pj-muted">{formatDay(a.data)} {hora(a.data)}</span>
            {a.prova ? <StatusBadge tone="success">Prova</StatusBadge> : null}
          </div>
          {a.texto ? <p className="pj-timeline__texto">{a.texto}</p> : null}
          {a.anexos.length ? <div className="pj-anexos">{a.anexos.map((x) => <AnexoMiniatura key={x.id} anexo={x} source={source} />)}</div> : null}
        </li>
      ))}
    </ol>
  )
}
