import type { ChoiceOption } from '@betinhos/dataverse'

export type Curriculo = {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  whatsapp: string
  cidade: string
  estado: string
  cargo: string
  experiencia: string
  ultimoCargo: string
  ultimaEmpresa: string
  pretensao: number | null
  nota: number | null
  indicadoPor: string
  disponibilidade: number | null
  cnh: number | null
  origem: number | null
  /** Valor da choice new_statuscurriculo; null cai na primeira etapa (Novo). */
  status: number | null
  link: string
  observacoes: string
  criadoEm: Date | null
}

/** Opções reais das quatro colunas choice, lidas da metadata. */
export type ChoiceSet = {
  status: ChoiceOption[]
  cnh: ChoiceOption[]
  origem: ChoiceOption[]
  disponibilidade: ChoiceOption[]
}
