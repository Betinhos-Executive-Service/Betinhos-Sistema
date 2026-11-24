import type { MouseEvent, ReactNode } from 'react'
import { Button, Checkbox } from '@betinhos/ui'
import { Building2, CalendarClock, CalendarRange, Route, UserPlus, UserRound, Users, Wrench } from 'lucide-react'
import './cardServico.css'

/** O que o card do celular mostra, já lido da linha: serviço e manutenção no mesmo formato. */
export type DadosCard = {
  id: string
  manutencao: boolean
  /** ID do serviço (OS-1000) ou placa do veículo. */
  codigo: string
  abrirRotulo: string
  /** Serviço: abre o Formulário Geral; manutenção: abre a gaveta dela. */
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
  /** Primeiro nome de cada passageiro; `null` quando ainda não carregou ou não se aplica (manutenção). */
  pax: string[] | null
  alertas: { texto: string; tom: 'perigo' | 'aviso' }[]
  /** Slot depois do código (comprovantes de recebimento). */
  extra?: ReactNode
  /** Ação rápida quando falta motorista (serviço). */
  atribuir?: () => void
  /** Ação da manutenção: "Programar" ou "Reprogramar" (motorista e saída). */
  programar?: { rotulo: string; onClick: () => void }
}

const hojeSp = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

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

/** Rótulo do dia a partir de "dd/mm/aaaa": "Hoje · ter 24/11", "Amanhã · qua 25/11", "sáb 22/11". */
export function rotuloDia(dia: string): string {
  const [dd, mm, aaaa] = dia.split('/').map(Number)
  const diff = diasAteHoje(dia)
  if (diff == null) return dia
  const semana = new Date(aaaa, mm - 1, dd).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const curto = `${semana} ${dia.slice(0, 5)}`
  return diff === 0 ? `Hoje · ${curto}` : diff === 1 ? `Amanhã · ${curto}` : diff === -1 ? `Ontem · ${curto}` : curto
}

/** Separador entre cards quando o dia muda; hoje em destaque, passado apagado. */
export function SeparadorDia({ dia, total }: { dia: string; total: number }) {
  return <li className="gc-dia" data-dia={relacao(dia)}><span>{rotuloDia(dia)}</span><small>{total} {total === 1 ? 'item' : 'itens'}</small></li>
}

/** Até 2 primeiros nomes e o resto como contagem: "Diego, Helena +1". */
export const resumoPax = (pax: string[]) => (pax.length > 2 ? `${pax.slice(0, 2).join(', ')} +${pax.length - 2}` : pax.join(', '))

const ignorarAlvo = (event: MouseEvent<HTMLElement>) => Boolean((event.target as HTMLElement).closest('button, input, a, label'))

type Props = { d: DadosCard; selecionado: boolean; onToggle: () => void; onContextMenu?: (event: MouseEvent<HTMLElement>) => void }

/**
 * Card do serviço no celular: trilho da hora com a cor do estado; trajeto e passageiros em primeiro plano; cliente e
 * motorista numa linha discreta; OS, alertas e "Atribuir" no pé. Tocar no card abre o serviço; selecionar é pela caixa.
 */
export function CardServico({ d, selecionado, onToggle, onContextMenu }: Props) {
  const hora = d.quando?.split(' ')[1] ?? null
  const passado = relacao(d.quando?.split(' ')[0] ?? null) === 'passado'
  const avisos = [...d.alertas, ...(d.motorista === null ? [{ texto: 'Sem motorista', tom: 'aviso' as const }] : [])]
  const tom = d.alertas.some((a) => a.tom === 'perigo') ? 'perigo' : avisos.length > 0 ? 'aviso' : 'normal'
  const classe = `gc-card${d.manutencao ? ' gc-card--manut' : ''}${selecionado ? ' is-selected' : ''}${passado ? ' is-passado' : ''}`
  return (
    <li className={classe} data-tom={tom} onClick={(event) => { if (!ignorarAlvo(event)) d.abrir() }} onContextMenu={onContextMenu}>
      <div className="gc-trilho">
        {hora ? <span className="gc-hora">{hora}</span> : null}
        <Checkbox label={<span className="gr-sr">Selecionar {d.manutencao ? 'manutenção' : 'serviço'} {d.codigo}</span>} checked={selecionado} onChange={onToggle} />
      </div>
      <div className="gc-conteudo">
        <div className="gc-topo">
          <button type="button" className="gc-abrir" aria-label={d.abrirRotulo} onClick={d.abrir}>
            {d.manutencao ? <><Wrench size={14} aria-hidden="true" /><span className="gc-titulo">{d.titulo ?? '—'}</span></>
              : d.pax && d.pax.length > 0 ? <><Users size={15} aria-label="Passageiros" /><span className="gc-titulo" title={d.pax.join(', ')}>{resumoPax(d.pax)}</span></>
              : <><Users size={15} aria-label="Passageiros" /><span className="gc-titulo gc-titulo--vazio">{d.pax ? 'Sem passageiro' : '…'}</span></>}
          </button>
          {d.status}
        </div>
        {d.manutencao ? null : <p className="gc-rota" title="Trajeto"><Route size={14} aria-label="Trajeto" /><span>{d.titulo ?? '—'}</span></p>}
        <p className="gc-meta">
          {d.manutencao ? (d.meta ? <span title="Janela"><CalendarRange size={13} aria-label="Janela" />{d.meta}</span> : null) : <span title="Cliente"><Building2 size={13} aria-label="Cliente" />{d.cliente ?? '—'}</span>}
          {d.motorista ? <span title="Motorista"><UserRound size={13} aria-label="Motorista" />{d.motorista}</span> : null}
        </p>
        <div className="gc-pe">
          <span className="gc-os">{d.codigo}{d.extra}</span>
          <span className="gc-avisos">{avisos.map((a) => <span key={a.texto} className={`gc-aviso gc-aviso--${a.tom}`}>{a.texto}</span>)}</span>
          {d.programar ? <Button variant={d.motorista === null ? 'action' : 'secondary'} size="compact" icon={<CalendarClock size={14} aria-hidden="true" />} onClick={d.programar.onClick}>{d.programar.rotulo}</Button> : null}
          {d.atribuir ? <Button variant="action" size="compact" icon={<UserPlus size={14} aria-hidden="true" />} aria-label={`Atribuir motorista: ${d.codigo}`} onClick={d.atribuir}>Atribuir</Button> : null}
        </div>
      </div>
    </li>
  )
}
