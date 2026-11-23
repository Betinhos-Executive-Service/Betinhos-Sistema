import { Button, EmptyState, StatusBadge } from '@betinhos/ui'
import { History, Undo2 } from 'lucide-react'
import { dataCurta, dataHora } from '../domain/formato'
import { ROTULO_PERFIL, rotuloChave, type EventoLinha } from '../domain/regras'

type Props = {
  eventos: EventoLinha[]
  numeroNoAr: number | null
  onVoltar: (versaoId: string) => void
}

function Titulo({ e }: { e: EventoLinha }) {
  if (e.tipo === 'versao') return <><strong>Versão {e.versao.numero}</strong> publicada por {e.versao.publicadoPor || '—'}</>
  const quem = <strong>{e.pessoa}</strong>
  switch (e.tipo) {
    case 'excecao-criada': return <>{quem}: exceção criada em {rotuloChave(e.registro.chave)} ({e.registro.ligado ? 'ligar' : 'desligar'}){e.registro.validade ? ` até ${dataCurta(e.registro.validade)}` : ''}</>
    case 'excecao-encerrada': return <>{quem}: exceção de {rotuloChave(e.registro.chave)} encerrada{e.registro.encerradoPor ? ` por ${e.registro.encerradoPor}` : ''}</>
    case 'excecao-vencida': return <>{quem}: exceção de {rotuloChave(e.registro.chave)} venceu</>
    case 'piloto-entrou': return <>{quem} entrou no grupo piloto</>
    case 'piloto-saiu': return <>{quem} saiu do grupo piloto</>
  }
}

/** Linha do tempo: versões publicadas (com o que mudou) e eventos por pessoa. "Voltar a esta versão" carrega a matriz como rascunho. */
export function Historico({ eventos, numeroNoAr, onVoltar }: Props) {
  if (!eventos.length) return <EmptyState className="surface" align="start" icon={<History size={36} />} title="Nada publicado ainda">Quando a primeira versão for publicada, ela aparece aqui com o que mudou.</EmptyState>
  return (
    <ol className="am-tempo" aria-label="Histórico da configuração">
      {eventos.map((e) => (
        <li key={e.id} className={`am-tempo__item am-tempo__item--${e.tipo === 'versao' ? 'versao' : 'pessoa'}`}>
          <div className="am-tempo__topo">
            <span><Titulo e={e} /></span>
            <time className="am-muted" dateTime={e.quando}>{dataHora(e.quando)}</time>
          </div>
          {e.tipo === 'versao' ? (
            <>
              {e.versao.nota ? <p className="am-tempo__nota">“{e.versao.nota}”</p> : null}
              <ul className="am-tempo__mudancas">
                {e.mudancas.length ? e.mudancas.map((m) => (
                  <li key={`${m.perfil}:${m.chave}`}>{rotuloChave(m.chave)} · {ROTULO_PERFIL[m.perfil]}: {m.de ? 'ligado' : 'desligado'} → <strong>{m.para ? 'ligado' : 'desligado'}</strong></li>
                )) : <li className="am-muted">Sem mudança em relação à versão anterior.</li>}
              </ul>
              <div className="am-tempo__acoes">
                {e.versao.numero === numeroNoAr ? <StatusBadge tone="success">No ar</StatusBadge> : null}
                {e.versao.numero !== numeroNoAr ? <Button size="compact" variant="secondary" icon={<Undo2 size={14} />} onClick={() => onVoltar(e.versao.id)}>Voltar a esta versão</Button> : null}
              </div>
            </>
          ) : e.registro.motivo && e.tipo === 'excecao-criada' ? <p className="am-muted">{e.registro.motivo}</p> : null}
        </li>
      ))}
    </ol>
  )
}
