import { cleanId, type Row } from '@betinhos/dataverse'
import { ENTITY } from './types'

export type OpSplit = { ok: Row[]; comOp: Row[] }

const OP_KEYS = ['_cr40f_financeiro_value', '_cr40f_op_value', 'cr40f_financeiro', 'cr40f_op']

/** Separa as reservas que já têm OP (financeiro/OP preenchido) das que ainda podem gerar uma. */
export function splitOp(rows: Row[]): OpSplit {
  const ok: Row[] = []
  const comOp: Row[] = []
  for (const row of rows) (OP_KEYS.some((key) => Boolean(row[key])) ? comOp : ok).push(row)
  return { ok, comOp }
}

export const PROGRAMADO = 202410005
export const programarPatch = () => ({ cr40f_status: PROGRAMADO, new_foiprogramado: true })

const DAY_MS = 24 * 3_600_000

/** Dia em America/Sao_Paulo (UTC-3, sem horário de verão) como intervalo ISO UTC: [00:00 local, +24 h). */
export function dayWindow(day: string): { start: string; end: string } {
  const start = new Date(`${day}T03:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(start.getTime())) throw new Error(`Dia inválido: ${day}`)
  return { start: start.toISOString(), end: new Date(start.getTime() + DAY_MS).toISOString() }
}

export type Motorista = { id: string; nome: string }
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
export type Contagem = { motorista: Motorista; total: number; tone: Tone; label?: string }

function toneOf(total: number, media: number): { tone: Tone; label?: string } {
  if (total === 0 || media === 0) return { tone: 'neutral' }
  const ratio = total / media
  if (ratio <= 0.6) return { tone: 'success' }
  if (ratio <= 1.2) return { tone: 'warning' }
  if (ratio <= 1.8) return { tone: 'warning', label: 'acima da média' }
  return { tone: 'danger' }
}

/** Serviços por motorista no dia. A média considera só motoristas com serviço e fora de `excluidos`. */
export function contar(reservas: Row[], motoristas: Motorista[], excluidos: Set<string>): { linhas: Contagem[]; media: number; total: number } {
  const counts = new Map<string, number>()
  for (const row of reservas) {
    const id = row._cr40f_motorista_value ? cleanId(String(row._cr40f_motorista_value)) : ''
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const skip = new Set([...excluidos].map(cleanId))
  const linhas = motoristas.map((motorista) => ({ motorista, total: counts.get(cleanId(motorista.id)) ?? 0 }))
  const base = linhas.filter((l) => l.total > 0 && !skip.has(cleanId(l.motorista.id)))
  const soma = base.reduce((acc, l) => acc + l.total, 0)
  const media = base.length ? soma / base.length : 0
  return {
    linhas: linhas
      .map((l): Contagem => ({ ...l, ...toneOf(l.total, media) }))
      .sort((a, b) => b.total - a.total || a.motorista.nome.localeCompare(b.motorista.nome, 'pt-BR')),
    media,
    total: linhas.reduce((acc, l) => acc + l.total, 0),
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Payload do `new_betinhos_AuditoriaViewer` (mesmo contrato do botão da barra de comandos). */
export const auditoriaData = (ids: string[], entitySetName: string, orgUrl: string) => ({
  version: '7.0.0',
  orgUrl,
  entityName: ENTITY,
  entitySetName,
  validIds: ids.map((id) => cleanId(id).toLowerCase()).filter((id) => GUID.test(id)),
})
