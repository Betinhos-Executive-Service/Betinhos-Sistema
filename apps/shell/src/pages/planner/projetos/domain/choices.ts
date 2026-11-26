import type { Perfil } from './types'

/** Situação do projeto = choice `cr40f_status` da etapa 1 (rótulos curtos da tela). Valores de cr40f_projetoetapa (migration 20261123-0845-projetos.ps1). */
export const STATUS = { ideia: 100000000, andamento: 100000001, validacao: 100000002, concluida: 100000003, pausada: 100000004 } as const

export const STATUS_OPTIONS = [
  { value: STATUS.ideia, label: 'Ideia' },
  { value: STATUS.andamento, label: 'Fazendo' },
  { value: STATUS.validacao, label: 'Conferir' },
  { value: STATUS.concluida, label: 'Pronto' },
  { value: STATUS.pausada, label: 'Pausado' },
]

/** Valores do choice `cr40f_autor` de cr40f_projetoatualizacao. */
export const AUTOR = { renan: 100000000, gestor: 100000001, agente: 100000002 } as const
/** Autor gravado nas atualizações feitas na tela: o do perfil de quem usa. */
export const autorDoPerfil = (perfil: Perfil) => (perfil === 'renan' ? AUTOR.renan : AUTOR.gestor)
