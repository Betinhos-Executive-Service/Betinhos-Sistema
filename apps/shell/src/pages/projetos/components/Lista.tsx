import type { KeyboardEvent } from 'react'
import { Skeleton } from '@betinhos/ui'
import { ChevronDown, ChevronRight, Film, Image, Mic } from 'lucide-react'
import { ehAudio } from '../domain/anexos'
import { FASES, acaoPendente, quandoCurto, tipoDoAnexo, trilha, ultimaDaEtapa, type Grupo } from '../domain/painel'
import { daEtapa, provas } from '../domain/regras'
import type { Atualizacao, Etapa } from '../domain/types'
import { AvatarAutor } from './AvatarAutor'
import { Trilha } from './Trilha'

export type Selecao = { tipo: 'etapa' | 'projeto'; id: string } | null

type Props = {
  grupos: Grupo[]
  atualizacoes: Atualizacao[]
  hoje: string
  selecao: Selecao
  onSelect: (s: Selecao) => void
  recolhidos: Set<string>
  onToggle: (projetoId: string) => void
}

const resumo = (a: Atualizacao) => a.texto || (a.anexos.some((x) => ehAudio(x.tipo)) ? 'Áudio' : a.anexos.length ? 'Anexo' : 'Atualização')
const ICONE = { print: Image, video: Film, audio: Mic }

/** Move o foco entre as linhas com as setas (Home/End vão às pontas). */
function navegar(ev: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return
  const linhas = Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('[data-linha]'))
  const i = linhas.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  ev.preventDefault()
  const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? linhas.length - 1 : Math.min(linhas.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)))
  linhas[j]?.focus()
}

function LinhaEtapa({ e, atualizacoes, hoje, ativa, onSelect }: { e: Etapa; atualizacoes: Atualizacao[]; hoje: string; ativa: boolean; onSelect: () => void }) {
  const t = trilha(e, atualizacoes, hoje)
  const anexos = provas(daEtapa(atualizacoes, e.id)).flatMap((a) => a.anexos)
  const ultima = ultimaDaEtapa(atualizacoes, e.id)
  const acao = acaoPendente(e, atualizacoes)
  return (
    <button type="button" data-linha className={`pj-linha pj-linha--etapa${ativa ? ' is-ativa' : ''}`} aria-current={ativa || undefined} onClick={onSelect}
      aria-label={`${e.codigo} ${e.nome || 'Sem nome'}. ${t.descricao}.${anexos.length ? ` ${anexos.length} ${anexos.length === 1 ? 'prova' : 'provas'}.` : ''}${acao ? ` Pendente: ${acao}.` : ''}`}>
      <span className="pj-cod">{e.codigo}</span>
      <span className="pj-linha__nome">{e.nome || 'Sem nome'}</span>
      <span className="pj-linha__trilha"><Trilha t={t} /></span>
      <span className="pj-linha__provas" aria-hidden="true">
        {anexos.length ? anexos.slice(0, 3).map((x) => { const Icone = ICONE[tipoDoAnexo(x) ?? 'print']; return <span key={x.id} className="pj-mini"><Icone size={12} /></span> }) : <span className="pj-muted">—</span>}
        {anexos.length > 3 ? <span className="pj-muted">+{anexos.length - 3}</span> : null}
      </span>
      <span className="pj-linha__ativ">
        {ultima ? <><AvatarAutor autor={ultima.autor} /><span className="pj-linha__txt">{resumo(ultima)} <span className="pj-muted">· {quandoCurto(ultima.data, hoje)}</span></span></> : <span className="pj-muted">Sem atividade</span>}
        {acao ? <span className="pj-need">{acao}</span> : null}
      </span>
    </button>
  )
}

/** Lista horizontal agrupada por projeto: cabeçalho com barra de progresso e linhas de etapa com a trilha de 5 fases. */
export function Lista({ grupos, atualizacoes, hoje, selecao, onSelect, recolhidos, onToggle }: Props) {
  return (
    <div className="pj-lista" role="region" aria-label="Projetos e etapas" onKeyDown={navegar}>
      <div className="pj-linha pj-linha--cab" aria-hidden="true">
        <span>Código</span><span>Projeto / etapa</span>
        <span className="pj-linha__trilha pj-fases">{FASES.map((f) => <span key={f}>{f}</span>)}</span>
        <span className="pj-linha__provas">Provas</span><span className="pj-linha__ativ">Última atividade</span>
      </div>
      {grupos.map((g) => {
        const p = g.projeto
        const fechado = recolhidos.has(p.id)
        const ativo = selecao?.tipo === 'projeto' && selecao.id === p.id
        const meta = g.paradoHa != null ? `Parado há ${g.paradoHa} dias`
          : !g.total ? (g.ultima ? `Briefing do gestor · ${quandoCurto(g.ultima.data, hoje)}` : 'Sem etapas')
          : `${g.concluidas} de ${g.total}${g.ultima ? ` · ${quandoCurto(g.ultima.data, hoje)}` : ''}`
        return (
          <section key={p.id} className="pj-grupo" aria-label={`${p.codigo} ${p.nome}`}>
            <div className={`pj-grupo__head${ativo ? ' is-ativa' : ''}`}>
              <button type="button" className="pj-grupo__toggle" aria-expanded={!fechado} aria-label={`${fechado ? 'Mostrar' : 'Recolher'} etapas de ${p.codigo}`} onClick={() => onToggle(p.id)} disabled={!g.etapas.length}>
                {fechado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <button type="button" data-linha className="pj-linha pj-linha--grupo" aria-current={ativo || undefined} onClick={() => onSelect({ tipo: 'projeto', id: p.id })}
                aria-label={`Projeto ${p.codigo} ${p.nome}${p.area ? `, ${p.area}` : ''}. ${meta}.${g.acao ? ` Pendente: ${g.acao}.` : ''}`}>
                <span className="pj-cod">{p.codigo}</span>
                <span className="pj-linha__nome">{p.nome || 'Sem nome'}{p.area ? <span className="pj-muted pj-area"> · {p.area}</span> : null}</span>
                <span className="pj-linha__trilha">
                  <span className="pj-barra" aria-hidden="true">
                    <span className="pj-barra__ok" style={{ width: `${g.barra.ok * 100}%` }} />
                    <span className="pj-barra__dev" style={{ width: `${g.barra.dev * 100}%` }} />
                    <span className="pj-barra__fazendo" style={{ width: `${g.barra.fazendo * 100}%` }} />
                  </span>
                </span>
                <span className="pj-linha__provas" />
                <span className={`pj-linha__ativ${g.paradoHa != null ? ' pj-parado' : ''}`}>
                  <span className="pj-linha__txt">{meta}</span>
                  {g.acao ? <span className="pj-need">{g.acao}</span> : null}
                </span>
              </button>
            </div>
            {fechado ? null : g.etapas.map((e) => (
              <LinhaEtapa key={e.id} e={e} atualizacoes={atualizacoes} hoje={hoje} ativa={selecao?.tipo === 'etapa' && selecao.id === e.id} onSelect={() => onSelect({ tipo: 'etapa', id: e.id })} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

export function ListaCarregando() {
  return (
    <div className="pj-lista" aria-busy="true" aria-label="Carregando projetos">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`pj-linha${i % 3 === 0 ? ' pj-linha--grupo' : ''}`}>
          <Skeleton width={56} /><Skeleton width={i % 3 === 0 ? 180 : 140} /><span className="pj-linha__trilha"><Skeleton height={20} shape="rect" /></span><span className="pj-linha__provas"><Skeleton width={40} /></span><span className="pj-linha__ativ"><Skeleton width={120} /></span>
        </div>
      ))}
    </div>
  )
}
