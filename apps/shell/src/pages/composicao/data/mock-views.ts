import { moneyFields, type Composition } from './compositions'
import type { CompositionTotalRow } from './dataverse'
import type { CatalogField, SavedView, ViewDefinition } from './views'

const STORAGE_KEY = 'tela-composicao-preco:mock-views:v1'

export function mockColumnCatalog(): CatalogField[] {
  return [
    { id: 'new_status', label: 'Status', type: 'Status' },
    { id: 'client', label: 'Cliente', type: 'String' },
    { id: 'route', label: 'Trajeto', type: 'String' },
    { id: 'date', label: 'Data', type: 'DateTime' },
    ...moneyFields.map(({ key, label }) => ({ id: key, label, type: 'Money' })),
  ].map((field) => ({ ...field, table: field.id === 'client' ? 'cr40f_clientes1' : field.id === 'route' ? 'cr40f_reservadeveiculos' : 'cr40f_composicaodeprecos', tableLabel: field.id === 'client' ? 'Clientes' : field.id === 'route' ? 'Reserva de Veículos' : 'Composição de Preços', attribute: field.id, path: field.id === 'client' || field.id === 'route' ? [field.id] : [], available: true, pickerEligible: true }))
}

export function loadMockViews(): SavedView[] {
  const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as unknown
  if (!Array.isArray(saved)) throw new Error('As views locais estão corrompidas. Limpe o armazenamento deste site para recomeçar.')
  return saved.filter((view): view is SavedView => {
    if (!view || typeof view !== 'object') return false
    const item = view as Partial<SavedView>
    return typeof item.id === 'string' && typeof item.name === 'string' &&
      (item.kind === 'personal' || item.kind === 'public') && Array.isArray(item.definition?.columns) &&
      Array.isArray(item.definition.filters) && Array.isArray(item.definition.sort)
  }).map((view) => ({ ...view, managed: true }))
}

export function saveMockView(name: string, kind: SavedView['kind'], definition: ViewDefinition, existing?: SavedView): SavedView {
  if (!name.trim() || !definition.columns.length) throw new Error('Informe o nome e escolha ao menos uma coluna.')
  if (existing && !existing.managed) throw new Error('Esta view não pode ser alterada.')
  const views = loadMockViews()
  if (existing && !views.some((view) => view.id === existing.id)) throw new Error('A view local não existe mais.')
  const saved: SavedView = { id: existing?.id ?? crypto.randomUUID(), name: name.trim(), kind, definition, managed: true }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing ? views.map((view) => view.id === existing.id ? saved : view) : [...views, saved]))
  return saved
}

export function deleteMockView(view: SavedView) {
  if (!view.managed) throw new Error('Esta view não pode ser excluída.')
  const views = loadMockViews()
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views.filter((item) => item.id !== view.id)))
}

type MockViewRow = Composition | CompositionTotalRow

function value(row: MockViewRow, id: string): string {
  if (id === 'client') return row.client
  if (id === 'route') return row.route
  if (id === 'date' || id === 'modifiedon') return row.departureAt
  return row.values[id as keyof typeof row.values] ?? ''
}

export function applyMockView<T extends MockViewRow>(rows: T[], definition: ViewDefinition): T[] {
  const matches = (row: T, filter: ViewDefinition['filters'][number]) => {
    const raw = String(value(row, filter.id) ?? '')
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(filter.value) && /^\d{4}-\d{2}-\d{2}T/.test(raw)
    const date = dateOnly && raw ? new Date(raw) : null
    const current = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : raw
    if (filter.operator === 'null') return current === ''
    if (filter.operator === 'not-null') return current !== ''
    if (filter.operator === 'in') return (filter.values ?? []).some((candidate) => current.toLocaleLowerCase('pt-BR') === candidate.toLocaleLowerCase('pt-BR'))
    const left = current.toLocaleLowerCase('pt-BR') === '1' ? 'true' : current.toLocaleLowerCase('pt-BR') === '0' ? 'false' : current.toLocaleLowerCase('pt-BR')
    const right = filter.value.toLocaleLowerCase('pt-BR') === '1' ? 'true' : filter.value.toLocaleLowerCase('pt-BR') === '0' ? 'false' : filter.value.toLocaleLowerCase('pt-BR')
    if (filter.operator === 'like') return left.includes(right)
    if (filter.operator === 'not-like') return !left.includes(right)
    if (filter.operator === 'begins-with') return left.startsWith(right)
    if (filter.operator === 'not-begins-with') return !left.startsWith(right)
    if (filter.operator === 'ends-with') return left.endsWith(right)
    if (filter.operator === 'not-ends-with') return !left.endsWith(right)
    if (['gt', 'ge', 'lt', 'le'].includes(filter.operator)) {
      const a = Number(current), b = Number(filter.value)
      const comparison = current !== '' && filter.value !== '' && Number.isFinite(a) && Number.isFinite(b) ? a - b : current.localeCompare(filter.value, 'pt-BR')
      return filter.operator === 'gt' ? comparison > 0 : filter.operator === 'ge' ? comparison >= 0 : filter.operator === 'lt' ? comparison < 0 : comparison <= 0
    }
    return filter.operator === 'eq' ? left === right : left !== right
  }
  const filtered = rows.filter((row) => definition.filters.every((filter) => matches(row, filter)) && (() => {
    const groups = (definition.filterGroups ?? []).filter((group) => group.filters.length)
    if (!groups.length) return true
    const groupMatches = (group: typeof groups[number]) => group.operator === 'or' ? group.filters.some((filter) => matches(row, filter)) : group.filters.every((filter) => matches(row, filter))
    return definition.groupOperator === 'or' ? groups.some(groupMatches) : groups.every(groupMatches)
  })())
  if (!definition.sort.length) return filtered
  return filtered.sort((a, b) => {
    for (const order of definition.sort) {
      const aValue = value(a, order.id)
      const bValue = value(b, order.id)
      const aNumber = Number(aValue)
      const bNumber = Number(bValue)
      const comparison = aValue && bValue && Number.isFinite(aNumber) && Number.isFinite(bNumber)
        ? aNumber - bNumber : aValue.localeCompare(bValue, 'pt-BR', { numeric: true })
      if (comparison) return order.descending ? -comparison : comparison
    }
    return a.id.localeCompare(b.id)
  })
}
