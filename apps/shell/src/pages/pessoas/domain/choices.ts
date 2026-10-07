import type { ChoiceKey, ChoiceSet } from './types'

/** `cr40f_status` da pessoa (choice de negócio; não é o statecode). */
export const STATUS = { ativo: 202410000, inativo: 202410001 } as const
export const CLASSIFICACAO = { frequente: 202410000, visitante: 202410001, solicitante: 202410002, grupo: 202410003, lead: 202410004 } as const
export const IDIOMA = { portugues: 202410000, ingles: 202410001, espanhol: 202410002 } as const

const opts = (pairs: [number, string][]) => pairs.map(([value, label]) => ({ value, label }))

/** Rótulos lidos da metadata de DEV em 07/10/2026; usados só se a metadata não responder. */
export const FALLBACK_CHOICES: ChoiceSet = {
  cargo: opts([[202410000, 'C-Level'], [202410001, 'Presidente'], [202410002, 'Vice Presidente'], [202410003, 'Diretor'], [202410004, 'Assistente Executiva'], [202410005, 'Gerente'], [202410006, 'Supervisor'], [202410007, 'Analista'], [202410008, 'Comprador'], [202410009, 'Engenheiro'], [100000001, 'Conselheiro']]),
  classificacao: opts([[202410000, 'Passageiro Frequente'], [202410001, 'Visitante'], [202410002, 'Solicitante'], [202410003, 'Grupo'], [202410004, 'Lead']]),
  idioma: opts([[202410000, 'Português'], [202410001, 'Inglês'], [202410002, 'Espanhol']]),
  status: opts([[202410000, 'Ativo'], [202410001, 'Inativo']]),
  sexo: opts([[202410000, 'Masculino'], [202410001, 'Feminino']]),
  tipoVeiculo: opts([[202410000, 'Básico'], [202410001, 'Executivo'], [202410002, 'Blindado'], [202410003, 'Van'], [202410004, 'Van Blindado'], [202410005, 'Spin'], [202410006, 'Somente Motorista'], [100000001, 'Micro-ônibus'], [100000002, 'Minivan']]),
}

export const CHOICE_ATTRIBUTES: Record<ChoiceKey, string> = {
  cargo: 'cr40f_cargo', classificacao: 'cr40f_classificacao', idioma: 'cr40f_idioma', status: 'cr40f_status', sexo: 'cr40f_sexo', tipoVeiculo: 'new_tipodoveiculo',
}

export function withFallback(partial: Partial<ChoiceSet>): ChoiceSet {
  const out = {} as ChoiceSet
  for (const key of Object.keys(FALLBACK_CHOICES) as ChoiceKey[]) out[key] = partial[key]?.length ? partial[key]! : FALLBACK_CHOICES[key]
  return out
}

export function label(options: { value: number; label: string }[], value: number | null, fallback = '') {
  if (value == null) return fallback
  return options.find((o) => o.value === value)?.label ?? String(value)
}
