import { chunk, odataString, type Row } from '@betinhos/dataverse'
import { EXTRA_COLUMN_PREFIX, isExtraColumn, type ColumnCatalog, type ColumnCatalogEntry, type FilterField, type FilterKind } from '@betinhos/ui'
import type { Host } from '../host'

/**
 * Colunas que o usuário adiciona pelo painel (DS §10.9.1): campos da tabela da lista e das relações N:1, até 3 níveis.
 * A chave é `x:` + caminho (`x:cr40f_motorista/cr40f_veiculo/cr40f_placa`): navegações e, no fim, o nome lógico do campo.
 */

export const MAX_DEPTH = 3
const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

/** Campo de uma tabela que pode virar coluna. */
export type ExtraAttr = { name: string; label: string; kind: FilterKind; money?: boolean; lookup?: boolean }
/** Relação N:1 da tabela: navegação e tabela de destino. */
export type ExtraRelation = { nav: string; label: string; target: string; targetLabel: string }
/** O que a metadata diz de uma tabela; `null` no mock (sem tabela real). */
export type ExtraTable = { entitySet: string; primaryId: string; attrs: ExtraAttr[]; relations: ExtraRelation[] }

/** Valor de uma célula: `raw` para ordenar e filtrar, `text` para mostrar. */
export type ExtraValue = { raw: unknown; text: string }
export type ExtraValues = Map<string, Record<string, ExtraValue>>

/** Coluna `x:` resolvida contra a metadata: navegações até a tabela do campo e o campo. */
export type ResolvedExtra = { key: string; label: string; navs: string[]; attr: ExtraAttr }

export type ExtraSource = {
  table: (entity: string) => Promise<ExtraTable>
  values: (entity: string, columns: ResolvedExtra[], ids: string[]) => Promise<ExtraValues>
}

// Tipos que viram coluna; Uniqueidentifier, Virtual (imagem, arquivo, multisseleção), PartyList e afins ficam de fora.
const KIND: Record<string, FilterKind> = {
  String: 'text', Memo: 'text', Integer: 'number', BigInt: 'number', Decimal: 'number', Double: 'number', Money: 'number',
  DateTime: 'date', Boolean: 'choice', Picklist: 'choice', State: 'choice', Status: 'choice', Lookup: 'text', Customer: 'text', Owner: 'text',
}
// Campos técnicos do Dataverse que só confundem a lista.
const TECHNICAL = new Set(['versionnumber', 'importsequencenumber', 'timezoneruleversionnumber', 'utcconversiontimezonecode', 'overriddencreatedon', 'exchangerate', 'owningbusinessunit', 'owningteam', 'owninguser', 'transactioncurrencyid'])

export const extraPath = (key: string) => key.slice(EXTRA_COLUMN_PREFIX.length).split('/').filter(Boolean)

type AttrDef = { LogicalName: string; AttributeType: string; DisplayName?: { UserLocalizedLabel?: { Label?: string } | null }; AttributeOf?: string | null }
type RelDef = { ReferencingAttribute: string; ReferencedEntity: string; ReferencingEntityNavigationPropertyName: string }
type EntityDef = { EntitySetName: string; PrimaryIdAttribute: string }

const labelOf = (d: AttrDef) => d.DisplayName?.UserLocalizedLabel?.Label || ''

/** Lê a metadata (com cache por tabela) e busca os valores das colunas `x:` das linhas carregadas. */
export function createDataverseExtraSource(host: Extract<Host, { mode: 'dataverse' }>): ExtraSource {
  const cache = new Map<string, Promise<ExtraTable>>()

  async function load(entity: string): Promise<ExtraTable> {
    const base = `EntityDefinitions(LogicalName='${odataString(entity)}')`
    const [def, attrs, rels] = await Promise.all([
      host.client.request<EntityDef>(`${base}?$select=EntitySetName,PrimaryIdAttribute`),
      host.client.request<{ value: AttrDef[] }>(`${base}/Attributes?$select=LogicalName,AttributeType,DisplayName,AttributeOf&$filter=${encodeURIComponent('IsValidForRead eq true')}`),
      host.client.request<{ value: RelDef[] }>(`${base}/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`),
    ])
    const byName = new Map(attrs.value.map((a) => [a.LogicalName, a]))
    const fields = attrs.value
      .filter((a) => !a.AttributeOf && KIND[a.AttributeType] && labelOf(a) && !TECHNICAL.has(a.LogicalName) && !a.LogicalName.endsWith('_base') && a.LogicalName !== def.PrimaryIdAttribute)
      .map((a): ExtraAttr => ({ name: a.LogicalName, label: labelOf(a), kind: KIND[a.AttributeType], money: a.AttributeType === 'Money' || undefined, lookup: ['Lookup', 'Customer', 'Owner'].includes(a.AttributeType) || undefined }))
    const targets = [...new Set(rels.value.map((r) => r.ReferencedEntity))]
    const info = await host.metadata.entities(targets).catch(() => new Map<string, { label: string }>())
    // Um lookup com vários alvos (Cliente: conta ou contato) vira uma relação por alvo.
    const perAttr = new Map<string, number>()
    for (const r of rels.value) perAttr.set(r.ReferencingAttribute, (perAttr.get(r.ReferencingAttribute) ?? 0) + 1)
    const relations = rels.value
      .filter((r) => r.ReferencingEntityNavigationPropertyName && !TECHNICAL.has(r.ReferencingAttribute) && byName.has(r.ReferencingAttribute))
      .map((r): ExtraRelation => {
        const targetLabel = info.get(r.ReferencedEntity)?.label ?? r.ReferencedEntity
        const attrLabel = labelOf(byName.get(r.ReferencingAttribute)!) || r.ReferencingAttribute
        return { nav: r.ReferencingEntityNavigationPropertyName, target: r.ReferencedEntity, targetLabel, label: (perAttr.get(r.ReferencingAttribute) ?? 0) > 1 ? `${attrLabel} (${targetLabel})` : attrLabel }
      })
    return { entitySet: def.EntitySetName, primaryId: def.PrimaryIdAttribute, attrs: fields, relations }
  }

  function table(entity: string) {
    let found = cache.get(entity)
    if (!found) {
      found = load(entity)
      found.catch(() => cache.delete(entity))
      cache.set(entity, found)
    }
    return found
  }

  async function values(entity: string, columns: ResolvedExtra[], ids: string[]): Promise<ExtraValues> {
    const result: ExtraValues = new Map()
    if (!columns.length || !ids.length) return result
    const { entitySet, primaryId } = await table(entity)
    const query = `$select=${primaryId}${expandQuery(columns)}`
    const groups = chunk(ids, 50)
    // Quatro consultas por vez: 5.000 linhas são 100 consultas de 50 ids.
    for (let i = 0; i < groups.length; i += 4) {
      const pages = await Promise.all(groups.slice(i, i + 4).map((group) => {
        const filter = `Microsoft.Dynamics.CRM.In(PropertyName='${primaryId}',PropertyValues=[${group.map((id) => `'${odataString(id)}'`).join(',')}])`
        return host.client.getAll(`${entitySet}?${query}&$filter=${encodeURIComponent(filter)}`)
      }))
      for (const row of pages.flat()) {
        const id = String(row[primaryId] ?? '').toLowerCase()
        if (id) result.set(id, readValues(row, columns))
      }
    }
    return result
  }

  return { table, values }
}

type Node = { select: Set<string>; expand: Map<string, Node> }
const node = (): Node => ({ select: new Set(), expand: new Map() })
const selectName = (attr: ExtraAttr) => (attr.lookup ? `_${attr.name}_value` : attr.name)

/** `$select` + `$expand` aninhado (`&$expand=nav($select=a;$expand=nav2($select=b))`) de todas as colunas. */
export function expandQuery(columns: ResolvedExtra[]): string {
  const root = node()
  for (const c of columns) {
    let at = root
    for (const nav of c.navs) {
      if (!at.expand.has(nav)) at.expand.set(nav, node())
      at = at.expand.get(nav)!
    }
    at.select.add(selectName(c.attr))
  }
  const inner = (n: Node): string => {
    const parts = n.select.size ? [`$select=${[...n.select].join(',')}`] : []
    if (n.expand.size) parts.push(`$expand=${[...n.expand].map(([nav, child]) => `${nav}(${inner(child)})`).join(',')}`)
    return parts.join(';')
  }
  const own = [...root.select]
  const select = own.length ? `,${own.join(',')}` : ''
  const expand = root.expand.size ? `&$expand=${[...root.expand].map(([nav, child]) => `${nav}(${inner(child)})`).join(',')}` : ''
  return `${select}${expand}`
}

/** Valor de cada coluna numa linha da Web API: segue as navegações e usa o texto formatado quando há. */
export function readValues(row: Row, columns: ResolvedExtra[]): Record<string, ExtraValue> {
  const out: Record<string, ExtraValue> = {}
  for (const c of columns) {
    let at: unknown = row
    for (const nav of c.navs) at = at && typeof at === 'object' ? (at as Row)[nav] : null
    const record = at && typeof at === 'object' ? (at as Row) : null
    const name = selectName(c.attr)
    const raw = record ? record[name] : null
    const formatted = record ? record[`${name}${FORMATTED}`] : null
    const text = typeof formatted === 'string' ? formatted : raw == null ? '' : String(raw)
    out[c.key] = { raw: valueFor(c.attr, raw, text), text }
  }
  return out
}

function valueFor(attr: ExtraAttr, raw: unknown, text: string): unknown {
  if (raw == null || raw === '') return null
  if (attr.kind === 'date') { const d = new Date(String(raw)); return Number.isNaN(d.getTime()) ? null : d }
  if (attr.kind === 'number') return typeof raw === 'number' ? raw : Number(raw)
  // Choice e Sim/Não filtram pelo rótulo (as opções vêm dos valores carregados); lookup vira o nome.
  return text
}

/** Resolve cada coluna `x:` da visão: caminho válido na metadata atual, até 3 relações; o resto é ignorado. */
export async function resolveExtras(source: ExtraSource, entity: string, columns: { key: string; label?: string }[]): Promise<ResolvedExtra[]> {
  const out: ResolvedExtra[] = []
  for (const col of columns) {
    if (!isExtraColumn(col.key)) continue
    const path = extraPath(col.key)
    const navs = path.slice(0, -1)
    if (!path.length || navs.length > MAX_DEPTH) continue
    try {
      let table = await source.table(entity)
      for (const nav of navs) {
        const rel = table.relations.find((r) => r.nav === nav)
        if (!rel) throw new Error('relação removida')
        table = await source.table(rel.target)
      }
      const attr = table.attrs.find((a) => a.name === path[path.length - 1])
      if (attr) out.push({ key: col.key, label: col.label ?? col.key, navs, attr })
    } catch {
      // Campo ou relação que saiu da metadata (ou sem permissão): a coluna some sem quebrar a lista.
    }
  }
  return out
}

/** Catálogo do painel "Adicionar coluna": campos e relações de cada nível, em ordem alfabética. */
export function extraCatalog(source: ExtraSource, entity: string): ColumnCatalog {
  return {
    maxDepth: MAX_DEPTH,
    async load(path) {
      let table = await source.table(entity)
      for (const nav of path) {
        const rel = table.relations.find((r) => r.nav === nav)
        if (!rel) return []
        table = await source.table(rel.target)
      }
      const byLabel = (a: ColumnCatalogEntry, b: ColumnCatalogEntry) => a.label.localeCompare(b.label, 'pt-BR')
      return [
        ...table.attrs.map((a): ColumnCatalogEntry => ({ id: a.name, label: a.label })).sort(byLabel),
        ...table.relations.map((r): ColumnCatalogEntry => ({ id: r.nav, label: r.label, relation: true, description: r.targetLabel })).sort(byLabel),
      ]
    },
  }
}

/** Campos de filtro das colunas resolvidas; choice e Sim/Não oferecem os rótulos presentes nas linhas. */
export function extraFields(columns: ResolvedExtra[], values: ExtraValues): FilterField[] {
  return columns.map((c): FilterField => {
    if (c.attr.kind !== 'choice') return { key: c.key, label: c.label, kind: c.attr.kind, money: c.attr.money }
    const labels = new Set<string>()
    for (const v of values.values()) { const t = v[c.key]?.text; if (t) labels.add(t) }
    return { key: c.key, label: c.label, kind: 'choice', options: [...labels].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((l) => ({ value: l, label: l })) }
  })
}

/** Ordena pelas colunas `x:`: vazios no fim, números e datas pelo valor, texto em pt-BR. */
export function sortByExtra<T>(list: T[], key: string, dir: 'asc' | 'desc', valueOf: (row: T) => ExtraValue | undefined): T[] {
  const sign = dir === 'asc' ? 1 : -1
  const score = (v: unknown) => (v instanceof Date ? v.getTime() : v)
  return [...list].sort((a, b) => {
    const x = score(valueOf(a)?.raw)
    const y = score(valueOf(b)?.raw)
    if (x == null || x === '') return y == null || y === '' ? 0 : 1
    if (y == null || y === '') return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
    return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * sign
  })
}

// Mock (pnpm dev e VM): uma tabela de exemplo com relações em três níveis e valores estáveis por id.
const MOCK_TABLES: Record<string, ExtraTable> = {
  lista: {
    entitySet: 'lista', primaryId: 'id',
    attrs: [
      { name: 'createdon', label: 'Criado em', kind: 'date' },
      { name: 'modifiedon', label: 'Modificado em', kind: 'date' },
      { name: 'cr40f_observacao', label: 'Observação', kind: 'text' },
      { name: 'cr40f_valor', label: 'Valor', kind: 'number', money: true },
      { name: 'statuscode', label: 'Razão do status', kind: 'choice' },
    ],
    relations: [
      { nav: 'ownerid', label: 'Proprietário', target: 'systemuser', targetLabel: 'Usuários' },
      { nav: 'cr40f_cliente', label: 'Cliente', target: 'cr40f_clientes1', targetLabel: 'Clientes' },
    ],
  },
  systemuser: { entitySet: 'systemusers', primaryId: 'systemuserid', attrs: [{ name: 'fullname', label: 'Nome completo', kind: 'text' }, { name: 'internalemailaddress', label: 'E-mail principal', kind: 'text' }], relations: [] },
  cr40f_clientes1: {
    entitySet: 'cr40f_clientes1s', primaryId: 'cr40f_clientes1id',
    attrs: [{ name: 'cr40f_nomedocliente', label: 'Nome do cliente', kind: 'text' }, { name: 'cr40f_registro', label: 'Registro', kind: 'choice' }],
    relations: [{ nav: 'cr40f_gestor', label: 'Gestor da conta', target: 'cr40f_funcionarios', targetLabel: 'Funcionários' }],
  },
  cr40f_funcionarios: {
    entitySet: 'cr40f_funcionarioses', primaryId: 'cr40f_funcionariosid',
    attrs: [{ name: 'cr40f_nome', label: 'Nome', kind: 'text' }, { name: 'cr40f_telefone', label: 'Telefone', kind: 'text' }],
    relations: [{ nav: 'cr40f_cargo', label: 'Cargo', target: 'cr40f_cargo', targetLabel: 'Cargos' }],
  },
  cr40f_cargo: { entitySet: 'cr40f_cargos', primaryId: 'cr40f_cargoid', attrs: [{ name: 'cr40f_name', label: 'Nome', kind: 'text' }], relations: [] },
}
const MOCK_TEXT: Record<string, string[]> = {
  fullname: ['Renan Mendonça', 'Paula Andrade', 'Equipe Operação'],
  internalemailaddress: ['usuario1@example.com', 'usuario2@example.com', 'usuario3@example.com'],
  cr40f_nomedocliente: ['Tenaris', 'Grupo Atlântico', 'Lumen Consultoria', 'Particular'],
  cr40f_registro: ['SJCampos', 'Pinda', 'Guará'],
  cr40f_nome: ['Ana Souza', 'Bruno Lima', 'Carla Dias'],
  cr40f_telefone: ['(12) 99812-3401', '(12) 99734-1120', '(11) 98123-4567'],
  cr40f_name: ['Gerente de contas', 'Coordenadora', 'Supervisor'],
  cr40f_observacao: ['Cliente pede carro preto', '', 'Confirmar na véspera'],
  statuscode: ['Ativo', 'Pendente', 'Concluído'],
}
const hash = (text: string) => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }

export function createMockExtraSource(): ExtraSource {
  return {
    async table(entity) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      return MOCK_TABLES[entity] ?? MOCK_TABLES.lista
    },
    async values(_entity, columns, ids) {
      const result: ExtraValues = new Map()
      for (const id of ids) {
        const row: Record<string, ExtraValue> = {}
        for (const c of columns) {
          const n = hash(`${id}${c.key}`)
          if (c.attr.kind === 'date') { const d = new Date(Date.UTC(2026, 8 + (n % 2), 1 + (n % 28), 12)); row[c.key] = { raw: d, text: d.toLocaleDateString('pt-BR') } }
          else if (c.attr.kind === 'number') { const v = (n % 90000) / 100; row[c.key] = { raw: v, text: v.toLocaleString('pt-BR', c.attr.money ? { style: 'currency', currency: 'BRL' } : undefined) } }
          else { const opts = MOCK_TEXT[c.attr.name] ?? ['—']; const t = opts[n % opts.length]; row[c.key] = { raw: t || null, text: t } }
        }
        result.set(id.toLowerCase(), row)
      }
      return result
    },
  }
}
