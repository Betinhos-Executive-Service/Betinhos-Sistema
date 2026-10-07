import { diaSP, formatBR } from '../data/dates'
import { brl } from '../data/format'
import { label, STATUS_OPTIONS } from '../data/schema'
import type { FrotaData, Kind } from '../data/types'
import { rotuloNaBase } from './motoristaAtual'

export type TimelineItem = { kind: Kind | 'posse'; id: string; dia: string | null; titulo: string; detalhe: string; status: string }

export function buildTimeline(veiculoId: string, data: FrotaData): TimelineItem[] {
  const items: TimelineItem[] = [
    ...data.manutencoes.filter((item) => item.veiculo?.id === veiculoId).map((item): TimelineItem => ({
      kind: 'manutencao', id: item.id, dia: diaSP(item.dataManutencao ?? item.criadoEm), titulo: item.descricao, detalhe: brl(item.valor), status: label(STATUS_OPTIONS.manutencao, item.status),
    })),
    ...data.multas.filter((item) => item.veiculo?.id === veiculoId).map((item): TimelineItem => ({
      kind: 'multa', id: item.id, dia: diaSP(item.dataHora ?? item.criadoEm), titulo: item.titulo, detalhe: [item.motorista?.label, item.local].filter(Boolean).join(' · '), status: label(STATUS_OPTIONS.multa, item.status),
    })),
    ...data.colisoes.filter((item) => item.veiculo?.id === veiculoId).map((item): TimelineItem => ({
      kind: 'colisao', id: item.id, dia: diaSP(item.dataHora ?? item.criadoEm), titulo: item.titulo, detalhe: [item.motorista?.label, item.local].filter(Boolean).join(' · '), status: label(STATUS_OPTIONS.colisao, item.status),
    })),
    ...data.posses.filter((item) => item.veiculo?.id === veiculoId).map((item): TimelineItem => ({
      kind: 'posse', id: item.id, dia: diaSP(item.inicio), titulo: item.motorista ? `Posse: ${item.motorista.label || 'motorista não informado'}` : rotuloNaBase(item.localBase), detalhe: item.fim ? `até ${formatBR(diaSP(item.fim))}` : 'em aberto', status: item.fim ? 'Encerrada' : 'Atual',
    })),
  ]
  return items.sort((a, b) => (b.dia ?? '').localeCompare(a.dia ?? ''))
}
