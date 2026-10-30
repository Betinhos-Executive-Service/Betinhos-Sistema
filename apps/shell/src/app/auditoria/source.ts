import type { AuditEvent } from '@betinhos/ui'
import { chunk, cleanId, DataverseError, odataString, type Row } from '@betinhos/dataverse'
import type { Host } from '../../host'
import { lookupRefs, toAuditEvent, type FieldMeta } from './format'

export type AuditTarget = {
  /** Nome lógico da tabela. */
  entity: string
  /** Sem ids: alterações recentes da tabela inteira. */
  ids?: string[]
  /** Nome do registro quando há um só (vai para o subtítulo do painel). */
  name?: string
  /** Abre o registro clicado no painel; sem isso o nome do registro não é link. */
  onOpenRecord?: (id: string) => void
}

export type AuditPage = {
  events: AuditEvent[]
  next: string | null
  auditEnabled: boolean
  tableLabel: string
  /** Busca os nomes dos lookups citados e devolve os mesmos eventos com eles; `null` quando não havia o que buscar. */
  withNames?: () => Promise<AuditEvent[] | null>
}

export type AuditSource = { load: (target: AuditTarget, next: string | null) => Promise<AuditPage> }

/** Sem privilégio "Exibir auditoria" o Dataverse responde 403. */
export const isForbidden = (error: unknown) => error instanceof DataverseError && error.status === 403

// A tabela audits ignora `odata.maxpagesize` (devolve 500 por página, ~750 KB nas reservas):
// a página é limitada por $top e a seguinte começa depois do último evento (cursor createdon + auditid).
export const PAGE_SIZE = 25
/** Limite de ids no filtro (tamanho da URL); seleções maiores mostram os primeiros. */
export const MAX_IDS = 100

type Options = { Options?: { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } | null } }[] }
type WithOptions = { LogicalName: string; OptionSet?: Options | null; GlobalOptionSet?: Options | null }
type DateDefinition = { LogicalName: string; Format?: string | null; DateTimeBehavior?: { Value?: string } | null }

/** Cursor da página seguinte: "createdon|auditid" do último evento recebido. */
export const cursorOf = (row: Row) => `${String(row.createdon)}|${cleanId(String(row.auditid))}`

export function auditPath(target: AuditTarget, cursor: string | null = null) {
  const ids = (target.ids ?? []).slice(0, MAX_IDS).map(cleanId)
  const scope = ids.length ? ` and (${ids.map((id) => `_objectid_value eq ${id}`).join(' or ')})` : ''
  const [at, id] = cursor?.split('|') ?? []
  const after = at && id ? ` and (createdon lt ${at} or (createdon eq ${at} and auditid lt ${id}))` : ''
  const filter = `objecttypecode eq '${odataString(target.entity)}'${scope}${after}`
  // Um a mais que a página só para saber se existe a seguinte.
  return `audits?$select=auditid,createdon,operation,action,changedata,_userid_value,_objectid_value&$filter=${encodeURIComponent(filter)}&$orderby=createdon desc,auditid desc&$top=${PAGE_SIZE + 1}`
}

export function createAuditSource(host: Extract<Host, { mode: 'dataverse' }>): AuditSource {
  const { client, metadata } = host
  const fieldCache = new Map<string, Promise<{ fields: Map<string, FieldMeta>; auditEnabled: boolean }>>()
  // null = buscado e não encontrado (excluído ou sem acesso): não busca de novo.
  const names = new Map<string, string | null>()

  const optionsOf = (list: WithOptions[]) => new Map(list.map((a) => [a.LogicalName, new Map(
    (a.OptionSet?.Options ?? a.GlobalOptionSet?.Options ?? []).map((o) => [o.Value, o.Label?.UserLocalizedLabel?.Label ?? String(o.Value)] as const),
  )]))

  /** Rótulos, opções e formato de data da tabela: uma rodada de chamadas em paralelo por tabela na sessão. */
  function fieldsOf(entity: string) {
    let cached = fieldCache.get(entity)
    if (!cached) {
      const base = `EntityDefinitions(LogicalName='${odataString(entity)}')`
      const typed = <T,>(cast: string, select: string) => client.request<{ value: T[] }>(`${base}/Attributes/Microsoft.Dynamics.CRM.${cast}?${select}`).then((r) => r.value, () => [] as T[])
      const choice = '$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Options)'
      const state = '$select=LogicalName&$expand=OptionSet($select=Options)'
      cached = Promise.all([
        metadata.attributes(entity),
        typed<WithOptions>('PicklistAttributeMetadata', choice),
        typed<WithOptions>('MultiSelectPicklistAttributeMetadata', choice),
        typed<WithOptions>('StateAttributeMetadata', state),
        typed<WithOptions>('StatusAttributeMetadata', state),
        typed<DateDefinition>('DateTimeAttributeMetadata', '$select=LogicalName,Format,DateTimeBehavior'),
        client.request<{ IsAuditEnabled?: { Value?: boolean } }>(`${base}?$select=IsAuditEnabled`).then((r) => r.IsAuditEnabled?.Value !== false, () => true),
      ]).then(([attributes, picklists, multi, states, statuses, dates, auditEnabled]) => {
        const options = new Map([...optionsOf(picklists), ...optionsOf(multi), ...optionsOf(states), ...optionsOf(statuses)])
        const dateInfo = new Map(dates.map((d) => [d.LogicalName, d]))
        const fields = new Map(attributes.map((a): [string, FieldMeta] => {
          const date = dateInfo.get(a.logicalName)
          return [a.logicalName, {
            label: a.label,
            type: a.type,
            options: options.get(a.logicalName),
            dateOnly: date?.Format === 'DateOnly',
            noZone: date ? date.DateTimeBehavior?.Value != null && date.DateTimeBehavior.Value !== 'UserLocal' : undefined,
          }]
        }))
        return { fields, auditEnabled }
      })
      cached.catch(() => fieldCache.delete(entity))
      fieldCache.set(entity, cached)
    }
    return cached
  }

  /** Nome dos lookups citados nos eventos, por tabela, em lotes; o que falhar fica sem nome (não derruba o painel). */
  async function resolveNames(rows: Row[]) {
    const pending = lookupRefs(rows).filter((ref) => !names.has(ref.id))
    const byEntity = new Map<string, typeof pending>()
    for (const ref of pending) byEntity.set(ref.entity, [...(byEntity.get(ref.entity) ?? []), ref])
    await Promise.all([...byEntity].map(async ([entity, refs]) => {
      const info = await metadata.entity(entity).catch(() => null)
      if (!info?.primaryName) { for (const ref of refs) names.set(ref.id, null); return }
      const idField = `${entity}id`
      await Promise.all(chunk(refs.map((r) => r.id), 25).map(async (ids) => {
        const filter = ids.map((id) => `${idField} eq ${id}`).join(' or ')
        const page = await client.request<{ value: Row[] }>(`${info.entitySetName}?$select=${idField},${info.primaryName}&$filter=${encodeURIComponent(filter)}`).catch(() => ({ value: [] as Row[] }))
        for (const row of page.value) {
          const name = row[info.primaryName]
          if (typeof row[idField] === 'string' && typeof name === 'string') names.set(cleanId(row[idField] as string), name)
        }
        for (const id of ids) if (!names.has(id)) names.set(id, null)
      }))
    }))
  }

  return {
    async load(target, next) {
      const [result, meta, table] = await Promise.all([
        client.request<{ value: Row[] }>(auditPath(target, next)),
        fieldsOf(target.entity),
        metadata.entity(target.entity).catch(() => null),
      ])
      const rows = result.value.slice(0, PAGE_SIZE)
      const page = { value: rows }
      const pending = lookupRefs(page.value).some((ref) => !names.has(ref.id))
      return {
        events: page.value.map((row) => toAuditEvent(row, meta.fields, names)),
        withNames: pending ? () => resolveNames(page.value).then(() => page.value.map((row) => toAuditEvent(row, meta.fields, names))) : undefined,
        next: result.value.length > PAGE_SIZE ? cursorOf(rows[rows.length - 1]) : null,
        auditEnabled: meta.auditEnabled,
        tableLabel: table?.label ?? target.entity,
      }
    },
  }
}

const MOCK_USERS = ['Marina Lopes', 'João Araújo', 'Betinhos Executive Service, noreply']

/** Dados de exemplo fora do Dataverse (pnpm dev, VM cloud): mostra o painel com eventos plausíveis. */
export function createMockAuditSource(): AuditSource {
  return {
    async load(target, next) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      const start = next ? Number(next) : 0
      const ids = target.ids?.length ? target.ids : ['mock-1', 'mock-2', 'mock-3']
      const events = Array.from({ length: 12 }, (_, i): AuditEvent => {
        const n = start + i
        const id = ids[n % ids.length]
        return {
          id: `${start}-${i}`,
          at: new Date(Date.now() - n * 5.5 * 3_600_000).toISOString(),
          user: MOCK_USERS[n % MOCK_USERS.length],
          operation: n % 11 === 10 ? 'create' : 'update',
          record: { id, name: target.name ?? `Registro ${ids.indexOf(id) + 1}` },
          changes: n % 11 === 10
            ? [{ field: 'name', label: 'Nome', before: null, after: target.name ?? 'Registro novo' }, { field: 'status', label: 'Status', before: null, after: 'Aberto' }]
            : [
                { field: 'status', label: 'Status', before: n % 2 ? 'Aberto' : 'Em andamento', after: n % 2 ? 'Em andamento' : 'Concluído' },
                ...(n % 3 === 0 ? [{ field: 'obs', label: 'Observação', before: null, after: 'Cliente pediu para confirmar o horário de embarque com antecedência.' }] : []),
                ...(n % 4 === 1 ? [{ field: 'valor', label: 'Valor', before: 'R$ 180,00', after: 'R$ 210,00' }] : []),
              ],
        }
      })
      return { events, next: start + 12 < 36 ? String(start + 12) : null, auditEnabled: true, tableLabel: 'Dados de exemplo' }
    },
  }
}
