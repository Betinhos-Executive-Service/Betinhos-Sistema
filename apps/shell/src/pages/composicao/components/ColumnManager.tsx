import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pin, Plus, Search, X } from 'lucide-react'
import { moneyFields } from '../data/compositions'
import { COMPOSITION_TABLE, defaultViewDefinition, type CatalogField, type ViewDefinition } from '../data/views'

type Props = { catalog: CatalogField[]; definition: ViewDefinition; onChange: (definition: ViewDefinition) => void; onScreenChange?: (screen: 'selected' | 'add') => void; showHeading?: boolean }
export function ColumnManager({ catalog, definition, onChange, onScreenChange, showHeading = true }: Props) {
  const [screen, setScreen] = useState<'selected' | 'add'>('selected')
  const [search, setSearch] = useState('')
  const [table, setTable] = useState('')
  const [dragged, setDragged] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const selected = useMemo(() => new Set(definition.columns.map((column) => column.id)), [definition.columns])
  const byId = useMemo(() => new Map(catalog.map((field) => [field.id, field])), [catalog])
  const groups = useMemo(() => {
    const result = new Map<string, { key: string; label: string; fields: CatalogField[] }>()
    for (const field of catalog) {
      if (!field.available || field.pickerEligible === false) continue
      const key = field.table
      if (!result.has(key)) result.set(key, { key, label: field.tableLabel ?? field.table, fields: [] })
      result.get(key)!.fields.push(field)
    }
    return [...result.values()].sort((a, b) => Number(b.key === COMPOSITION_TABLE) - Number(a.key === COMPOSITION_TABLE) || a.label.localeCompare(b.label, 'pt-BR'))
  }, [catalog])
  const activeGroup = groups.find((group) => group.key === table) ?? groups[0]
  const availableFields = activeGroup?.fields.filter((field) => !selected.has(field.id) && `${field.label} ${field.attribute}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))) ?? []
  const multipleLookups = new Set(activeGroup?.fields.map((field) => field.relationships?.[0]?.to).filter(Boolean)).size > 1
  const lookupLabel = (field: CatalogField) => catalog.find((item) => !item.path.length && item.attribute === field.relationships?.[0]?.to)?.label ?? field.relationships?.[0]?.to
  const update = (columns: ViewDefinition['columns']) => onChange({ ...definition, columns })
  const changeScreen = (next: 'selected' | 'add') => { setScreen(next); setSearch(''); onScreenChange?.(next) }
  const remove = (id: string) => { if (definition.columns.length > 1) update(definition.columns.filter((column) => column.id !== id)) }
  const add = (id: string) => { if (!selected.has(id)) update([...definition.columns, { id, width: 128, pinned: false }]) }
  const pin = (id: string) => {
    const columns = definition.columns.map((column) => column.id === id ? { ...column, pinned: !column.pinned } : column)
    update([...columns.filter((column) => column.pinned), ...columns.filter((column) => !column.pinned)])
  }
  const reorder = (sourceId: string, targetId: string, after: boolean) => {
    if (sourceId === targetId) return
    const columns = [...definition.columns]
    const sourceIndex = columns.findIndex((column) => column.id === sourceId)
    const targetIndex = columns.findIndex((column) => column.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const [source] = columns.splice(sourceIndex, 1)
    const target = columns.find((column) => column.id === targetId)!
    columns.splice(columns.indexOf(target) + Number(after), 0, { ...source, pinned: target.pinned })
    update(columns)
  }
  const move = (id: string, step: number) => {
    const index = definition.columns.findIndex((column) => column.id === id)
    const target = definition.columns[index + step]
    if (target) reorder(id, target.id, step > 0)
  }
  const reset = () => {
    const allowed = new Set(catalog.filter((field) => field.available).map((field) => field.id))
    const columns = defaultViewDefinition(moneyFields.map((field) => field.key)).columns.filter((column) => allowed.has(column.id))
    if (columns.length) update(columns)
  }
  const renderGroup = (title: string, pinned: boolean) => {
    const columns = definition.columns.filter((column) => column.pinned === pinned)
    if (!columns.length) return null
    return <div className="column-manager-section" key={title}><h4>{title}<span>{columns.length}</span></h4>{columns.map((column) => {
      const field = byId.get(column.id)
      const label = field?.label ?? column.id
      const index = definition.columns.findIndex((item) => item.id === column.id)
      return <div key={column.id} className={`column-manager-row${dragged === column.id ? ' is-dragging' : ''}${drop?.id === column.id ? drop.after ? ' is-drop-after' : ' is-drop-before' : ''}`}
        onDragOver={(event) => { if (!dragged || dragged === column.id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setDrop({ id: column.id, after: event.clientY > rect.top + rect.height / 2 }) }}
        onDrop={(event) => { event.preventDefault(); if (dragged && drop?.id === column.id) reorder(dragged, column.id, drop.after); setDragged(null); setDrop(null) }}>
        <button type="button" className="column-manager-drag" draggable aria-label={`Arrastar ${label}`} title="Arraste para ordenar" onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.id); setDragged(column.id) }} onDragEnd={() => { setDragged(null); setDrop(null) }} onKeyDown={(event) => { if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); move(column.id, -1) } if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); move(column.id, 1) } }}><GripVertical size={16} /></button>
        <span className="column-manager-name" title={label}>{label}{!field ? <small>Campo da view não disponível no catálogo</small> : field.pickerEligible === false && column.id !== 'client' && <small>Fora do catálogo atual</small>}</span>
        <div className="column-manager-actions"><button type="button" className={column.pinned ? 'is-active' : ''} aria-label={`${column.pinned ? 'Desafixar' : 'Fixar'} ${label}`} aria-pressed={column.pinned} title={column.pinned ? 'Desafixar coluna' : 'Fixar à esquerda'} onClick={() => pin(column.id)}><Pin size={15} /></button><button type="button" aria-label={`Mover ${label} para cima`} disabled={index === 0} onClick={() => move(column.id, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Mover ${label} para baixo`} disabled={index === definition.columns.length - 1} onClick={() => move(column.id, 1)}><ArrowDown size={15} /></button><button type="button" aria-label={`Remover ${label}`} disabled={definition.columns.length === 1} onClick={() => remove(column.id)}><X size={15} /></button></div>
      </div>
    })}</div>
  }

  return <section className="column-manager" aria-label="Gerenciar colunas">{screen === 'selected' ? <>
    {showHeading && <div className="column-manager-head"><div><h3>Organizar colunas</h3><p>Arraste para ordenar e fixe as colunas mais importantes.</p></div></div>}
    <div className="column-manager-summary"><strong>{definition.columns.length} colunas na grade</strong><button type="button" onClick={reset}>Restaurar padrão</button></div>
    <div className="column-manager-list">{renderGroup('Fixadas', true)}{renderGroup('Outras colunas', false)}</div>
    <button type="button" className="column-manager-add-trigger" onClick={() => changeScreen('add')}><Plus size={17} /> Adicionar colunas</button>
    <p className="column-manager-foot">Arraste ou use Alt + ↑/↓ para reordenar.</p>
  </> : <>
    <button type="button" className="column-manager-back" onClick={() => changeScreen('selected')}><ArrowLeft size={16} /> Organizar colunas</button>
    {showHeading && <div className="column-manager-head"><div><h3>Adicionar colunas</h3><p>Escolha uma tabela e adicione os campos à grade.</p></div></div>}
    <div className="column-manager-picker"><nav className="column-manager-tables" aria-label="Tabelas disponíveis"><strong>Tabelas</strong>{groups.map((group) => <button type="button" key={group.key} className={activeGroup?.key === group.key ? 'is-active' : ''} aria-current={activeGroup?.key === group.key ? 'true' : undefined} onClick={() => { setTable(group.key); setSearch('') }}><span>{group.label}</span><small>{group.fields.filter((field) => !selected.has(field.id)).length}</small></button>)}</nav>
      <div className="column-manager-fields"><div className="column-manager-fields-head"><strong>Campos disponíveis</strong><span>{activeGroup?.label ?? 'Nenhuma tabela'}</span></div><label className="column-manager-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar campo" aria-label="Buscar campo" /></label><div className="column-manager-field-list">{availableFields.length ? availableFields.map((field, index) => <Fragment key={field.id}>{multipleLookups && field.relationships?.[0]?.to !== availableFields[index - 1]?.relationships?.[0]?.to && <div className="column-manager-lookup-label">Via {lookupLabel(field)}</div>}<button type="button" aria-label={`Adicionar ${field.label}${multipleLookups ? ` via ${lookupLabel(field)}` : ''}`} onClick={() => add(field.id)}><span>{field.label}</span><Plus size={16} aria-hidden="true" /></button></Fragment>) : <p>{search ? 'Nenhum campo encontrado.' : 'Todas as colunas desta tabela já foram adicionadas.'}</p>}</div></div>
    </div><p className="column-manager-foot">Somente campos personalizados e datas de auditoria da composição.</p>
  </>}</section>
}
