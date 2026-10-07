import type { Curriculo } from './types'
import { digits } from './text'

export type Duplicate = { kind: 'CPF' | 'telefone'; id: string; nome: string }

/** Telefone sem DDI 55, com 10 ou 11 dígitos; null quando curto demais para comparar. */
export function phoneKey(raw: string) {
  let d = digits(raw)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

/** Aviso, não bloqueio: primeiro registro com o mesmo CPF e primeiro com o mesmo telefone ou WhatsApp. */
export function findDuplicates(form: { cpf: string; telefone: string; whatsapp: string }, list: Curriculo[], selfId: string | null): Duplicate[] {
  const others = list.filter((c) => c.id !== selfId)
  const result: Duplicate[] = []
  const cpf = digits(form.cpf)
  if (cpf.length === 11) {
    const hit = others.find((c) => digits(c.cpf) === cpf)
    if (hit) result.push({ kind: 'CPF', id: hit.id, nome: hit.nome })
  }
  const phones = [form.telefone, form.whatsapp].map(phoneKey).filter((p): p is string => p != null)
  if (phones.length) {
    const hit = others.find((c) => [c.telefone, c.whatsapp].some((p) => { const key = phoneKey(p); return key != null && phones.includes(key) }))
    if (hit) result.push({ kind: 'telefone', id: hit.id, nome: hit.nome })
  }
  return result
}

export const duplicateMessage = (d: Duplicate) => `Já existe um currículo com este ${d.kind}: ${d.nome}`
