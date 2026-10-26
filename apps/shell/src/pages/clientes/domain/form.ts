import type { Row } from '@betinhos/dataverse'
import type { Cliente } from './types'

export type ClienteForm = { nome: string; registro: string; endereco: string }
export type FormKey = keyof ClienteForm
export type FormErrors = Partial<Record<FormKey, string>>

export const COLUMNS: Record<FormKey, string> = { nome: 'cr40f_nomedocliente', registro: 'cr40f_registro', endereco: 'cr40f_endereco' }
/** Tamanhos da metadata de DEV (26/10/2026). */
export const MAX_LENGTH: Record<FormKey, number> = { nome: 850, registro: 850, endereco: 2000 }

export const emptyForm = (): ClienteForm => ({ nome: '', registro: '', endereco: '' })
export const toForm = (c: Cliente): ClienteForm => ({ nome: c.nome, registro: c.registro, endereco: c.endereco })

/** Nome e registro são obrigatórios no Dataverse (ApplicationRequired). */
export function validateForm(f: ClienteForm): FormErrors {
  const e: FormErrors = {}
  if (!f.nome.trim()) e.nome = 'Informe o nome do cliente.'
  if (!f.registro.trim()) e.registro = 'Informe o registro.'
  for (const key of Object.keys(MAX_LENGTH) as FormKey[]) if (!e[key] && f[key].length > MAX_LENGTH[key]) e[key] = `No máximo ${MAX_LENGTH[key]} caracteres.`
  return e
}

/** Payload só com o que mudou (edição) ou com tudo preenchido (cadastro). */
export function buildPayload(base: ClienteForm | null, f: ClienteForm): Row {
  const p: Row = {}
  for (const key of Object.keys(COLUMNS) as FormKey[]) {
    if (base && base[key] === f[key]) continue
    const v = f[key].trim() || null
    if (base || v != null) p[COLUMNS[key]] = v
  }
  return p
}

export const isDirty = (a: ClienteForm, b: ClienteForm) => (Object.keys(a) as FormKey[]).some((k) => a[k] !== b[k])

export const applyForm = (c: Cliente, f: ClienteForm): Cliente => ({ ...c, nome: f.nome.trim(), registro: f.registro.trim(), endereco: f.endereco.trim() })
