import type { MouseEvent, ReactNode } from 'react'
import { Button, Checkbox, StatusBadge } from '@betinhos/ui'
import { Building2, CalendarRange, ChevronRight, Pencil, UserPlus, UserRound, Users, Wrench } from 'lucide-react'
import type { VarianteCard } from '../../../nav/menu'
import './cardVariantes.css'

/** O que o card mostra, já lido da linha: serviço e manutenção no mesmo formato. */
export type DadosCard = {
  id: string
  manutencao: boolean
  /** ID do serviço (OS-1000) ou placa do veículo. */
  codigo: string
  abrirRotulo: string
  abrir: () => void
  status: ReactNode
  /** "22/11/2026 06:00" já formatado; null quando a visão não tem a data. */
  quando: string | null
  /** Trajeto do serviço ou descrição da manutenção. */
  titulo: string | null
  cliente: string | null
  /** `undefined`: a visão não tem motorista (ou a metadata não chegou); `null`: sem motorista. */
  motorista: string | null | undefined
  /** Grau · janela (manutenção). */
  meta: string | null
  /** Primeiro nome de cada passageiro; `null` quando a visão não tem a coluna de passageiros. */
  pax: string[] | null
  alertas: { texto: string; tom: 'perigo' | 'aviso' }[]
  acao: { rotulo: string; onClick: () => void }
  extra?: ReactNode
  /** Ação rápida quando falta motorista (abre a escolha do motorista). */
  atribuir?: () => void
}

type Props = { variante: VarianteCard; d: DadosCard; selecionado: boolean; onToggle: () => void }

const partes = (quando: string | null) => {
  const [data, hora] = (quando ?? '').split(' ')
  return { data: data || null, hora: hora || null }
}

const hojeSp = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** Rótulo do dia a partir de "dd/mm/aaaa": "Hoje · ter 24/11", "Amanhã · qua 25/11", "sáb 22/11". */
/** Dias entre "dd/mm/aaaa" e hoje em São Paulo (negativo = passado); `null` se a data não for legível. */
export function diasAteHoje(dia: string): number | null {
  const [dd, mm, aaaa] = dia.split('/').map(Number)
  if (!dd || !mm || !aaaa) return null
  const [hd, hm, ha] = hojeSp().split('/').map(Number)
  return Math.round((new Date(aaaa, mm - 1, dd).getTime() - new Date(ha, hm - 1, hd).getTime()) / 86_400_000)
}

const relacao = (dia: string | null) => {
  const diff = dia ? diasAteHoje(dia) : null
  return diff == null ? 'futuro' : diff === 0 ? 'hoje' : diff < 0 ? 'passado' : 'futuro'
}

export function rotuloDia(dia: string): string {
  const [dd, mm, aaaa] = dia.split('/').map(Number)
  const diff = diasAteHoje(dia)
  if (diff == null) return dia
  const data = new Date(aaaa, mm - 1, dd)
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const curto = `${semana} ${dia.slice(0, 5)}`
  return diff === 0 ? `Hoje · ${curto}` : diff === 1 ? `Amanhã · ${curto}` : diff === -1 ? `Ontem · ${curto}` : curto
}

/** Separador entre cards quando o dia muda. */
export function SeparadorDia({ dia, total }: { dia: string; total: number }) {
  return <li className="gv-dia" data-dia={relacao(dia)}><span>{rotuloDia(dia)}</span><small>{total} {total === 1 ? 'item' : 'itens'}</small></li>
}

/** Até 2 primeiros nomes e o resto como contagem: "Diego, Helena +1". */
export const resumoPax = (pax: string[]) => (pax.length > 2 ? `${pax.slice(0, 2).join(', ')} +${pax.length - 2}` : pax.join(', '))

const ignorarAlvo = (event: MouseEvent<HTMLElement>) => Boolean((event.target as HTMLElement).closest('button, input, a, label'))

function Alertas({ d }: { d: DadosCard }) {
  const semMotorista = d.motorista === null
  if (!semMotorista && d.alertas.length === 0) return null
  return (
    <span className="gv-alertas">
      {semMotorista ? <StatusBadge tone="warning">Sem motorista</StatusBadge> : null}
      {d.alertas.map((a) => <span key={a.texto} className={`gv-alerta gv-alerta--${a.tom}`}>{a.texto}</span>)}
    </span>
  )
}

function Selecao({ d, selecionado, onToggle }: Omit<Props, 'variante'>) {
  return <Checkbox label={<span className="gr-sr">Selecionar {d.manutencao ? 'manutenção' : 'serviço'} {d.codigo}</span>} checked={selecionado} onChange={onToggle} />
}

function Codigo({ d }: { d: DadosCard }) {
  return (
    <button type="button" className="gv-id" aria-label={d.abrirRotulo} onClick={d.abrir}>
      {d.manutencao ? <Wrench size={14} aria-hidden="true" /> : null}{d.codigo}
    </button>
  )
}

/** Uma das 3 variações do card do serviço no celular (laboratório de design). */
export function CardVariante({ variante, d, selecionado, onToggle }: Props) {
  const passado = relacao(d.quando?.split(' ')[0] ?? null) === 'passado'
  const classe = `gv-card gv-card--${variante}${d.manutencao ? ' gv-card--manut' : ''}${selecionado ? ' is-selected' : ''}${passado ? ' is-passado' : ''}`
  const alternar = (event: MouseEvent<HTMLLIElement>) => { if (!ignorarAlvo(event)) onToggle() }
  const { data, hora } = partes(d.quando)

  if (variante === 'v1') {
    return (
      <li className={classe} onClick={alternar}>
        <div className="gv-v1__head"><Selecao d={d} selecionado={selecionado} onToggle={onToggle} /><Codigo d={d} />{d.extra}{d.status}</div>
        {d.quando ? <p className="gv-v1__quando"><strong>{d.quando}</strong>{d.cliente ? ` · ${d.cliente}` : ''}</p> : null}
        {d.titulo ? <p className="gv-v1__titulo">{d.titulo}</p> : null}
        {d.meta ? <p className="gv-sec">{d.meta}</p> : null}
        <div className="gv-v1__pe">
          {d.motorista ? <p className="gv-sec">Motorista: <strong>{d.motorista}</strong></p> : <Alertas d={d} />}
          <Button variant="ghost" size="compact" icon={<Pencil size={14} aria-hidden="true" />} onClick={d.acao.onClick}>{d.acao.rotulo}</Button>
        </div>
        {d.motorista && d.alertas.length > 0 ? <Alertas d={d} /> : null}
      </li>
    )
  }

  const tom = d.alertas.some((a) => a.tom === 'perigo') ? 'perigo' : d.motorista === null || d.alertas.length > 0 ? 'aviso' : 'normal'

  if (variante === 'v2') {
    // Linha compacta no estilo do Resumo Operacional: hora, "#ID · motorista", trajeto, status em pílula e o alerta em texto.
    const avisos = [...d.alertas, ...(d.motorista === null ? [{ texto: 'Sem motorista', tom: 'aviso' as const }] : [])]
    return (
      <li className={classe} data-tom={tom} onClick={alternar}>
        <span className="gv-v2__hora">{hora}{data ? <small>{data.slice(0, 5)}</small> : null}</span>
        <div className="gv-v2__corpo">
          <p className="gv-v2__titulo"><Codigo d={d} />{d.extra}{d.motorista ?? d.cliente ? <span className="gv-v2__quem">{d.motorista ?? d.cliente}</span> : null}</p>
          <button type="button" className="gv-v2__linha" aria-label={`${d.acao.rotulo}: ${d.codigo}`} onClick={d.acao.onClick}>
            <span className="gv-v2__rota">{d.titulo ?? '—'}</span>
            {d.cliente || d.meta ? <span className="gv-sec">{[d.cliente, d.meta].filter(Boolean).join(' · ')}</span> : null}
          </button>
          {avisos.length > 0 ? <span className="gv-v2__avisos">{avisos.map((a) => <span key={a.texto} className={`gv-v2__aviso gv-v2__aviso--${a.tom}`}>{a.texto}</span>)}</span> : null}
        </div>
        <div className="gv-v2__lado">{d.status}<Selecao d={d} selecionado={selecionado} onToggle={onToggle} /></div>
      </li>
    )
  }

  if (variante === 'v4') {
    // V3 (trilho da hora com a cor do estado) com a leitura do Resumo Operacional: "#ID · quem", trajeto, pílula e alerta em texto.
    const avisos = [...d.alertas, ...(d.motorista === null ? [{ texto: 'Sem motorista', tom: 'aviso' as const }] : [])]
    return (
      <li className={`${classe} gv-card--v3`} data-tom={tom} onClick={alternar}>
        <div className="gv-v3__trilho gv-v4__trilho">
          {hora ? <span className="gv-v3__hora">{hora}</span> : null}
          <Selecao d={d} selecionado={selecionado} onToggle={onToggle} />
        </div>
        <div className="gv-v4__conteudo">
          <div className="gv-v4__topo">
            <p className="gv-v2__titulo"><Codigo d={d} />{d.extra}</p>
            {d.status}
          </div>
          <button type="button" className="gv-corpo" aria-label={`${d.acao.rotulo}: ${d.codigo}`} onClick={d.acao.onClick}>
            <span className="gv-v4__rota">{d.titulo ?? '—'}</span>
            <span className="gv-v4__campos">
              {d.pax && d.pax.length > 0 ? <span className="gv-v4__campo" title={d.pax.join(', ')}><Users size={13} aria-label="Passageiros" /><span>{resumoPax(d.pax)}</span></span> : null}
              {d.manutencao ? (d.meta ? <span className="gv-v4__campo" title="Janela"><CalendarRange size={13} aria-label="Janela" /><span>{d.meta}</span></span> : null) : <span className="gv-v4__campo" title="Cliente"><Building2 size={13} aria-label="Cliente" /><span>{d.cliente ?? '—'}</span></span>}
              {d.motorista ? <span className="gv-v4__campo" title="Motorista"><UserRound size={13} aria-label="Motorista" /><span>{d.motorista}</span></span> : null}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {avisos.length > 0 || d.atribuir ? (
            <div className="gv-v4__pe">
              <span className="gv-v2__avisos">{avisos.map((a) => <span key={a.texto} className={`gv-v2__aviso gv-v2__aviso--${a.tom}`}>{a.texto}</span>)}</span>
              {d.atribuir ? <Button variant="action" size="compact" icon={<UserPlus size={14} aria-hidden="true" />} aria-label={`Atribuir motorista: ${d.codigo}`} onClick={d.atribuir}>Atribuir</Button> : null}
            </div>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <li className={classe} data-tom={tom} onClick={alternar}>
      <div className="gv-v3__trilho">
        {hora ? <span className="gv-v3__hora">{hora}</span> : null}
        {data ? <span className="gv-v3__data">{data.slice(0, 5)}</span> : null}
        <Selecao d={d} selecionado={selecionado} onToggle={onToggle} />
      </div>
      <div className="gv-v3__conteudo">
        <div className="gv-v3__topo"><Codigo d={d} />{d.extra}{d.status}</div>
        <button type="button" className="gv-corpo" aria-label={`${d.acao.rotulo}: ${d.codigo}`} onClick={d.acao.onClick}>
          {d.titulo ? <span className="gv-v3__titulo">{d.titulo}</span> : null}
          <span className="gv-sec">{[d.cliente, d.meta].filter(Boolean).join(' · ')}</span>
          {d.motorista ? <span className="gv-sec"><strong>{d.motorista}</strong></span> : null}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <Alertas d={d} />
      </div>
    </li>
  )
}
