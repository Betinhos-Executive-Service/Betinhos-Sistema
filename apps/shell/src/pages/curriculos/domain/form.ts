import type { Row } from '@betinhos/dataverse'
import type { Curriculo } from './types'
import { digits } from './text'

/** Campo do formulário → coluna de new_curriculo (confirmadas na metadata de DEV). */
export const FIELDS = {
  nome: 'new_nomecompleto', cpf: 'new_cpf', email: 'new_email', telefone: 'new_telefone', whatsapp: 'new_whatsapp',
  cidade: 'new_cidade', estado: 'new_estado', cargo: 'new_cargointeresse', experiencia: 'new_experiencia',
  ultimoCargo: 'new_ultimocargo', ultimaEmpresa: 'new_ultimaempresa', pretensao: 'new_pretensaosalarial', nota: 'new_nota',
  indicadoPor: 'new_indicadopor', disponibilidade: 'new_disponibilidade', cnh: 'new_categoriacnh', origem: 'new_origemcurriculo',
  status: 'new_statuscurriculo', link: 'new_linkcurriculo', observacoes: 'new_observacoes',
} as const

export type FormKey = keyof typeof FIELDS
/** Tudo em texto, como nos inputs; choices guardam o valor numérico em string ('' = vazio). */
export type CurriculoForm = Record<FormKey, string>
export type FormErrors = Partial<Record<FormKey, string>>

export const FORM_KEYS = Object.keys(FIELDS) as FormKey[]

/** Tamanho máximo dos textos, conforme a metadata de DEV. */
export const MAX_LENGTH: Partial<Record<FormKey, number>> = {
  nome: 200, cpf: 14, email: 150, telefone: 30, whatsapp: 30, cidade: 100, estado: 2, cargo: 120,
  ultimoCargo: 120, ultimaEmpresa: 150, indicadoPor: 200, link: 500,
}

const CHOICES: FormKey[] = ['disponibilidade', 'cnh', 'origem', 'status']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emptyForm(status: number | null): CurriculoForm {
  const form = Object.fromEntries(FORM_KEYS.map((key) => [key, ''])) as CurriculoForm
  form.status = status == null ? '' : String(status)
  return form
}

const numberText = (value: number | null) => (value == null ? '' : String(value))

export function toForm(c: Curriculo): CurriculoForm {
  return {
    nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, whatsapp: c.whatsapp, cidade: c.cidade, estado: c.estado,
    cargo: c.cargo, experiencia: c.experiencia, ultimoCargo: c.ultimoCargo, ultimaEmpresa: c.ultimaEmpresa,
    pretensao: c.pretensao == null ? '' : String(c.pretensao).replace('.', ','),
    nota: numberText(c.nota), indicadoPor: c.indicadoPor, disponibilidade: numberText(c.disponibilidade), cnh: numberText(c.cnh),
    origem: numberText(c.origem), status: numberText(c.status), link: c.link, observacoes: c.observacoes,
  }
}

/** "3500", "3500,5" ou "3500.50"; recusa separador de milhar. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : null
}

export function validateForm(form: CurriculoForm): FormErrors {
  const errors: FormErrors = {}
  const has = (key: FormKey) => form[key].trim() !== ''
  if (!has('nome')) errors.nome = 'Informe o nome completo.'
  if (has('cpf') && digits(form.cpf).length !== 11) errors.cpf = 'O CPF precisa ter 11 dígitos.'
  if (has('email') && !EMAIL.test(form.email.trim())) errors.email = 'Use um e-mail no formato nome@dominio.com.'
  if (has('estado') && !/^[A-Z]{2}$/.test(form.estado.trim())) errors.estado = 'Use a sigla com 2 letras, ex.: SP.'
  if (!has('cargo')) errors.cargo = 'Informe o cargo de interesse.'
  if (has('pretensao') && parseDecimal(form.pretensao) == null) errors.pretensao = 'Use só números, ex.: 3500,00.'
  if (has('nota') && !(/^\d{1,2}$/.test(form.nota.trim()) && Number(form.nota) <= 10)) errors.nota = 'Use um número inteiro de 0 a 10.'
  if (has('link') && !/^https?:\/\/\S+$/i.test(form.link.trim())) errors.link = 'Use um endereço que comece com http:// ou https://.'
  return errors
}

/** Valor do campo no formato da coluna; `null` quando vazio. */
function columnValue(key: FormKey, raw: string): string | number | null {
  const text = raw.trim()
  if (!text) return null
  if (key === 'pretensao') return parseDecimal(text)
  if (key === 'nota' || CHOICES.includes(key)) return Number(text)
  return text
}

/** Criação: só os campos preenchidos, como no legado. */
export function createPayload(form: CurriculoForm): Row {
  const payload: Row = {}
  for (const key of FORM_KEYS) {
    const value = columnValue(key, form[key])
    if (value != null) payload[FIELDS[key]] = value
  }
  return payload
}

/** Alteração: só o que mudou; campo esvaziado vira `null`. */
export function changePayload(before: CurriculoForm, after: CurriculoForm): Row {
  const payload: Row = {}
  for (const key of FORM_KEYS) if (before[key].trim() !== after[key].trim()) payload[FIELDS[key]] = columnValue(key, after[key])
  return payload
}

export const isDirty = (before: CurriculoForm, after: CurriculoForm) => FORM_KEYS.some((key) => before[key] !== after[key])

/** Assinatura estável (chaves ordenadas) usada pela idempotência, igual ao legado. */
export function payloadSignature(payload: Row) {
  return JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map((key) => [key, payload[key]])))
}
