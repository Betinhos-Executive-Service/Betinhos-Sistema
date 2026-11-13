import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button, Dialog } from '@betinhos/ui'
import { columnLabel, lockedCount, type FilterLabel, type LockedFilters } from '../data/table-view'
import type { CatalogField, ViewFilter, ViewFilterGroup } from '../data/views'

const OPERATORS: Record<string, string> = {
  eq: 'igual a', ne: 'diferente de', in: 'é um de', 'not-in': 'não é nenhum de', between: 'entre', like: 'contém', 'not-like': 'não contém',
  'begins-with': 'começa com', 'not-begins-with': 'não começa com', 'ends-with': 'termina com', 'not-ends-with': 'não termina com',
  gt: 'maior que', ge: 'maior ou igual a', lt: 'menor que', le: 'menor ou igual a', null: 'está vazio', 'not-null': 'está preenchido',
  on: 'em', 'on-or-after': 'a partir de', 'on-or-before': 'até', today: 'hoje', tomorrow: 'amanhã', yesterday: 'ontem', 'this-week': 'esta semana',
  'this-month': 'este mês', 'last-month': 'mês passado', 'next-x-days': 'nos próximos dias', 'last-x-days': 'nos últimos dias',
}
const operatorLabel = (operator: string) => OPERATORS[operator] ?? operator

type Describe = (filter: ViewFilter) => string

function describeNative(condition: Element, catalog: CatalogField[]) {
  const attribute = condition.getAttribute('attribute') ?? ''
  const field = catalog.find((item) => item.attribute === attribute)
  const value = condition.getAttribute('value') ?? [...condition.querySelectorAll('value')].map((item) => item.textContent ?? '').join(', ')
  return `${field?.label ?? attribute} · ${operatorLabel(condition.getAttribute('operator') ?? 'condição')}${value ? ` · ${value}` : ''}`
}

/** Filtros originais de uma view nativa (lidos do FetchXML), como o antigo gerenciador mostrava. */
function NativeFilters({ entity, catalog }: { entity: Element | null; catalog: CatalogField[] }) {
  if (!entity) return <p>Não foi possível ler os filtros originais desta view.</p>
  const renderFilter = (filter: Element, key: string) => <li key={key}>
    <strong>{filter.getAttribute('type') === 'or' ? 'OU' : 'E'}</strong>
    <ul>{[...filter.children].map((child, index) => child.tagName === 'filter'
      ? renderFilter(child, `${key}-${index}`)
      : <li key={`${key}-${index}`}>{describeNative(child, catalog)}</li>)}</ul>
  </li>
  const filters = [...entity.querySelectorAll('filter')].filter((filter) => filter.parentElement?.tagName !== 'filter')
  return filters.length ? <ul>{filters.map((filter, index) => renderFilter(filter, `native-${index}`))}</ul> : <p>Esta view não possui filtros originais.</p>
}

const groupList = (groups: ViewFilterGroup[], describe: Describe) => groups.map((group) => (
  <li key={group.id}><strong>{group.operator === 'or' ? 'OU' : 'E'}</strong><ul>{group.filters.map((filter, index) => <li key={index}>{describe(filter)}</li>)}</ul></li>
))

type Props = {
  catalog: CatalogField[]
  /** FetchXML da view nativa cujos filtros não são editáveis aqui; `null` quando não há. */
  nativeFetchXml: string | null
  locked: LockedFilters
  /** Nome do valor de lookup/escolha já lido (o mesmo dos chips). */
  valueLabel: FilterLabel
  onClear: () => void
}

/**
 * Filtros que valem na consulta mas não cabem no painel de filtros do Design System: os originais de uma view nativa e as
 * condições sem equivalente (ex.: "não começa com"). Ficam visíveis aqui, nunca somem em silêncio.
 */
export function ReadOnlyFilters({ catalog, nativeFetchXml, locked, valueLabel, onClear }: Props) {
  const [open, setOpen] = useState(false)
  // Lido uma vez por view: o componente renderiza junto com a linha de comando.
  const { entity, conditions } = useMemo(() => {
    const document = nativeFetchXml ? new DOMParser().parseFromString(nativeFetchXml, 'application/xml') : null
    const root = document && !document.querySelector('parsererror') ? document.querySelector('fetch > entity') : null
    return { entity: root, conditions: root?.querySelectorAll('condition').length ?? 0 }
  }, [nativeFetchXml])
  const byId = useMemo(() => new Map(catalog.map((field) => [field.id, field])), [catalog])
  const describe: Describe = (filter) => {
    const value = (filter.values?.length ? filter.values : filter.value ? [filter.value] : []).map((item) => valueLabel(filter.id, item)).join(', ')
    return `${columnLabel(filter.id, byId)} · ${operatorLabel(filter.operator)}${value ? ` · ${value}` : ''}`
  }
  const own = lockedCount(locked)
  const total = own + conditions
  if (!total) return null
  return <>
    <Button variant="secondary" icon={<Lock size={16} />} aria-haspopup="dialog" title="Filtros desta visão que não são editados no painel de filtros" onClick={() => setOpen(true)}>
      {`Filtros da visão (${total})`}
    </Button>
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Filtros da visão"
      actions={<>
        {own ? <Button variant="secondary" onClick={() => { onClear(); setOpen(false) }}>Remover filtros só leitura</Button> : null}
        <Button onClick={() => setOpen(false)}>Fechar</Button>
      </>}
    >
      {open ? <div className="composition-readonly-filters" aria-label="Filtros originais da view">
        {nativeFetchXml ? <section><h3>Filtros originais aplicados</h3><NativeFilters entity={entity} catalog={catalog} /></section> : null}
        {own ? <section>
          <h3>Condições só leitura</h3>
          <p>Estas condições continuam valendo na consulta, mas o painel de filtros não consegue editá-las.</p>
          <ul>
            {locked.filters.map((filter, index) => <li key={`f-${index}`}>{describe(filter)}</li>)}
            {groupList(locked.groups, describe)}
            {locked.orGroups.length ? <li><strong>Grupos combinados com OU</strong><ul>{groupList(locked.orGroups, describe)}</ul></li> : null}
          </ul>
        </section> : null}
      </div> : null}
    </Dialog>
  </>
}
