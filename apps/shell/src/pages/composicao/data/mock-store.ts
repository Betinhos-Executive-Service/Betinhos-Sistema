import { initialCompositions, moneyFields, type ApplyCellInputResult, type Composition, type MoneyField } from './compositions'
import type { AuditChange, AuditRecord } from './audit'

let rows = initialCompositions.map((row) => ({ ...row, values: { ...row.values }, formulas: { ...row.formulas } }))
const opIds = new Set<string>()
const details = new Map<string, AuditChange[]>()
const names = new Map(initialCompositions.map((row) => [row.id, row.client]))
const history: AuditRecord[] = []
let sequence = 0

function recordEvent(row: Composition, operation: number, changes: AuditChange[]) {
  const auditid = `mock-audit-${++sequence}`
  details.set(auditid, changes)
  history.unshift({ auditid, createdon: new Date().toISOString(), operation, _objectid_value: row.id, userid: { fullname: 'Usuário local' }, changedata: JSON.stringify({ changedAttributes: changes.map((change) => change.field) }) })
}

initialCompositions.forEach((row) => recordEvent(row, 1, [
  { field: 'Cliente', before: '', after: row.client },
  { field: 'Trajeto', before: '', after: row.route },
  { field: 'Data e hora', before: '', after: row.departureAt },
]))

export function getMockRows() { return rows.map((row) => ({ ...row, values: { ...row.values }, formulas: { ...row.formulas } })) }

export function inspectMockCompositionsForOp(ids: string[]) {
  const existing = ids.filter((id) => opIds.has(id))
  const eligible = ids.filter((id) => rows.some((row) => row.id === id) && !opIds.has(id))
  const withoutService = ids.filter((id) => !rows.some((row) => row.id === id))
  return { eligible, existing, withoutService, readErrors: [] as string[] }
}

/** Uma OP para todos os serviços, como o Flow_Gerar_OP faz no Dataverse. */
export function generateMockOp(ids: string[]) {
  const linked = rows.filter((row) => ids.includes(row.id) && !opIds.has(row.id))
  const after = `Gerada (simulação) · 1 OP com ${linked.length} ${linked.length === 1 ? 'serviço' : 'serviços'}`
  linked.forEach((row) => {
    opIds.add(row.id)
    recordEvent(row, 2, [{ field: 'OP', before: 'Não gerada', after }])
  })
}

export function deleteMockCompositions(ids: string[], onProgress?: (completed: number, total: number) => void) {
  const succeeded: string[] = []
  const failed: { id: string; message: string }[] = []
  ids.forEach((id, index) => {
    const row = rows.find((item) => item.id === id)
    if (row) {
      recordEvent(row, 3, [{ field: 'Registro', before: row.client, after: 'Excluído' }])
      rows = rows.filter((item) => item.id !== id)
      succeeded.push(id)
    } else failed.push({ id, message: 'Registro não encontrado nos dados locais.' })
    onProgress?.(index + 1, ids.length)
  })
  return { succeeded, failed }
}

export function saveMockCell(row: Composition, field: MoneyField, result: ApplyCellInputResult) {
  const current = rows.find((item) => item.id === row.id)
  if (!current) return
  const changes = Object.entries(result.updatedValues).flatMap(([key, after]) => {
    const before = current.values[key as MoneyField]
    return before === after ? [] : [{ field: moneyFields.find((item) => item.key === key)?.label ?? key, before, after: String(after) }]
  })
  const formulas = { ...current.formulas }
  Object.entries(result.formulas).forEach(([key, formula]) => {
    if (formula === null) delete formulas[key as MoneyField]
    else if (formula) formulas[key as MoneyField] = formula
  })
  rows = rows.map((item) => item.id === row.id ? { ...item, values: { ...item.values, ...result.updatedValues }, formulas, rowVersion: result.rowVersion } : item)
  if (changes.length) recordEvent(current, 2, changes)
}

export function loadMockAudit(ids: string[]) {
  const selected = new Set(ids)
  return {
    records: history.filter((record) => !ids.length || selected.has(record._objectid_value)),
    fieldNames: {},
    recordNames: Object.fromEntries(names),
  }
}

export function loadMockAuditDetails(id: string) { return details.get(id) ?? [] }
