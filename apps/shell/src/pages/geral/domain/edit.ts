import { cleanId, type Row } from '@betinhos/dataverse'
import { fromDateTimeLocal } from './format'
import type { CellKind, CellStatus, LookupBind, LookupOption } from './types'

export type EditValue = string | number | boolean | null | LookupOption
export type CellEvent = { type: 'save' } | { type: 'ok'; at: number } | { type: 'fail'; message: string } | { type: 'settle' } | { type: 'reset' }

export const SAVED_VISIBLE_MS = 1500
const MAX_TEXT = 4000

export function validateEdit(kind: CellKind, value: EditValue): string | null {
  if (kind === 'readonly') return 'Este campo não pode ser editado aqui.'
  if ((kind === 'text' || kind === 'memo') && typeof value === 'string' && value.length > MAX_TEXT) return `Texto acima de ${MAX_TEXT} caracteres.`
  if (kind === 'money' && typeof value === 'number' && value < 0) return 'Valor não pode ser negativo.'
  if (kind === 'datetime' && typeof value === 'string' && value !== '' && !fromDateTimeLocal(value)) return 'Data ou hora inválida.'
  return null
}

const isLookup = (value: EditValue): value is LookupOption => typeof value === 'object' && value !== null

/** Só o campo alterado, no formato que a Web API espera. `null` quando não há o que gravar. */
export function buildPatch(kind: CellKind, attribute: string, value: EditValue, bind?: LookupBind): { patch: Row } | { clearLookup: true } | null {
  switch (kind) {
    case 'text': case 'memo': {
      const text = typeof value === 'string' ? value.trim() : ''
      return { patch: { [attribute]: text || null } }
    }
    case 'choice': return { patch: { [attribute]: typeof value === 'number' ? value : null } }
    case 'money': return { patch: { [attribute]: typeof value === 'number' ? Math.round(value * 100) / 100 : null } }
    case 'boolean': return { patch: { [attribute]: value === true } }
    case 'datetime': return { patch: { [attribute]: typeof value === 'string' && value ? fromDateTimeLocal(value) : null } }
    case 'lookup': {
      if (!bind) return null
      if (value == null) return { clearLookup: true }
      return isLookup(value) ? { patch: { [`${bind.nav}@odata.bind`]: `/${bind.set}(${cleanId(value.id)})` } } : null
    }
    default: return null
  }
}

export function reduceCell(state: CellStatus, event: CellEvent): CellStatus {
  switch (event.type) {
    case 'save': return { kind: 'saving' }
    case 'ok': return { kind: 'saved', at: event.at }
    case 'fail': return { kind: 'error', message: event.message }
    case 'settle': return state.kind === 'saved' ? { kind: 'idle' } : state
    case 'reset': return { kind: 'idle' }
  }
}
