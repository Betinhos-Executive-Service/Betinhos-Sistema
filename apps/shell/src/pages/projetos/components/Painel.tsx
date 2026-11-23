import { useCallback, useMemo, useState } from 'react'
import { Button, StatusBadge, useToast } from '@betinhos/ui'
import { Check, ExternalLink, Mic, Paperclip, Pencil, Plus, X } from 'lucide-react'
import { formatDay } from '../../../app/format'
import { reasonText, type Source } from '../data/source'
import { STATUS, autorDoPerfil, statusLabel, statusTone } from '../domain/choices'
import { ehAudio } from '../domain/anexos'
import { doBriefing, motivoSemConcluir, trilha } from '../domain/painel'
import { atrasada, daEtapa, etapaDoProjeto, provas } from '../domain/regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from '../domain/types'
import { AnexoAudio, AnexoMiniatura } from './AnexoMiniatura'
import { NovaAtualizacao } from './NovaAtualizacao'
import { Timeline } from './Timeline'
import { Trilha } from './Trilha'

type Props = {
  projeto: Projeto
  etapas: Etapa[]
  atualizacoes: Atualizacao[]
  perfil: Perfil
  source: Source
  hoje: string
  onAtualizacao: (a: Atualizacao) => void
  onEtapaSalva: (e: Etapa) => void
  onEditarProjeto: (id: string) => void
  onDirty: (dirty: boolean) => void
  onBusy: (busy: boolean) => void
  /** Botão X (painel fixo); no drawer estreito o X é do próprio drawer. */
  onClose?: () => void
}

type Pedido = { n: number; prova?: boolean; gravar?: boolean }

const quando = (iso: string) => `${formatDay(iso)} ${iso.slice(11, 16)}`

/** Briefing do gestor: texto do projeto e anexos fora de etapa (áudio com transcrição ou "Transcrição pendente"). */
function Briefing({ projeto, atualizacoes, source }: { projeto: Projeto; atualizacoes: Atualizacao[]; source: Source }) {
  const itens = doBriefing(atualizacoes, projeto.id)
  if (!projeto.briefing.trim() && !itens.length) return <p className="pj-muted">O gestor ainda não escreveu o briefing.</p>
  return (
    <div className="pj-brief" role="group" aria-label="Briefing do gestor">
      {projeto.briefing.trim() ? <p className="pj-timeline__texto">{projeto.briefing}</p> : null}
      {itens.map((a) => {
        const audios = a.anexos.filter((x) => ehAudio(x.tipo))
        const outros = a.anexos.filter((x) => !ehAudio(x.tipo))
        return (
          <div key={a.id} className="pj-brief__item">
            {a.texto ? <p className="pj-timeline__texto">{a.texto}</p> : null}
            {outros.length ? <div className="pj-anexos">{outros.map((x) => <AnexoMiniatura key={x.id} anexo={x} source={source} />)}</div> : null}
            {audios.map((x) => <AnexoAudio key={x.id} anexo={x} source={source} />)}
            {audios.length ? (a.transcricao ? <p className="pj-brief__transcricao">“{a.transcricao}”</p> : <p className="pj-muted">Transcrição pendente</p>) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Painel lateral do projeto selecionado: trilha, situação, provas, briefing, como usar, linha do tempo e ações. */
export function Painel({ projeto: p, etapas, atualizacoes, perfil, source, hoje, onAtualizacao, onEtapaSalva, onEditarProjeto, onDirty, onBusy, onClose }: Props) {
  const toast = useToast()
  const e = etapaDoProjeto(etapas, p.id)
  const [pedido, setPedido] = useState<Pedido>({ n: 0 })
  const [destino, setDestino] = useState<'etapa' | 'briefing'>('etapa')
  const [concluindo, setConcluindo] = useState(false)
  const [sujo, setSujo] = useState(false)
  const aoSujar = useCallback((dirty: boolean) => { setSujo(dirty); onDirty(dirty) }, [onDirty])
  const itens = useMemo(() => (e ? daEtapa(atualizacoes, e.id) : []), [atualizacoes, e])

  // Sem etapa ainda, tudo o que se anexa é do briefing (a etapa nasce na primeira edição da situação).
  const alvo = e && destino === 'etapa' ? 'etapa' : 'briefing'
  // Com rascunho aberto o destino não muda (trocar descartaria o texto sem perguntar).
  const pedir = (para: 'etapa' | 'briefing', o: Omit<Pedido, 'n'> = {}) => { if (!sujo) setDestino(para); setPedido((cur) => ({ n: cur.n + 1, ...o })) }
  const anexosProva = provas(itens).flatMap((a) => a.anexos)
  const motivo = e ? motivoSemConcluir(perfil, e, atualizacoes) : null

  async function concluir() {
    if (!e || motivo || concluindo) return
    setConcluindo(true)
    try {
      await source.updateEtapa(e.id, { cr40f_status: STATUS.concluida })
      onEtapaSalva({ ...e, status: STATUS.concluida })
      toast({ tone: 'success', message: `Projeto ${p.codigo} marcado como Pronto.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível concluir. ${reasonText(reason)}` })
    } finally { setConcluindo(false) }
  }

  return (
    <div className="pj-painel__corpo">
      <div className="pj-painel__cabeca">
        <div className="pj-painel__titulos">
          <span className="pj-cod">{p.codigo}{p.area ? ` · ${p.area}` : ''}</span>
          <h2 className="pj-painel__titulo">{p.nome || 'Sem nome'}</h2>
        </div>
        {onClose ? <Button variant="ghost" size="compact" icon={<X size={16} />} aria-label="Fechar painel" title="Fechar (Esc)" onClick={onClose} /> : null}
      </div>
      {e ? <Trilha t={trilha(e, atualizacoes, hoje)} /> : null}
      <dl className="pj-props">
        <dt>Situação</dt><dd><StatusBadge tone={statusTone(e?.status ?? STATUS.ideia)}>{statusLabel(e?.status ?? STATUS.ideia)}</StatusBadge></dd>
        <dt>O que falta</dt><dd>{e?.nome.trim() || '—'}</dd>
        <dt>Responsável</dt><dd>{p.responsavel || '—'}</dd>
        {e ? (
          <>
            <dt>Prazo</dt><dd className="pj-num">{e.prazo ? formatDay(e.prazo) : 'Sem prazo'}{atrasada(e, hoje) ? <> <StatusBadge tone="danger">Vencido</StatusBadge></> : null}</dd>
            <dt>Andamento</dt><dd className="pj-num">{e.andamento}%</dd>
            <dt>PR</dt><dd>{e.linkPr ? <a className="pj-link" href={e.linkPr} target="_blank" rel="noreferrer">Abrir PR <ExternalLink size={12} aria-hidden="true" /></a> : '—'}</dd>
            <dt>PROD</dt><dd className="pj-num">{e.publicadoProd ? quando(e.publicadoProd) : 'ainda não'}</dd>
          </>
        ) : null}
      </dl>

      {e ? (
        <>
          <h3 className="pj-lbl">Provas · {anexosProva.length}</h3>
          <div className="pj-gal">
            {anexosProva.map((x) => (ehAudio(x.tipo) ? <AnexoAudio key={x.id} anexo={x} source={source} /> : <AnexoMiniatura key={x.id} anexo={x} source={source} />))}
            <button type="button" className="pj-gal__add" onClick={() => pedir('etapa', { prova: true })}><Plus size={14} aria-hidden="true" /> Adicionar</button>
          </div>
        </>
      ) : null}

      <h3 className="pj-lbl">Briefing do gestor</h3>
      <Briefing projeto={p} atualizacoes={atualizacoes} source={source} />

      <NovaAtualizacao key={`${p.id}:${alvo}`} semBotao pedido={pedido} projetoId={p.id} etapaId={alvo === 'etapa' && e ? e.id : null} autor={autorDoPerfil(perfil)} source={source}
        onSaved={onAtualizacao} onBusy={onBusy} onDirty={aoSujar} rotulo={alvo === 'etapa' ? 'Nova atualização' : 'Anexar ao briefing'} />

      {p.instrucoes.trim() ? (
        <details className="pj-como">
          <summary>Como usar</summary>
          <p className="pj-timeline__texto">{p.instrucoes}</p>
        </details>
      ) : null}

      {e ? (
        <>
          <h3 className="pj-lbl">Linha do tempo</h3>
          <Timeline itens={itens} source={source} vazio="Nenhuma atualização ainda." />
        </>
      ) : null}

      <div className="pj-painel__acoes">
        {e ? <Button icon={<Plus size={16} />} onClick={() => pedir('etapa')}>Nova atualização</Button> : null}
        <Button variant={e ? 'secondary' : 'primary'} icon={<Paperclip size={16} />} onClick={() => pedir('briefing')}>Anexar ao briefing</Button>
        <Button variant="secondary" icon={<Mic size={16} />} onClick={() => pedir(e ? 'etapa' : 'briefing', { gravar: true })}>Gravar áudio</Button>
        {e && e.status !== STATUS.concluida ? (
          <Button variant="secondary" icon={<Check size={16} />} disabled={Boolean(motivo)} loading={concluindo} title={motivo ? `Pronto: ${motivo}` : 'Marcar como Pronto'} onClick={() => void concluir()}>
            {motivo ? `Marcar como Pronto (${motivo})` : 'Marcar como Pronto'}
          </Button>
        ) : null}
        <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => onEditarProjeto(p.id)}>Editar projeto</Button>
      </div>
    </div>
  )
}
