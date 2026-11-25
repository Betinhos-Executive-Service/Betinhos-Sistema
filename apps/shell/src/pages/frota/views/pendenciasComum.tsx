import { CalendarClock, Gauge } from 'lucide-react'
import { StatusBadge } from '@betinhos/ui'
import { formatBR } from '../data/dates'
import { ROTULO_ETAPA } from '../domain/multaEtapas'
import { PENDENCIA_ORDEM, type Pendencia, type PendenciaTipo } from '../domain/pendencias'

export const CURTO: Record<PendenciaTipo, string> = {
  prioridade: 'Prioridade alta parada',
  reincidencia: 'Manutenção reincidente',
  custo: 'Custo fora da curva',
  hodometro: 'Hodômetro desatualizado',
  encaixar: 'A encaixar',
  preventiva: 'Preventiva do plano',
  atrasada: 'Manutenção atrasada',
  notificar: ROTULO_ETAPA.identificar,
  indicar: ROTULO_ETAPA.indicar,
  colisao: 'Colisão em aberto',
}


export type Urgencia = 'atrasado' | 'hoje' | 'breve'

/** Preventiva por km a vencer conta como "próxima": tem folga, mas já pede programação. */
export function urgencia(item: Pendencia): Urgencia | null {
  if (item.kind === 'preventiva') {
    if (item.estado === 'vencido') return 'atrasado'
    if (item.criterio === 'km') return item.estado === 'a_vencer' ? 'breve' : null
    if (item.criterio !== 'data') return null
  }
  if (item.dias === null || !item.prazo) return null
  return item.dias < 0 ? 'atrasado' : item.dias === 0 ? 'hoje' : 'breve'
}

const PESO_URGENCIA: Record<Urgencia, number> = { atrasado: 0, hoje: 1, breve: 2 }

/** Mais urgente primeiro; empate segue a ordem dos tipos e o peso calculado no domínio. */
export function ordenar(itens: Pendencia[]): Pendencia[] {
  const nivel = (item: Pendencia) => { const u = urgencia(item); return u ? PESO_URGENCIA[u] : 3 }
  return [...itens].sort((a, b) => nivel(a) - nivel(b) || PENDENCIA_ORDEM.indexOf(a.tipo) - PENDENCIA_ORDEM.indexOf(b.tipo) || a.peso - b.peso)
}

const TOM: Record<Urgencia, 'danger' | 'warning' | 'info'> = { atrasado: 'danger', hoje: 'warning', breve: 'info' }

function Prazo({ item }: { item: Pendencia }) {
  const nivel = urgencia(item)
  if (!nivel || item.dias === null || !item.prazo) return null
  const texto = nivel === 'atrasado' ? `Atrasado ${-item.dias} d` : nivel === 'hoje' ? 'Vence hoje' : `Vence em ${item.dias} d`
  return <StatusBadge tone={TOM[nivel]} icon={<CalendarClock size={12} />} title={formatBR(item.prazo)}>{texto}</StatusBadge>
}

function Km({ item }: { item: Pendencia }) {
  if (item.faltamKm === null) return null
  const vencido = item.faltamKm < 0
  const texto = vencido ? `Vencido há ${Math.abs(item.faltamKm).toLocaleString('pt-BR')} km` : `Em ${item.faltamKm.toLocaleString('pt-BR')} km`
  return <StatusBadge tone={vencido ? 'danger' : item.estado === 'a_vencer' ? 'warning' : 'info'} icon={<Gauge size={12} />}>{texto}</StatusBadge>
}

/** Um badge só: na preventiva, o da regra que decide (km ou data); nos demais, o prazo. */
export function Badge({ item }: { item: Pendencia }) {
  if (item.kind === 'preventiva' && item.criterio === 'km') return <Km item={item} />
  return <Prazo item={item} />
}

