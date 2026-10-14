import { CalendarClock, Car, CheckCircle2, ChevronRight, CircleAlert, FileWarning, Gauge, ListTodo, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState, MetricCard, StatusBadge, Surface } from '@betinhos/ui'
import { useQueryTexto } from '../../../nav/queryState'
import { formatBR } from '../data/dates'
import type { FrotaData, Kind } from '../data/types'
import { buildPendencias, PENDENCIA_LABEL, PENDENCIA_ORDEM, type Pendencia, type PendenciaTipo } from '../domain/pendencias'

const CURTO: Record<PendenciaTipo, string> = {
  aprovar: 'Aprovar manutenção',
  preventiva: 'Preventiva do plano',
  programar: 'Programar manutenção',
  agendada: 'Manutenção agendada',
  notificar: 'Notificar condutor',
  indicar: 'Indicar condutor',
  colisao: 'Colisão em aberto',
}

const ICONE: Record<Kind | 'preventiva', typeof Wrench> = { manutencao: Wrench, preventiva: Gauge, multa: FileWarning, colisao: Car }

type Urgencia = 'atrasado' | 'hoje' | 'breve'

function urgencia(item: Pendencia): Urgencia | null {
  if (item.dias === null || !item.prazo) return null
  return item.dias < 0 ? 'atrasado' : item.dias === 0 ? 'hoje' : 'breve'
}

const TOM: Record<Urgencia, 'danger' | 'warning' | 'info'> = { atrasado: 'danger', hoje: 'warning', breve: 'info' }

function Prazo({ item }: { item: Pendencia }) {
  const nivel = urgencia(item)
  if (!nivel || item.dias === null || !item.prazo) return null
  const texto = nivel === 'atrasado' ? `Atrasado ${-item.dias} d` : nivel === 'hoje' ? 'Vence hoje' : `Vence em ${item.dias} d`
  return <StatusBadge tone={TOM[nivel]} icon={<CalendarClock size={12} />} title={formatBR(item.prazo)}>{texto}</StatusBadge>
}

function Km({ item }: { item: Pendencia }) {
  if (item.prazo || item.faltamKm === null) return null
  const vencido = item.faltamKm < 0
  const texto = vencido ? `Vencido há ${Math.abs(item.faltamKm).toLocaleString('pt-BR')} km` : `Em ${item.faltamKm.toLocaleString('pt-BR')} km`
  return <StatusBadge tone={vencido ? 'danger' : 'info'} icon={<Gauge size={12} />}>{texto}</StatusBadge>
}

export function Pendencias({ data, today, onOpen, onOpenVeiculo }: { data: FrotaData; today: string; onOpen: (kind: Kind, id: string) => void; onOpenVeiculo: (id: string, secao: 'preventivas') => void }) {
  const itens = useMemo(() => buildPendencias(data, today), [data, today])
  const [filtroUrl, setFiltro] = useQueryTexto('filtro')
  const filtro = PENDENCIA_ORDEM.find((tipo) => tipo === filtroUrl) ?? ''

  if (!itens.length) return <EmptyState align="start" icon={<CheckCircle2 size={36} />} title="Nenhuma pendência de frota no momento">Aprovações, agendamentos, multas e colisões em aberto aparecem aqui.</EmptyState>

  const contagem = (tipo: PendenciaTipo) => itens.filter((item) => item.tipo === tipo).length
  const atrasadas = itens.filter((item) => urgencia(item) === 'atrasado').length
  const hoje = itens.filter((item) => urgencia(item) === 'hoje').length
  const presentes = PENDENCIA_ORDEM.filter((tipo) => contagem(tipo) > 0)
  const visiveis = presentes.filter((tipo) => !filtro || filtro === tipo)

  return (
    <div className="frota-pend">
      <div className="frota-kpis">
        <MetricCard icon={<ListTodo size={20} />} tone="info" label="Pendências" value={itens.length} />
        <MetricCard icon={<CircleAlert size={20} />} tone={atrasadas ? 'danger' : 'info'} label="Atrasadas" value={atrasadas} />
        <MetricCard icon={<CalendarClock size={20} />} tone={hoje ? 'warning' : 'info'} label="Vencem hoje" value={hoje} />
      </div>

      <div className="frota-chips" role="group" aria-label="Filtrar pendências">
        <button type="button" className="frota-chip" aria-pressed={!filtro} onClick={() => setFiltro('')}>Todas <b>{itens.length}</b></button>
        {presentes.map((tipo) => (
          <button key={tipo} type="button" className="frota-chip" aria-pressed={filtro === tipo} onClick={() => setFiltro(filtro === tipo ? '' : tipo)}>
            {CURTO[tipo]} <b>{contagem(tipo)}</b>
          </button>
        ))}
      </div>

      {visiveis.map((tipo) => {
        const grupo = itens.filter((item) => item.tipo === tipo)
        return (
          <Surface key={tipo} flush aria-label={PENDENCIA_LABEL[tipo]} className="frota-pend__grupo">
            <header className="frota-pend__head">
              <h2>{CURTO[tipo]}</h2>
              <StatusBadge tone="neutral">{grupo.length}</StatusBadge>
              <p>{PENDENCIA_LABEL[tipo]}</p>
            </header>
            <ul>
              {grupo.map((item) => {
                const Icone = ICONE[item.kind]
                const nivel = urgencia(item)
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <button type="button" className="frota-pend__item" data-urgencia={nivel ?? undefined} onClick={() => { if (item.kind === 'preventiva') { if (item.veiculoId) onOpenVeiculo(item.veiculoId, 'preventivas') } else onOpen(item.kind, item.id) }}>
                      <span className="frota-pend__icone" aria-hidden><Icone size={16} /></span>
                      <span className="frota-pend__texto">
                        <strong>{item.titulo}</strong>
                        <span>{[item.veiculo?.label, item.pessoa?.label].filter(Boolean).join(' · ') || 'Sem veículo informado'}</span>
                      </span>
                      <Prazo item={item} />
                      <Km item={item} />
                      <ChevronRight size={16} className="frota-pend__seta" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </Surface>
        )
      })}
    </div>
  )
}
