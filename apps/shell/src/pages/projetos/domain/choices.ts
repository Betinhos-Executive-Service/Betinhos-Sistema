import type { StatusTone } from '@betinhos/ui'
import type { Perfil } from './types'

/** Valores do choice `cr40f_status` de cr40f_projetoetapa (migration 20261123-0845-projetos.ps1). */
export const STATUS = { ideia: 100000000, andamento: 100000001, validacao: 100000002, concluida: 100000003, pausada: 100000004 } as const

export const STATUS_OPTIONS = [
  { value: STATUS.ideia, label: 'Ideia' },
  { value: STATUS.andamento, label: 'Em andamento' },
  { value: STATUS.validacao, label: 'Em validação' },
  { value: STATUS.concluida, label: 'Concluída' },
  { value: STATUS.pausada, label: 'Pausada' },
]

const TONE: Record<number, StatusTone> = {
  [STATUS.ideia]: 'neutral', [STATUS.andamento]: 'info', [STATUS.validacao]: 'warning', [STATUS.concluida]: 'success', [STATUS.pausada]: 'neutral',
}

export const statusLabel = (v: number | null) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem etapas'
export const statusTone = (v: number | null): StatusTone => (v == null ? 'neutral' : TONE[v] ?? 'neutral')

/** Valores do choice `cr40f_autor` de cr40f_projetoatualizacao. */
export const AUTOR = { renan: 100000000, gestor: 100000001, agente: 100000002 } as const
export const AUTOR_OPTIONS = [
  { value: AUTOR.renan, label: 'Renan' },
  { value: AUTOR.gestor, label: 'Gestor' },
  { value: AUTOR.agente, label: 'Agente' },
]
export const autorLabel = (v: number | null) => AUTOR_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem autor'
/** Autor gravado nas atualizações feitas na tela: o do perfil de quem usa. */
export const autorDoPerfil = (perfil: Perfil) => (perfil === 'renan' ? AUTOR.renan : AUTOR.gestor)
