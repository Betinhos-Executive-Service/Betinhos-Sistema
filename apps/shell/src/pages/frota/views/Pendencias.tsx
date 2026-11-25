import { CalendarClock, CheckCircle2, CircleAlert, Kanban, List, ListTodo } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Alert, EmptyState, MetricCard, SegmentedControl } from '@betinhos/ui'
import { useQueryTexto } from '../../../nav/queryState'
import type { LoadResult } from '../data/source'
import type { FrotaData, Kind } from '../data/types'
import { buildPendencias, PENDENCIA_ORDEM, type Pendencia, type PendenciaTipo } from '../domain/pendencias'
import { PendenciasLista, PendenciasQuadro } from './PendenciasModos'
import { CURTO, ordenar, urgencia } from './pendenciasComum'

type Area = { id: string; titulo: string; tipos: PendenciaTipo[] }
const AREAS: Area[] = [
  { id: 'manutencao', titulo: 'Manutenção', tipos: ['prioridade', 'atrasada', 'preventiva', 'encaixar', 'reincidencia', 'custo', 'hodometro'] },
  { id: 'multas', titulo: 'Multas', tipos: ['notificar', 'indicar'] },
  { id: 'colisoes', titulo: 'Colisões', tipos: ['colisao'] },
]

type Modo = 'lista' | 'quadro'
const MODOS: { value: Modo; label: ReactNode }[] = [
  { value: 'lista', label: <span className="frota-pend__modo"><List size={14} aria-hidden />Lista</span> },
  { value: 'quadro', label: <span className="frota-pend__modo"><Kanban size={14} aria-hidden />Quadro</span> },
]

const TABELAS_PREVENTIVA = ['planoPreventivo', 'baselines', 'veiculos'] as const

export function Pendencias({ data, errors = {}, today, onOpen, onOpenVeiculo }: { data: FrotaData; errors?: LoadResult['errors']; today: string; onOpen: (kind: Kind, id: string) => void; onOpenVeiculo: (id: string, secao?: 'preventivas') => void }) {
  // Sem plano, baselines ou veículos as preventivas não são calculadas; as demais pendências seguem.
  const erroPreventiva = TABELAS_PREVENTIVA.map((key) => errors[key]).find(Boolean) ?? null
  const itens = useMemo(
    () => buildPendencias(erroPreventiva ? { ...data, veiculos: [], planoPreventivo: [], baselines: [] } : data, today),
    [data, today, erroPreventiva],
  )
  const [filtroUrl, setFiltro] = useQueryTexto('filtro')
  const [modoUrl, setModo] = useQueryTexto('modo')
  const modo: Modo = modoUrl === 'quadro' ? 'quadro' : 'lista'

  const aviso = erroPreventiva ? <Alert tone="warning">Preventivas indisponíveis: {erroPreventiva}</Alert> : null
  if (!itens.length) return <>{aviso}<EmptyState align="start" icon={<CheckCircle2 size={36} />} title="Nenhuma pendência de frota no momento">Encaixes, manutenções atrasadas, multas e colisões em aberto aparecem aqui.</EmptyState></>

  const abrir = (item: Pendencia) => {
    if (item.kind === 'preventiva' || item.kind === 'veiculo') { if (item.veiculoId) onOpenVeiculo(item.veiculoId, item.kind === 'preventiva' ? 'preventivas' : undefined) }
    else onOpen(item.kind, item.id)
  }
  const atrasadas = itens.filter((item) => urgencia(item) === 'atrasado').length
  const hoje = itens.filter((item) => urgencia(item) === 'hoje').length
  // Links antigos filtram por tipo (`filtro=preventiva`); os chips filtram por área.
  const tipoFiltro = PENDENCIA_ORDEM.find((tipo) => tipo === filtroUrl)
  const areaFiltro = AREAS.find((area) => area.id === filtroUrl)
  const daArea = (area: Area) => itens.filter((item) => area.tipos.includes(item.tipo))
  const presentes = AREAS.filter((area) => daArea(area).length > 0)
  const visiveis = ordenar(itens.filter((item) => (!areaFiltro || areaFiltro.tipos.includes(item.tipo)) && (!tipoFiltro || item.tipo === tipoFiltro)))
  const filtroAtivo = areaFiltro?.id ?? tipoFiltro ?? ''
  const props = { itens: visiveis, abrir }

  return (
    <div className="frota-pend">
      {aviso}
      <div className="frota-kpis">
        <MetricCard icon={<ListTodo size={20} />} tone="info" label="Pendências" value={itens.length} />
        <MetricCard icon={<CircleAlert size={20} />} tone={atrasadas ? 'danger' : 'info'} label="Atrasadas" value={atrasadas} />
        <MetricCard icon={<CalendarClock size={20} />} tone={hoje ? 'warning' : 'info'} label="Vencem hoje" value={hoje} />
      </div>

      <div className="frota-pend__barra">
        <div className="frota-chips" role="group" aria-label="Filtrar pendências">
          <button type="button" className="frota-chip" aria-pressed={!filtroAtivo} onClick={() => setFiltro('')}>Todas <b>{itens.length}</b></button>
          {presentes.map((area) => (
            <button key={area.id} type="button" className="frota-chip" aria-pressed={filtroAtivo === area.id} onClick={() => setFiltro(filtroAtivo === area.id ? '' : area.id)}>
              {area.titulo} <b>{daArea(area).length}</b>
            </button>
          ))}
          {tipoFiltro ? <button type="button" className="frota-chip" aria-pressed aria-label={`Remover filtro ${CURTO[tipoFiltro]}`} onClick={() => setFiltro('')}>{CURTO[tipoFiltro]} <b aria-hidden>×</b></button> : null}
        </div>
        <SegmentedControl aria-label="Ver pendências como" size="compact" value={modo} onChange={(v) => setModo(v === 'lista' ? '' : v)} options={MODOS} />
      </div>

      {modo === 'quadro' ? <PendenciasQuadro {...props} /> : <PendenciasLista {...props} />}
    </div>
  )
}
