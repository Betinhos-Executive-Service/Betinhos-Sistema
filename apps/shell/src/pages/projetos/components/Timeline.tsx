import { StatusBadge } from '@betinhos/ui'
import { formatDay } from '../../../app/format'
import type { Source } from '../data/source'
import { autorLabel } from '../domain/choices'
import { ehAudio } from '../domain/anexos'
import type { Atualizacao } from '../domain/types'
import { AnexoAudio, AnexoMiniatura } from './AnexoMiniatura'
import { AvatarAutor } from './AvatarAutor'

const hora = (iso: string) => iso.slice(11, 16)

type Props = {
  itens: Atualizacao[]
  source: Source
  vazio?: string
  rotulo?: string
}

/** Linha do tempo: autor, data, texto, anexos e transcrição do áudio; mais recente primeiro. */
export function Timeline({ itens, source, vazio = 'Nenhuma atualização ainda.', rotulo = 'Linha do tempo' }: Props) {
  if (!itens.length) return <p className="pj-muted">{vazio}</p>
  return (
    <ol className="pj-timeline" aria-label={rotulo}>
      {itens.map((a) => {
        const audios = a.anexos.filter((x) => ehAudio(x.tipo))
        const outros = a.anexos.filter((x) => !ehAudio(x.tipo))
        return (
          <li key={a.id} className="pj-timeline__item">
            <div className="pj-timeline__head">
              <AvatarAutor autor={a.autor} />
              <strong>{autorLabel(a.autor)}</strong>
              <span className="pj-num pj-muted">{formatDay(a.data)} {hora(a.data)}</span>
              {a.prova ? <StatusBadge tone="success">Prova</StatusBadge> : null}
            </div>
            {a.texto ? <p className="pj-timeline__texto">{a.texto}</p> : null}
            {outros.length ? <div className="pj-anexos">{outros.map((x) => <AnexoMiniatura key={x.id} anexo={x} source={source} />)}</div> : null}
            {audios.map((x) => <AnexoAudio key={x.id} anexo={x} source={source} />)}
            {audios.length ? (
              a.transcricao
                ? <div className="pj-transcricao"><span className="pj-transcricao__rotulo">Transcrição</span><p className="pj-timeline__texto">{a.transcricao}</p></div>
                : <p className="pj-muted">Transcrição pendente</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
