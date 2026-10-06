import { toDataverseDate } from './dates'
import { formatCpf, isValidCpf, isValidEmail, isValidPhone, isValidUrl } from './format'
import { BOOL_REQUIRED_DEFAULTS, FIELDS } from './schema'
import type { Draft, FieldValue, Funcionario } from './types'

export type DateBehavior = 'DateOnly' | 'UserLocal' | 'TimeZoneIndependent'

export type PatchContext = {
  veiculoNav: string
  veiculoSet: string
  dateBehaviors: Record<string, DateBehavior>
}

function normalize(value: FieldValue | undefined): FieldValue {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value ?? null
}

export function emptyDraft(): Draft {
  return { values: { cr40f_status: 0, cr40f_funcao: 202410000, cr40f_tipodevinculo: 0, ...BOOL_REQUIRED_DEFAULTS }, veiculo: null }
}

export function draftFrom(funcionario: Funcionario): Draft {
  return { values: { ...funcionario.values }, veiculo: funcionario.veiculo }
}

/** Campos alterados entre o original e o rascunho (null = criação, todos os preenchidos). */
export function changedKeys(original: Funcionario | null, draft: Draft) {
  const keys = FIELDS.filter((field) => !field.readonly)
    .map((field) => field.key)
    .filter((key) => normalize(draft.values[key]) !== normalize(original?.values[key]))
  if ((original?.veiculo?.id ?? null) !== (draft.veiculo?.id ?? null)) keys.push('cr40f_veiculoatual')
  return keys
}

/** Payload do Web API somente com o diff. Lookup via @odata.bind; limpar usa a navigation property = null. */
export function buildPatch(original: Funcionario | null, draft: Draft, context: PatchContext) {
  const payload: Record<string, unknown> = {}
  for (const key of changedKeys(original, draft)) {
    if (key === 'cr40f_veiculoatual') {
      if (draft.veiculo) payload[`${context.veiculoNav}@odata.bind`] = `/${context.veiculoSet}(${draft.veiculo.id})`
      else if (original) payload[context.veiculoNav] = null
      continue
    }
    const field = FIELDS.find((item) => item.key === key)!
    const value = normalize(draft.values[key])
    if (field.kind === 'date') payload[key] = toDataverseDate(value as string | null, context.dateBehaviors[key])
    else if (field.kind === 'cpf') payload[key] = value === null ? null : formatCpf(String(value))
    else payload[key] = value
  }
  return payload
}

export function validateDraft(draft: Draft) {
  const errors: Record<string, string> = {}
  for (const field of FIELDS) {
    if (field.readonly) continue
    const value = normalize(draft.values[field.key])
    if (field.required && (value === null || value === undefined)) {
      errors[field.key] = 'Obrigatório'
      continue
    }
    if (value === null || typeof value !== 'string') continue
    if (field.kind === 'cpf' && !isValidCpf(value)) errors[field.key] = 'CPF inválido'
    if (field.kind === 'phone' && !isValidPhone(value)) errors[field.key] = 'Use DDD + número'
    if (field.kind === 'email' && !isValidEmail(value)) errors[field.key] = 'E-mail inválido'
    if (field.kind === 'url' && !isValidUrl(value)) errors[field.key] = 'Informe um link http(s)'
  }
  const admissao = normalize(draft.values.cr40f_datadeadmissao)
  const demissao = normalize(draft.values.cr40f_datadedemissao)
  if (typeof admissao === 'string' && typeof demissao === 'string' && demissao < admissao) {
    errors.cr40f_datadedemissao = 'Anterior à admissão'
  }
  return errors
}
