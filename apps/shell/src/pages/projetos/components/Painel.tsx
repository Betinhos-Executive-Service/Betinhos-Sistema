import { useMemo, useState } from 'react'
import { Button, StatusBadge, useToast } from '@betinhos/ui'
import { Check, ExternalLink, Mic, Pencil, Plus, X } from 'lucide-react'
import { formatDay } from '../../../app/format'
import type { Source } from '../data/source'
import { STATUS, autorDoPerfil, statusLabel, statusTone } from '../domain/choices'
import { ehAudio } from '../domain/anexos'
import { motivoSemConcluir, trilha } from '../domain/painel'
import { atrasada, daEtapa, doProjeto, etapasDo, provas } from '../domain/regras'
import type { Atualizacao, Etapa, Perfil, Projeto } from '../domain/types'
import { AnexoAudio, AnexoMiniatura } from './AnexoMiniatura'
import type { Selecao } from './Lista'
import { NovaAtualizacao } from './NovaAtualizacao'
import { Timeline } from './Timeline'
import { Trilha } from './Trilha'

type Props = {
  selecao: NonNullable<Selecao>
  projetos: Projeto[]
  etapas: Etapa[]
  atualizacoes: Atualizacao[]
  perfil: Perfil
  source: Source
  hoje: string
  onSelect: (s: Selecao) => void
  onAtualizacao: (a: Atualizacao) => void
  onEtapaSalva: (e: Etapa) => void
  onEditarEtapa: (id: string) => void
  onNovaEtapa: () => void
  onEditarProjeto: (id: string) => void
  onDirty: (dirty: boolean) => void
  onBusy: (busy: boolean) => void
  /** Botão X (painel fixo); no drawer estreito o X é do próprio drawer. */
  onClose?: () => void
}

const quando = (iso: string) => `${formatDay(iso)} ${iso.slice(11, 16)}`
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Briefing do gestor: texto do projeto e anexos fora de etapa (áudio com transcrição ou "Transcrição pendente"). */
function Briefing({ projeto, atualizacoes, source }: { projeto: Projeto; atualizacoes: Atualizacao[]; source: Source }) {
  const itens = doProjeto(atualizacoes, projeto.id).filter((a) => !a.etapaId)
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

function Cabeca({ eyebrow, titulo, onClose }: { eyebrow: string; titulo: string; onClose?: () => void }) {
  return (
    <div className="pj-painel__cabeca">
      <div className="pj-painel__titulos">
        <span className="pj-cod">{eyebrow}</span>
        <h2 className="pj-painel__titulo">{titulo}</h2>
      </div>
      {onClose ? <Button variant="ghost" size="compact" icon={<X size={16} />} aria-label="Fechar painel" title="Fechar (Esc)" onClick={onClose} /> : null}
    </div>
  )
}

/** Painel lateral da etapa ou do projeto selecionado: trilha, propriedades, provas, briefing, linha do tempo e ações. */
export function Painel(props: Props) {
  const { selecao, projetos, etapas } = props
  if (selecao.tipo === 'etapa') {
    const e = etapas.find((x) => x.id === selecao.id)
    const p = e ? projetos.find((x) => x.id === e.projetoId) : undefined
    if (!e || !p) return <p className="pj-muted">Etapa não encontrada. Atualize a lista.</p>
    return <PainelEtapa {...props} etapa={e} projeto={p} />
  }
  const p = projetos.find((x) => x.id === selecao.id)
  if (!p) return <p className="pj-muted">Projeto não encontrado. Atualize a lista.</p>
  return <PainelProjeto {...props} projeto={p} />
}

function PainelEtapa({ etapa: e, projeto: p, atualizacoes, perfil, source, hoje, onAtualizacao, onEtapaSalva, onEditarEtapa, onDirty, onBusy, onClose }: Props & { etapa: Etapa; projeto: Projeto }) {
  const toast = useToast()
  const [pedido, setPedido] = useState<{ n: number; prova?: boolean; gravar?: boolean }>({ n: 0 })
  const [concluindo, setConcluindo] = useState(false)
  const pedir = (o: { prova?: boolean; gravar?: boolean } = {}) => setPedido((cur) => ({ n: cur.n + 1, ...o }))
  const itens = useMemo(() => daEtapa(atualizacoes, e.id), [atualizacoes, e.id])
  const anexosProva = provas(itens).flatMap((a) => a.anexos)
  const t = trilha(e, atualizacoes, hoje)
  const motivo = motivoSemConcluir(perfil, e, atualizacoes)

  async function concluir() {
    if (motivo || concluindo) return
    setConcluindo(true)
    try {
      await source.updateEtapa(e.id, { cr40f_status: STATUS.concluida })
      onEtapaSalva({ ...e, status: STATUS.concluida })
      toast({ tone: 'success', message: `Etapa ${e.codigo} concluída.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível concluir. ${reasonText(reason)}` })
    } finally { setConcluindo(false) }
  }

  return (
    <div className="pj-painel__corpo">
      <Cabeca eyebrow={`${e.codigo} · ${p.nome}`} titulo={e.nome || 'Sem nome'} onClose={onClose} />
      <Trilha t={t} grande />
      <dl className="pj-props">
        <dt>Status</dt><dd><StatusBadge tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusBadge></dd>
        <dt>Prazo</dt><dd className="pj-num">{e.prazo ? formatDay(e.prazo) : 'Sem prazo'}{atrasada(e, hoje) ? <> <StatusBadge tone="danger">Vencido</StatusBadge></> : null}</dd>
        <dt>Andamento</dt><dd className="pj-num">{e.andamento}%</dd>
        <dt>PR</dt><dd>{e.linkPr ? <a className="pj-link" href={e.linkPr} target="_blank" rel="noreferrer">Abrir PR <ExternalLink size={12} aria-hidden="true" /></a> : '—'}</dd>
        <dt>PROD</dt><dd className="pj-num">{e.publicadoProd ? quando(e.publicadoProd) : 'ainda não'}</dd>
      </dl>
      {e.descricao ? <p className="pj-timeline__texto">{e.descricao}</p> : null}

      <h3 className="pj-lbl">Provas · {anexosProva.length}</h3>
      <div className="pj-gal">
        {anexosProva.map((x) => (ehAudio(x.tipo) ? <AnexoAudio key={x.id} anexo={x} source={source} /> : <AnexoMiniatura key={x.id} anexo={x} source={source} />))}
        <button type="button" className="pj-gal__add" onClick={() => pedir({ prova: true })}><Plus size={14} aria-hidden="true" /> Adicionar</button>
      </div>

      <h3 className="pj-lbl">Briefing do gestor</h3>
      <Briefing projeto={p} atualizacoes={atualizacoes} source={source} />

      <NovaAtualizacao key={e.id} semBotao pedido={pedido} projetoId={p.id} etapaId={e.id} autor={autorDoPerfil(perfil)} source={source} onSaved={onAtualizacao} onBusy={onBusy} onDirty={onDirty} />

      <h3 className="pj-lbl">Linha do tempo</h3>
      <Timeline itens={itens} source={source} rotulo="Atualizações da etapa" vazio="Nenhuma atualização nesta etapa ainda." />

      <div className="pj-painel__acoes">
        <Button icon={<Plus size={16} />} onClick={() => pedir()}>Nova atualização</Button>
        <Button variant="secondary" icon={<Mic size={16} />} onClick={() => pedir({ gravar: true })}>Gravar áudio</Button>
        {e.status === STATUS.concluida ? null : (
          <Button variant="secondary" icon={<Check size={16} />} disabled={Boolean(motivo)} loading={concluindo} title={motivo ? `Concluir: ${motivo}` : 'Marcar como Concluída'} onClick={() => void concluir()}>
            {motivo ? `Concluir (${motivo})` : 'Concluir'}
          </Button>
        )}
        <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => onEditarEtapa(e.id)}>Editar etapa</Button>
      </div>
    </div>
  )
}

function PainelProjeto({ projeto: p, etapas, atualizacoes, perfil, source, hoje, onSelect, onAtualizacao, onNovaEtapa, onEditarProjeto, onDirty, onBusy, onClose }: Props & { projeto: Projeto }) {
  const [pedido, setPedido] = useState<{ n: number; gravar?: boolean }>({ n: 0 })
  const pedir = (o: { gravar?: boolean } = {}) => setPedido((cur) => ({ n: cur.n + 1, ...o }))
  const lista = useMemo(() => etapasDo(etapas, p.id), [etapas, p.id])
  const codigos = useMemo(() => new Map(lista.map((x) => [x.id, x.codigo])), [lista])
  const dasEtapas = doProjeto(atualizacoes, p.id).filter((a) => a.etapaId)
  const concluidas = lista.filter((x) => x.status === STATUS.concluida).length

  return (
    <div className="pj-painel__corpo">
      <Cabeca eyebrow={`${p.codigo}${p.area ? ` · ${p.area}` : ''}`} titulo={p.nome || 'Sem nome'} onClose={onClose} />
      <dl className="pj-props">
        <dt>Etapas</dt><dd className="pj-num">{lista.length ? `${concluidas} de ${lista.length} concluídas` : 'Sem etapas'}</dd>
        <dt>Responsável</dt><dd>{p.responsavel || '—'}</dd>
      </dl>

      <h3 className="pj-lbl">Briefing do gestor</h3>
      <Briefing projeto={p} atualizacoes={atualizacoes} source={source} />
      <NovaAtualizacao key={p.id} semBotao pedido={pedido} projetoId={p.id} etapaId={null} autor={autorDoPerfil(perfil)} source={source} onSaved={onAtualizacao} onBusy={onBusy} onDirty={onDirty} rotulo="Anexar ao briefing" />

      {p.instrucoes.trim() ? <><h3 className="pj-lbl">Como usar</h3><p className="pj-timeline__texto">{p.instrucoes}</p></> : null}

      <h3 className="pj-lbl">Etapas · {lista.length}</h3>
      {lista.length ? (
        <ul className="pj-painel__etapas">
          {lista.map((x) => (
            <li key={x.id}>
              <button type="button" className="pj-painel__etapa" onClick={() => onSelect({ tipo: 'etapa', id: x.id })}>
                <span className="pj-cod">{x.codigo}</span><span className="pj-linha__nome">{x.nome || 'Sem nome'}</span><Trilha t={trilha(x, atualizacoes, hoje)} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="pj-muted">Nenhuma etapa ainda. Os agentes criam a etapa em Ideia quando o brief é confirmado.</p>}

      <h3 className="pj-lbl">Linha do tempo</h3>
      <Timeline itens={dasEtapas} source={source} codigos={codigos} vazio="Nenhuma atualização nas etapas ainda." />

      <div className="pj-painel__acoes">
        <Button icon={<Plus size={16} />} onClick={() => pedir()}>Anexar ao briefing</Button>
        <Button variant="secondary" icon={<Mic size={16} />} onClick={() => pedir({ gravar: true })}>Gravar áudio</Button>
        <Button variant="secondary" icon={<Plus size={16} />} onClick={onNovaEtapa}>Nova etapa</Button>
        <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => onEditarProjeto(p.id)}>Editar projeto</Button>
      </div>
    </div>
  )
}
