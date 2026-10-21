import type { StatusTone } from '@betinhos/ui'

/** Valores do choice `cr40f_status` criados por provision-equipamentos.ps1. */
export const STATUS = { emUso: 100000000, disponivel: 100000001, manutencao: 100000002, baixado: 100000003 } as const

export const STATUS_OPTIONS = [
  { value: STATUS.emUso, label: 'Em uso' },
  { value: STATUS.disponivel, label: 'Disponível' },
  { value: STATUS.manutencao, label: 'Em manutenção' },
  { value: STATUS.baixado, label: 'Baixado' },
]

const TONE: Record<number, StatusTone> = { [STATUS.emUso]: 'info', [STATUS.disponivel]: 'success', [STATUS.manutencao]: 'warning', [STATUS.baixado]: 'neutral' }

export const statusLabel = (v: number | null) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem status'
export const statusTone = (v: number | null): StatusTone => (v == null ? 'neutral' : TONE[v] ?? 'neutral')
