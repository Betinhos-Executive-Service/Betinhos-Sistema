import { normalizeSearch } from '@betinhos/ui'
import type { Pessoa } from './types'

export type DuplicateReason = 'celular' | 'e-mail' | 'nome e cliente'
export type DuplicateHit = { id: string; nome: string; motivo: DuplicateReason }

/** Celular sem DDI 55, com 10 ou 11 dígitos; null se não dá para comparar. */
export function phoneKey(raw: string) {
  let d = raw.replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

export function emailKey(raw: string) {
  const e = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** Nome sem acento, caixa e espaços repetidos; null se curto demais (menos de 2 palavras). */
export function nameKey(raw: string) {
  const n = normalizeSearch(raw).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return n.split(' ').length >= 2 ? n : null
}

type Keyed = Pick<Pessoa, 'id' | 'nome' | 'telefone' | 'email' | 'clienteId'>

function keysOf(p: Keyed): [DuplicateReason, string][] {
  const out: [DuplicateReason, string][] = []
  const phone = phoneKey(p.telefone)
  if (phone) out.push(['celular', `t:${phone}`])
  const email = emailKey(p.email)
  if (email) out.push(['e-mail', `e:${email}`])
  const name = nameKey(p.nome)
  if (name) out.push(['nome e cliente', `n:${name}|${p.clienteId}`])
  return out
}

/** Para cada pessoa, as outras que compartilham celular, e-mail ou nome+cliente (o primeiro motivo encontrado). */
export function duplicateIndex(list: Keyed[]) {
  const byKey = new Map<string, Keyed[]>()
  for (const p of list) for (const [, key] of keysOf(p)) byKey.set(key, [...(byKey.get(key) ?? []), p])
  const result = new Map<string, DuplicateHit[]>()
  for (const p of list) {
    const hits = new Map<string, DuplicateHit>()
    for (const [motivo, key] of keysOf(p)) {
      for (const other of byKey.get(key) ?? []) {
        if (other.id !== p.id && !hits.has(other.id)) hits.set(other.id, { id: other.id, nome: other.nome, motivo })
      }
    }
    if (hits.size) result.set(p.id, [...hits.values()])
  }
  return result
}

/** Duplicados de um formulário em edição (o próprio registro fica de fora). */
export function duplicatesFor(form: Keyed, list: Keyed[]) {
  return duplicateIndex([{ ...form, id: '__form__' }, ...list.filter((p) => p.id !== form.id)]).get('__form__') ?? []
}

export const duplicateMessage = (d: DuplicateHit) => `Já existe ${d.nome || 'uma pessoa'} com o mesmo ${d.motivo}.`
