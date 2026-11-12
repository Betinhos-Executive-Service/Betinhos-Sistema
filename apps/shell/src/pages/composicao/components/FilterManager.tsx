import { Fragment, useState } from 'react'
import { ArrowLeft, Plus, Search, X } from 'lucide-react'
import { SearchFilterSelect } from './SearchFilterSelect'
import { SearchableSelect } from './SearchableSelect'
import type { CatalogField, ViewDefinition, ViewFilter, ViewFilterGroup } from '../data/views'

type Props = { catalog: CatalogField[]; definition: ViewDefinition; onChange: (definition: ViewDefinition) => void; showSort?: boolean; drawer?: boolean }
const textOperators = [['eq', 'É'], ['ne', 'Não é'], ['like', 'Contém'], ['not-like', 'Não contém'], ['begins-with', 'Começa com'], ['not-begins-with', 'Não começa com'], ['ends-with', 'Termina com'], ['not-ends-with', 'Não termina com'], ['null', 'Está vazio'], ['not-null', 'Não está vazio']] as const
const comparisonOperators = [['eq', 'Igual a'], ['ne', 'Diferente de'], ['gt', 'Maior que'], ['ge', 'Maior ou igual a'], ['lt', 'Menor que'], ['le', 'Menor ou igual a'], ['null', 'Está vazio'], ['not-null', 'Não está vazio']] as const
const dateOperators = [['eq', 'Em'], ['ne', 'Fora do dia'], ['gt', 'Depois de'], ['ge', 'A partir de'], ['lt', 'Antes de'], ['le', 'Até'], ['null', 'Está vazio'], ['not-null', 'Não está vazio']] as const
const selectionOperators = [['eq', 'É'], ['ne', 'Não é'], ['null', 'Está vazio'], ['not-null', 'Não está vazio']] as const
const isSelection = (field?: CatalogField) => field?.type === 'Lookup' || field?.type === 'Picklist' || field?.type === 'State' || field?.type === 'Status'
const operatorsFor = (field?: CatalogField) => field?.type === 'DateTime' ? dateOperators : isSelection(field) || field?.type === 'Boolean' ? selectionOperators : field?.type === 'String' || field?.type === 'Memo' ? textOperators : comparisonOperators
const emptyFilter = (id: string): ViewFilter => ({ id, operator: 'eq', value: '' })

function MultiValueEditor({ field, values, onChange }: { field?: CatalogField; values: string[]; onChange: (values: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = (value: string) => {
    const next = value.trim()
    if (next && !values.includes(next)) onChange([...values, next])
    setInput('')
  }
  return <div className="filter-manager-multi-editor">
    {values.map((value) => <span className="filter-manager-multi-chip" key={value} title={value}>{value}<button type="button" aria-label={`Remover valor ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}><X size={12} /></button></span>)}
    {field && isSelection(field) ? <SearchFilterSelect field={field} value="" onChange={add} /> : <input aria-label="Adicionar valor à seleção" value={input} placeholder="Digite e pressione Enter" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(input) } }} />}
  </div>
}

export function FilterManager({ catalog, definition, onChange, showSort = true, drawer = false }: Props) {
  const [pickerGroup, setPickerGroup] = useState<string | null | undefined>(undefined)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTable, setPickerTable] = useState('')
  const [showAllGridFields, setShowAllGridFields] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const groups = definition.filterGroups ?? []
  const filterable = catalog.filter((field) => field.available && (field.pickerEligible !== false || definition.columns.some((column) => column.id === field.id) || definition.filters.some((filter) => filter.id === field.id) || groups.some((group) => group.filters.some((filter) => filter.id === field.id))))
  const fieldFor = (id: string) => catalog.find((field) => field.id === id)
  const updateGroup = (id: string, update: Partial<ViewFilterGroup>) => onChange({ ...definition, filterGroups: groups.map((group) => group.id === id ? { ...group, ...update } : group) })
  const startGroups = () => {
    const id = crypto.randomUUID()
    onChange({ ...definition, filters: [], groupOperator: 'or', filterGroups: [{ id, operator: 'and', filters: definition.filters }] })
    setOpenGroup(id)
  }
  const addGroup = () => {
    const id = crypto.randomUUID()
    onChange({ ...definition, filterGroups: [...groups, { id, operator: 'and', filters: [] }] })
    setOpenGroup(id)
  }
  const addSelectedField = (id: string) => {
    if (pickerGroup === undefined) return
    if (pickerGroup === null) onChange({ ...definition, filters: [...definition.filters, emptyFilter(id)] })
    else onChange({ ...definition, filterGroups: groups.map((group) => group.id === pickerGroup ? { ...group, filters: [...group.filters, emptyFilter(id)] } : group) })
    setPickerGroup(undefined)
  }
  const renderFilter = (filter: ViewFilter, index: number, group?: ViewFilterGroup) => {
    const field = fieldFor(filter.id)
    const filters = group?.filters ?? definition.filters
    const update = (change: Partial<ViewFilter>) => {
      const next = filters.map((item, position) => position === index ? { ...item, ...change } : item)
      if (group) updateGroup(group.id, { filters: next })
      else onChange({ ...definition, filters: next })
    }
    const remove = () => {
      const next = filters.filter((_, position) => position !== index)
      if (group) updateGroup(group.id, { filters: next })
      else onChange({ ...definition, filters: next })
    }
    const booleanValue = filter.operator === 'ne' ? (filter.value === 'true' || filter.value === '1' ? 'false' : 'true') : filter.value
    const needsValue = filter.operator !== 'null' && filter.operator !== 'not-null' && (filter.operator === 'in' ? !filter.values?.length : !filter.value.trim())
    return <Fragment key={`${group?.id ?? 'root'}-${index}`}>
      {index > 0 && <div className="filter-manager-condition-join">{group && index === 1 ? <><span>Combinar condições</span><div className="filter-manager-logic" role="group" aria-label={`Operador do grupo ${groups.indexOf(group) + 1}`}><button type="button" className={group.operator === 'and' ? 'is-active' : ''} aria-pressed={group.operator === 'and'} onClick={() => updateGroup(group.id, { operator: 'and' })}>E</button><button type="button" className={group.operator === 'or' ? 'is-active' : ''} aria-pressed={group.operator === 'or'} onClick={() => updateGroup(group.id, { operator: 'or' })}>OU</button></div></> : <span>{group?.operator === 'or' ? 'OU' : 'E'}</span>}</div>}
      <div className="filter-manager-row">
      <div className="filter-manager-row__head"><div><strong>{field?.label ?? filter.id}</strong>{field?.path.length ? <small>{field.tableLabel ?? field.table}</small> : null}</div><button type="button" className="filter-manager-remove" aria-label={`Remover filtro de ${field?.label ?? filter.id}`} onClick={remove}>Remover</button></div>
      <div className="filter-manager-row__controls">
      {(field?.type !== 'Boolean' || filter.operator === 'null' || filter.operator === 'not-null') && <SearchableSelect aria-label={`Operador de ${field?.label ?? filter.id}`} value={filter.operator} onChange={(value) => update({ operator: value as ViewFilter['operator'], value: '', values: undefined })} options={[...(filter.operator === 'in' ? [{ value: 'in', label: 'Um destes valores' }] : []), ...operatorsFor(field).map(([value, label]) => ({ value, label }))]} />}
      {field?.type === 'Boolean' && filter.operator !== 'null' && filter.operator !== 'not-null' ? <div className="filter-manager-logic" role="group" aria-label={`Valor de ${field.label}`}><button type="button" className={booleanValue === 'true' || booleanValue === '1' ? 'is-active' : ''} aria-pressed={booleanValue === 'true' || booleanValue === '1'} onClick={() => update({ operator: 'eq', value: 'true' })}>Sim</button><button type="button" className={booleanValue === 'false' || booleanValue === '0' ? 'is-active' : ''} aria-pressed={booleanValue === 'false' || booleanValue === '0'} onClick={() => update({ operator: 'eq', value: 'false' })}>Não</button></div> : filter.operator === 'in' ? <MultiValueEditor field={field} values={filter.values ?? []} onChange={(values) => update({ values })} /> : filter.operator !== 'null' && filter.operator !== 'not-null' && (field && isSelection(field) ? <SearchFilterSelect field={field} value={filter.value} onChange={(value) => update({ value })} /> : <input type={field?.type === 'DateTime' ? 'date' : ['Money', 'Integer', 'BigInt', 'Decimal', 'Double'].includes(field?.type ?? '') ? 'number' : 'text'} value={field?.type === 'DateTime' ? filter.value.slice(0, 10) : filter.value} aria-label={`Valor do filtro de ${field?.label ?? filter.id}`} placeholder="Informe o valor" onChange={(event) => update({ value: event.target.value })} />)}
      </div>
      {needsValue && <small className="filter-manager-row__prompt">{field?.type === 'Boolean' ? 'Selecione Sim ou Não.' : 'Informe um valor para este filtro.'}</small>}
      {!group && groups.length > 0 && <SearchableSelect className="filter-manager-move" aria-label={`Mover ${field?.label ?? filter.id} para grupo`} value="" placeholder="Mover para grupo…" onChange={(value) => {
        const target = groups.find((item) => item.id === value)
        if (target) onChange({ ...definition, filters: definition.filters.filter((_, position) => position !== index), filterGroups: groups.map((item) => item.id === target.id ? { ...item, filters: [...item.filters, filter] } : item) })
      }} options={groups.map((item, position) => ({ value: item.id, label: `Grupo ${position + 1}` }))} />}
      </div>
    </Fragment>
  }
  const addCondition = (group?: ViewFilterGroup) => <button type="button" className="filter-manager-add" onClick={() => { setPickerSearch(''); setPickerTable(''); setShowAllGridFields(false); setPickerGroup(group?.id ?? null) }}><Plus size={16} aria-hidden="true" /> Adicionar {group ? 'condição' : 'filtro'}</button>
  const visibleIds = new Set(definition.columns.map((column) => column.id))
  const gridFields = filterable.filter((field) => visibleIds.has(field.id))
  const otherFields = filterable.filter((field) => !visibleIds.has(field.id))
  const tableKeyFor = (field: CatalogField) => `${field.table}|${field.path.join('/')}|${field.relationships?.map((relation) => relation.to).join('/') ?? ''}`
  const tableKeys = [...new Set(otherFields.map(tableKeyFor))]
  const matchesSearch = (field: CatalogField) => `${field.label} ${field.tableLabel ?? field.table}`.toLocaleLowerCase('pt-BR').includes(pickerSearch.trim().toLocaleLowerCase('pt-BR'))
  const matchingTableKeys = pickerSearch.trim() ? tableKeys.filter((key) => otherFields.some((field) => tableKeyFor(field) === key && matchesSearch(field))) : tableKeys
  const currentTable = matchingTableKeys.includes(pickerTable) ? pickerTable : matchingTableKeys[0]
  const matchingGridFields = gridFields.filter(matchesSearch)
  const matchingOtherFields = otherFields.filter((field) => tableKeyFor(field) === currentTable && matchesSearch(field))
  const shownGridFields = pickerSearch.trim() || showAllGridFields ? matchingGridFields : matchingGridFields.slice(0, 5)
  const betweenGroups = (position: number) => position > 0 && <div className="filter-manager-between">
    {position === 1 ? <><span>Combinar grupos</span><div className="filter-manager-logic" role="group" aria-label="Operador entre grupos"><button type="button" className={(definition.groupOperator ?? 'and') === 'and' ? 'is-active' : ''} aria-pressed={(definition.groupOperator ?? 'and') === 'and'} onClick={() => onChange({ ...definition, groupOperator: 'and' })}>E</button><button type="button" className={definition.groupOperator === 'or' ? 'is-active' : ''} aria-pressed={definition.groupOperator === 'or'} onClick={() => onChange({ ...definition, groupOperator: 'or' })}>OU</button></div><small>{definition.groupOperator === 'or' ? 'Basta um grupo corresponder' : 'Todos os grupos devem corresponder'}</small></> : <span>{definition.groupOperator === 'or' ? 'OU' : 'E'}</span>}
  </div>
  if (pickerGroup !== undefined) return <section className="filter-manager filter-manager--picker" aria-label="Escolher campo do filtro"><button type="button" className="filter-manager-picker-back" onClick={() => setPickerGroup(undefined)}><ArrowLeft size={16} /> Voltar aos filtros</button><h3>Escolha o que filtrar</h3><label className="filter-manager-picker-search"><Search size={16} /><input autoFocus value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Buscar campo" aria-label="Buscar campo" /></label><div className="filter-manager-picker-section"><h4>Colunas da grade</h4>{shownGridFields.map((field) => <button type="button" key={field.id} onClick={() => addSelectedField(field.id)}>{field.label}<Plus size={16} /></button>)}{!pickerSearch.trim() && matchingGridFields.length > 5 && <button type="button" className="filter-manager-picker-more" onClick={() => setShowAllGridFields(!showAllGridFields)}>{showAllGridFields ? 'Mostrar menos' : `Ver todas as ${matchingGridFields.length} colunas`}</button>}</div><div className="filter-manager-picker-section" hidden={!matchingTableKeys.length}><h4>Outros campos</h4>{matchingTableKeys.length ? <><SearchableSelect className="filter-manager-picker-table" aria-label="Tabela dos outros campos" value={currentTable} onChange={setPickerTable} options={matchingTableKeys.map((key) => { const field = otherFields.find((item) => tableKeyFor(item) === key)!; return { value: key, label: `${field.tableLabel ?? field.table}${field.relationships?.length ? ` · via ${catalog.find((item) => !item.path.length && item.attribute === field.relationships?.[0]?.to)?.label ?? field.relationships[0].to}` : ''}` } })} /><p className="filter-manager-picker-count">{matchingOtherFields.length} {matchingOtherFields.length === 1 ? 'campo disponível' : 'campos disponíveis'}</p>{matchingOtherFields.map((field) => <button type="button" key={field.id} onClick={() => addSelectedField(field.id)}><span>{field.label}</span><Plus size={16} aria-hidden="true" /></button>)}{!matchingOtherFields.length && <p className="filter-manager-picker-empty">Nenhum campo encontrado nesta tabela.</p>}</> : <p>Nenhum outro campo disponível.</p>}</div></section>

  return <section className={`filter-manager${drawer ? ' filter-manager--drawer' : ''}`} aria-label={showSort ? 'Configurar filtros e ordenação' : 'Configurar filtros'}>
    {(!groups.length || definition.filters.length > 0) && <div className="filter-manager-block filter-manager-simple">{groups.length > 0 && <><h3>Condições obrigatórias</h3><p>Estas condições são aplicadas junto com os grupos desta view.</p></>}{definition.filters.length ? definition.filters.map((filter, index) => renderFilter(filter, index)) : <div className="filter-manager-empty">Nenhum filtro aplicado.</div>}{addCondition()}{!groups.length && <button type="button" className="filter-manager-advanced" onClick={startGroups}>Avançado · combinar com E/OU</button>}</div>}
    {groups.map((group, position) => { const expanded = openGroup === group.id || (openGroup === null && position === 0); return <Fragment key={group.id}>{betweenGroups(position)}<div className="filter-manager-group"><div className="filter-manager-group__head"><button type="button" className="filter-manager-group-toggle" aria-expanded={expanded} onClick={() => setOpenGroup(expanded ? '' : group.id)}><strong>Grupo {position + 1}</strong><small>{group.filters.length} {group.filters.length === 1 ? 'condição' : 'condições'}{group.filters.length > 1 ? ` · ${group.operator === 'and' ? 'E' : 'OU'}` : ''}</small></button>{expanded && <button type="button" className="filter-manager-group-remove" onClick={() => onChange({ ...definition, filterGroups: groups.filter((item) => item.id !== group.id) })}>Remover grupo</button>}</div>{expanded && <div className="filter-manager-group-body">{group.filters.length ? group.filters.map((filter, index) => renderFilter(filter, index, group)) : <p className="filter-manager-group__empty">Adicione uma condição.</p>}{addCondition(group)}</div>}</div></Fragment> })}
    {groups.length > 0 && <button type="button" className="filter-manager-add filter-manager-add-group" onClick={addGroup}><Plus size={16} /> Adicionar grupo</button>}
    {groups.length === 1 && (groups[0].operator === 'and' || groups[0].filters.length <= 1) && <button type="button" className="filter-manager-advanced" onClick={() => onChange({ ...definition, filters: [...definition.filters, ...groups[0].filters], filterGroups: [] })}>Usar filtros sem grupos</button>}
    {showSort && <div className="filter-manager-block"><h3>Ordenação</h3><div className="filter-manager-sort"><label>Ordenar por<SearchableSelect value={definition.sort[0]?.id ?? ''} aria-label="Ordenar por" onChange={(value) => onChange({ ...definition, sort: value ? [{ id: value, descending: definition.sort[0]?.descending ?? false }] : [] })} options={[{ value: '', label: 'Sem ordenação' }, ...(definition.sort[0] && !catalog.some((field) => field.id === definition.sort[0].id) ? [{ value: definition.sort[0].id, label: 'Padrão · mais recentes' }] : []), ...catalog.filter((field) => field.available).map((field) => ({ value: field.id, label: `${field.label} · ${field.table}` }))]} /></label><label>Direção<SearchableSelect aria-label="Direção da ordenação" value={definition.sort[0]?.descending ? 'desc' : 'asc'} disabled={!definition.sort.length} onChange={(value) => onChange({ ...definition, sort: definition.sort.map((item, index) => index === 0 ? { ...item, descending: value === 'desc' } : item) })} options={[{ value: 'asc', label: 'Crescente' }, { value: 'desc', label: 'Decrescente' }]} /></label></div></div>}
  </section>
}
