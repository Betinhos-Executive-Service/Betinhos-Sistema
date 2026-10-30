import { formatted, type Row } from '@betinhos/dataverse'
import { parseChanges } from '../../../app/auditoria/format'
import { formatDateTime, formatMoney } from './format'
import type { AttributeInfo, Column } from './types'

/** Nomes lógicos (separados por vírgula) que o "Flow Campos Protegidos" trava contra a sincronização da Tenaris. */
export const CAMPOS_PROTEGIDOS = 'new_camposprotegidos'
/** JSON com o último valor que a Tenaris mandou, por nome lógico. */
export const SNAPSHOT_TENARIS = 'new_snapshotsharepoint'
// O texto de passageiros é do plugin DriverRecordSharing (somente leitura com dica própria); a trava da Tenaris não se aplica.
const FORA_DA_TRAVA = 'cr40f_passageirosetelefonedecontato'

export function camposProtegidos(raw: unknown): Set<string> {
  if (typeof raw !== 'string') return new Set()
  return new Set(raw.split(/[,;]/).map((name) => name.trim().toLowerCase()).filter((name) => name && name !== FORA_DA_TRAVA))
}

// Linhas são trocadas (não mutadas) a cada gravação: o conjunto vale pela vida do objeto e não é refeito em cada célula.
const porLinha = new WeakMap<Row, Set<string>>()

export function isProtegido(row: Row, column: Column) {
  if (column.alias) return false
  let campos = porLinha.get(row)
  if (!campos) porLinha.set(row, (campos = camposProtegidos(row[CAMPOS_PROTEGIDOS])))
  return campos.has(column.attribute)
}

/** Quantas atualizações auditadas da OS o popover lê (a OS-10801 do PROD tinha 42 em 26/10/2026). */
export const AUDIT_LIMIT = 250

export type Alteracao = { antes: string | null; depois: string | null; em: string; por: string }

/** Histórico de uma OS para o popover: auditoria (ou `sem-permissao`) e o snapshot da Tenaris. */
export type Protecao = { audits: Row[] | 'sem-permissao'; snapshot: unknown }

const asText = (value: unknown) => (value == null || value === '' ? null : String(value))

/** Alteração mais recente do campo; `audits` vem do mais novo para o mais antigo. `changedata` que não é JSON (compartilhamento) é ignorado. */
export function ultimaAlteracao(audits: Row[], attribute: string): Alteracao | null {
  for (const audit of audits) {
    const hit = parseChanges(audit.changedata)?.find((c) => c.logicalName === attribute)
    if (hit) return { antes: asText(hit.oldValue), depois: asText(hit.newValue), em: String(audit.createdon ?? ''), por: formatted(audit, '_userid_value') || '—' }
  }
  return null
}

export function valorDaTenaris(snapshot: unknown, attribute: string): string | null {
  if (typeof snapshot !== 'string' || !snapshot.trim()) return null
  try { return asText((JSON.parse(snapshot) as Record<string, unknown>)[attribute]) } catch { return null }
}

// A auditoria grava data como "MM/dd/yyyy HH:mm:ss" em UTC; o snapshot, em ISO.
const AUDIT_DATE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/
function isoOf(text: string) {
  const m = AUDIT_DATE.exec(text)
  return m ? `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}Z` : text
}

/** Valor cru da auditoria ou do snapshot no formato da tela. Lookup chega como "tabela,id", sem o nome. */
export function textoDoValor(raw: string | null, info: AttributeInfo | undefined) {
  if (raw == null) return '—'
  switch (info?.type) {
    case 'Picklist': return info.options.find((o) => o.value === Number(raw))?.label ?? raw
    case 'Boolean': return /^(true|1)$/i.test(raw) ? 'Sim' : 'Não'
    case 'DateTime': return formatDateTime(isoOf(raw))
    case 'Money': return Number.isFinite(Number(raw)) ? formatMoney(Number(raw)) : raw
    case 'Lookup': return 'Outro registro relacionado'
    default: return raw
  }
}
