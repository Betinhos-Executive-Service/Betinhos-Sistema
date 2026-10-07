import type { Row } from '@betinhos/dataverse'
import { IDIOMA, STATUS } from './choices'
import { emailKey, phoneKey } from './duplicates'
import type { ChoiceKey, Pessoa } from './types'

/** Valores do formulário como texto (choices como string do número; '' = vazio). */
export type PessoaForm = {
  nome: string; clienteId: string; clienteNome: string; telefone: string; email: string
  cargo: string; classificacao: string; idioma: string; status: string; sexo: string; tipoVeiculo: string
  departamento: string; cr: string; endereco: string; preferencias: string; nascimento: string
}
export type FormKey = keyof PessoaForm
export type FormErrors = Partial<Record<FormKey, string>>

/** Colunas de texto/data e choices; o cliente (lookup) é tratado à parte. */
export const TEXT_FIELDS = {
  nome: 'cr40f_nomedopassageiro', telefone: 'cr40f_telefone', email: 'cr40f_email', departamento: 'cr40f_departamento',
  cr: 'cr40f_cr', endereco: 'cr40f_enderecodesaida', preferencias: 'cr40f_preferenciasdopassageiro', nascimento: 'cr40f_datadenascimento',
} as const
export const CHOICE_FIELDS: Record<ChoiceKey, string> = {
  cargo: 'cr40f_cargo', classificacao: 'cr40f_classificacao', idioma: 'cr40f_idioma', status: 'cr40f_status', sexo: 'cr40f_sexo', tipoVeiculo: 'new_tipodoveiculo',
}
export const MAX_LENGTH: Partial<Record<FormKey, number>> = {
  nome: 850, telefone: 250, email: 1000, departamento: 1000, cr: 200, endereco: 4000, preferencias: 1000,
}

const s = (v: number | null) => (v == null ? '' : String(v))

export function emptyForm(): PessoaForm {
  return {
    nome: '', clienteId: '', clienteNome: '', telefone: '', email: '', cargo: '', classificacao: '', idioma: String(IDIOMA.portugues),
    status: String(STATUS.ativo), sexo: '', tipoVeiculo: '', departamento: '', cr: '', endereco: '', preferencias: '', nascimento: '',
  }
}

export function toForm(p: Pessoa): PessoaForm {
  return {
    nome: p.nome, clienteId: p.clienteId, clienteNome: p.cliente, telefone: p.telefone, email: p.email,
    cargo: s(p.cargo), classificacao: s(p.classificacao), idioma: s(p.idioma), status: s(p.status), sexo: s(p.sexo), tipoVeiculo: s(p.tipoVeiculo),
    departamento: p.departamento, cr: p.cr, endereco: p.endereco, preferencias: p.preferencias, nascimento: p.nascimento,
  }
}

/** Celular com máscara (DDD) enquanto digita; aceita colar com +55. */
export function maskPhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Valida o formulário. Nome curto, celular, e-mail e nascimento só são checados quando mudaram
 * em relação a `base`: cadastro antigo fora do padrão não pode impedir salvar outra alteração.
 */
export function validateForm(f: PessoaForm, today = new Date(), base: PessoaForm | null = null): FormErrors {
  const e: FormErrors = {}
  const changed = (k: FormKey) => !base || base[k] !== f[k]
  if (!f.nome.trim()) e.nome = 'Informe o nome.'
  else if (changed('nome') && f.nome.trim().length < 3) e.nome = 'Nome muito curto.'
  if (changed('telefone') && f.telefone.trim() && !phoneKey(f.telefone)) e.telefone = 'Celular com DDD: 10 ou 11 dígitos.'
  if (changed('email') && f.email.trim() && !emailKey(f.email)) e.email = 'E-mail inválido.'
  if (!f.idioma) e.idioma = 'Escolha o idioma.'
  if (!f.status) e.status = 'Escolha o status.'
  if (changed('nascimento') && f.nascimento) {
    const d = new Date(`${f.nascimento}T12:00:00`)
    if (Number.isNaN(d.getTime()) || d > today || d.getFullYear() < 1900) e.nascimento = 'Data de nascimento inválida.'
  }
  for (const [key, max] of Object.entries(MAX_LENGTH) as [FormKey, number][]) if (!e[key] && f[key].length > max) e[key] = `No máximo ${max} caracteres.`
  return e
}

const clean = (v: string) => { const t = v.trim(); return t ? t : null }
const num = (v: string) => (v ? Number(v) : null)

export type LookupBind = { nav: string; set: string }

/**
 * Payload só com o que mudou (edição) ou com tudo preenchido (cadastro).
 * O cliente vai por `@odata.bind` com a navigation property lida da metadata.
 */
export function buildPayload(base: PessoaForm | null, f: PessoaForm, cliente: LookupBind): Row {
  const p: Row = {}
  const changed = (k: FormKey) => !base || base[k] !== f[k]
  for (const [k, col] of Object.entries(TEXT_FIELDS) as [keyof typeof TEXT_FIELDS, string][]) {
    if (!changed(k)) continue
    const v = k === 'email' ? clean(f[k].toLowerCase()) : clean(f[k])
    if (base || v != null) p[col] = v
  }
  for (const [k, col] of Object.entries(CHOICE_FIELDS) as [ChoiceKey, string][]) {
    if (!changed(k)) continue
    const v = num(f[k])
    if (base || v != null) p[col] = v
  }
  if (changed('clienteId')) {
    if (f.clienteId) p[`${cliente.nav}@odata.bind`] = `/${cliente.set}(${f.clienteId})`
    else if (base) p[cliente.nav] = null
  }
  return p
}

export const isDirty = (a: PessoaForm, b: PessoaForm) => (Object.keys(a) as FormKey[]).some((k) => k !== 'clienteNome' && a[k] !== b[k])

/** Aplica o formulário salvo ao objeto da lista (UI sem recarregar). */
export function applyForm(p: Pessoa, f: PessoaForm): Pessoa {
  return {
    ...p, nome: f.nome.trim(), clienteId: f.clienteId, cliente: f.clienteId ? f.clienteNome : '', telefone: f.telefone.trim(), email: f.email.trim().toLowerCase(),
    cargo: num(f.cargo), classificacao: num(f.classificacao), idioma: num(f.idioma), status: num(f.status), sexo: num(f.sexo), tipoVeiculo: num(f.tipoVeiculo),
    departamento: f.departamento.trim(), cr: f.cr.trim(), endereco: f.endereco.trim(), preferencias: f.preferencias.trim(), nascimento: f.nascimento,
  }
}
