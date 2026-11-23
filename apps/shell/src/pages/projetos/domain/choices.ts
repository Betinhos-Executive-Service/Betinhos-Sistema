import type { StatusTone } from '@betinhos/ui'

/** Valores do choice `cr40f_status` de cr40f_projeto (migration 20261123-0845-projetos.ps1). */
export const STATUS = { ideia: 100000000, andamento: 100000001, validacao: 100000002, concluido: 100000003, pausado: 100000004 } as const

export const STATUS_OPTIONS = [
  { value: STATUS.ideia, label: 'Ideia' },
  { value: STATUS.andamento, label: 'Em andamento' },
  { value: STATUS.validacao, label: 'Em validação' },
  { value: STATUS.concluido, label: 'Concluído' },
  { value: STATUS.pausado, label: 'Pausado' },
]

const TONE: Record<number, StatusTone> = {
  [STATUS.ideia]: 'neutral', [STATUS.andamento]: 'info', [STATUS.validacao]: 'warning', [STATUS.concluido]: 'success', [STATUS.pausado]: 'neutral',
}

export const statusLabel = (v: number | null) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem status'
export const statusTone = (v: number | null): StatusTone => (v == null ? 'neutral' : TONE[v] ?? 'neutral')

/** Valores do choice `cr40f_autor` de cr40f_projetoatualizacao. */
export const AUTOR = { renan: 100000000, gestor: 100000001, agente: 100000002 } as const
export const AUTOR_OPTIONS = [
  { value: AUTOR.renan, label: 'Renan' },
  { value: AUTOR.gestor, label: 'Gestor' },
  { value: AUTOR.agente, label: 'Agente' },
]
export const autorLabel = (v: number | null) => AUTOR_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem autor'
