import type { AuditEvent, AuditOperation } from '@betinhos/ui'
import { cleanId, type Row } from '@betinhos/dataverse'

/** Rótulo, tipo e opções de uma coluna, para mostrar o valor auditado como o usuário vê no formulário. */
export type FieldMeta = {
  label: string
  type: string
  options?: Map<number, string>
  /** Formato "Somente data". */
  dateOnly?: boolean
  /** Comportamento diferente de "Local do usuário": o valor gravado já é o que se mostra, sem fuso. */
  noZone?: boolean
}

export type LookupRef = { entity: string; id: string }

type Changed = { logicalName: string; oldValue?: string | null; newValue?: string | null }

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'
const ZONE = 'America/Sao_Paulo'
const LOOKUP = /^([a-z0-9_]+),\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i
// O changedata grava datas em cultura invariável: "10/27/2026 15:35:00" (UTC quando a coluna é "Local do usuário").
const AUDIT_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/

/** Campos alterados do `changedata`; `null` quando não é JSON (compartilhamento, associação). */
export function parseChanges(changedata: unknown): Changed[] | null {
  if (typeof changedata !== 'string' || !changedata.trim().startsWith('{')) return null
  try {
    const changed = (JSON.parse(changedata) as { changedAttributes?: Changed[] }).changedAttributes
    return Array.isArray(changed) ? changed : null
  } catch {
    return null
  }
}

export function lookupRef(value: unknown): LookupRef | null {
  const match = typeof value === 'string' ? LOOKUP.exec(value.trim()) : null
  return match ? { entity: match[1].toLowerCase(), id: match[2].toLowerCase() } : null
}

/** Lookups citados nos eventos, sem repetição, para buscar os nomes de uma vez. */
export function lookupRefs(rows: Row[]) {
  const refs = new Map<string, LookupRef>()
  for (const row of rows) {
    for (const change of parseChanges(row.changedata) ?? []) {
      for (const value of [change.oldValue, change.newValue]) {
        const ref = lookupRef(value)
        if (ref) refs.set(ref.id, ref)
      }
    }
  }
  return [...refs.values()]
}

function auditDate(raw: string, meta: FieldMeta) {
  const match = AUDIT_DATE.exec(raw.trim())
  if (!match) return raw
  const [, month, day, year, hour, minute, second] = match.map(Number)
  const zoned = !meta.noZone
  const date = zoned ? new Date(Date.UTC(year, month - 1, day, hour, minute, second)) : new Date(year, month - 1, day, hour, minute, second)
  const options: Intl.DateTimeFormatOptions = meta.dateOnly ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' }
  return new Intl.DateTimeFormat('pt-BR', zoned ? { ...options, timeZone: ZONE } : options).format(date)
}

const number = (raw: string) => (raw.trim() === '' ? NaN : Number(raw))

/** Valor do `changedata` como texto de leitura; `null` = vazio. */
export function formatAuditValue(raw: string | null | undefined, meta: FieldMeta | undefined, names: Map<string, string | null>): string | null {
  if (raw == null || raw === '') return null
  const ref = lookupRef(raw)
  // Ainda sem resposta: o painel aparece já e o nome entra quando a busca dos lookups volta.
  if (ref) return names.has(ref.id) ? names.get(ref.id) ?? 'Registro removido ou sem acesso' : 'Carregando…'
  if (!meta) return raw
  switch (meta.type) {
    case 'Picklist': case 'State': case 'Status': {
      const value = number(raw)
      return Number.isFinite(value) ? meta.options?.get(value) ?? raw : raw
    }
    case 'Virtual': // múltipla escolha
      return meta.options ? raw.split(',').map((part) => meta.options!.get(Number(part)) ?? part).join(', ') : raw
    case 'Boolean':
      return /^(true|1)$/i.test(raw) ? 'Sim' : /^(false|0)$/i.test(raw) ? 'Não' : raw
    case 'DateTime':
      return auditDate(raw, meta)
    case 'Money': {
      const value = number(raw)
      return Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : raw
    }
    case 'Decimal': case 'Double': case 'Integer': case 'BigInt': {
      const value = number(raw)
      return Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : raw
    }
    default:
      return raw
  }
}

function operationOf(row: Row): { operation: AuditOperation; action?: string } {
  const label = typeof row[`action${FORMATTED}`] === 'string' ? (row[`action${FORMATTED}`] as string) : undefined
  switch (Number(row.operation)) {
    case 1: return { operation: 'create' }
    // Atribuir, ativar e outras ações também chegam como "atualização": o nome da ação diz o que foi.
    case 2: return Number(row.action) === 2 || !label ? { operation: 'update' } : { operation: 'update', action: label }
    case 3: return { operation: 'delete' }
    default: return { operation: 'other', action: label ?? 'Ação' }
  }
}

/** Linha de `audits` → evento do `AuditPanel`. */
export function toAuditEvent(row: Row, fields: Map<string, FieldMeta>, names: Map<string, string | null>): AuditEvent {
  const objectId = typeof row._objectid_value === 'string' ? cleanId(row._objectid_value) : ''
  const recordName = row[`_objectid_value${FORMATTED}`]
  const changes = (parseChanges(row.changedata) ?? [])
    // Valor regravado igual não é alteração; compara o cru (dois lookups sem nome formatariam igual).
    .filter((change) => (change.oldValue ?? '') !== (change.newValue ?? ''))
    .map((change) => {
      const meta = fields.get(change.logicalName)
      return {
        field: change.logicalName,
        label: meta?.label ?? change.logicalName,
        before: formatAuditValue(change.oldValue, meta, names),
        after: formatAuditValue(change.newValue, meta, names),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  return {
    id: String(row.auditid),
    at: String(row.createdon),
    user: typeof row[`_userid_value${FORMATTED}`] === 'string' ? (row[`_userid_value${FORMATTED}`] as string) : 'Usuário desconhecido',
    ...operationOf(row),
    record: objectId ? { id: objectId, name: typeof recordName === 'string' && recordName ? recordName : 'Registro sem nome' } : undefined,
    changes,
  }
}
