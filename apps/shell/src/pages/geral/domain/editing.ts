import type { Row } from '@betinhos/dataverse'
import type { EditValue } from './edit'
import { parseMoney, toDateTimeLocal } from './format'
import type { CellKind, LookupOption } from './types'

/** Opção escolhida de um Select: valor (id ou número em texto) e rótulo exibido. */
export type PickedOption = { value: string; label: string }

const moneyFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

/** Número no formato digitável do campo de dinheiro: `1234,50`, sem milhar. */
export const moneyInput = (value: number) => moneyFormat.format(value)

/** Ids do Dataverse chegam com caixa diferente conforme a origem. */
export const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()

/** Texto inicial do controle de digitação para o valor atual da linha. */
export function draftOf(kind: CellKind, row: Row, key: string): string {
  const raw = row[key]
  if (raw == null) return ''
  if (kind === 'money') return typeof raw === 'number' ? moneyInput(raw) : ''
  if (kind === 'datetime') return toDateTimeLocal(String(raw))
  return String(raw)
}

/**
 * O que fazer ao sair do controle de digitação: `null` = nada a gravar, `{ error }` = valor inválido (o campo continua aberto),
 * `{ submit }` = gravar. `badInput` vem do `validity` do navegador (data pela metade).
 */
export function decideCommit(kind: CellKind, draft: string, raw: unknown, badInput: boolean): { error: string } | { submit: EditValue } | null {
  switch (kind) {
    case 'text': case 'memo': {
      const before = raw == null ? '' : String(raw)
      return draft.trim() !== before.trim() ? { submit: draft } : null
    }
    case 'money': {
      const typed = draft.trim()
      if (typed === '') return raw != null ? { submit: null } : null
      const value = parseMoney(typed)
      if (value == null) return { error: 'Valor inválido.' }
      return value !== raw ? { submit: value } : null
    }
    case 'datetime': {
      // Data pela metade chega como '' e apagaria o valor: trata como inválida.
      if (badInput) return { error: 'Data ou hora inválida.' }
      return draft !== toDateTimeLocal(raw == null ? null : String(raw)) ? { submit: draft } : null
    }
    default: return null
  }
}

/** O que gravar ao escolher uma opção de choice ou lookup; `null` = nada mudou. */
export function decideChoice(kind: CellKind, value: string | null, raw: unknown, label: string): { submit: EditValue } | null {
  if (value == null) return raw != null ? { submit: null } : null
  if (kind === 'choice') return Number(value) !== raw ? { submit: Number(value) } : null
  return sameId(value, raw) ? null : { submit: { id: value, nome: label } }
}

/** Opções de um lookup depois da busca: a atual (`keep`) fica no topo e mantém a caixa do id que a linha já tem. */
export function lookupOptions(found: LookupOption[] | null, keep: PickedOption | null): PickedOption[] {
  const list = (found ?? []).map((o) => ({ value: keep && sameId(keep.value, o.id) ? keep.value : o.id, label: o.nome }))
  return keep && !list.some((o) => o.value === keep.value) ? [keep, ...list] : list
}
