import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Columns3, Filter, Plus, Settings2, Trash2, X } from 'lucide-react'
import { Button } from '@betinhos/ui'
import { ColumnManager } from './ColumnManager'
import { FilterManager } from './FilterManager'
import { SearchableSelect } from './SearchableSelect'
import { moneyFields } from '../data/compositions'
import { defaultViewDefinition, type CatalogField, type SavedView, type ViewDefinition } from '../data/views'

type Kind = 'personal' | 'public'
type Props = {
  catalog: CatalogField[]
  views: SavedView[]
  active: SavedView | null
  definition: ViewDefinition
  disabled: boolean
  mockMode?: boolean
  filterDrawerHost?: HTMLElement | null
  onChange: (definition: ViewDefinition) => void
  onSelect: (id: string) => void
  onSave: (name: string, kind: Kind, overwrite: boolean, definition: ViewDefinition) => Promise<void>
  onDelete: () => Promise<void>
}

const steps = ['Identificação', 'Colunas', 'Filtros', 'Revisão'] as const
const drawerWidthKey = 'tela-composicao-preco:filter-drawer-width'
const minDrawerWidth = 360
const drawerWidthLimit = () => Math.max(minDrawerWidth, window.innerWidth - 300)
const clampDrawerWidth = (value: number) => Math.min(drawerWidthLimit(), Math.max(minDrawerWidth, value))
const comparableDefinition = (definition: ViewDefinition) => ({
  columns: definition.columns,
  filters: definition.filters,
  sort: definition.sort,
  filterGroups: definition.filterGroups?.length ? definition.filterGroups : undefined,
  groupOperator: definition.filterGroups?.length ? definition.groupOperator : undefined,
})

function NativeFilters({ fetchXml, catalog }: { fetchXml: string; catalog: CatalogField[] }) {
  const document = new DOMParser().parseFromString(fetchXml, 'application/xml')
  const entity = document.querySelector('fetch > entity')
  if (!entity || document.querySelector('parsererror')) return <p className="view-native-note">Não foi possível ler os filtros originais desta view.</p>
  const renderFilter = (filter: Element, key: string) => <li key={key}>
    <strong>{filter.getAttribute('type') === 'or' ? 'OU' : 'E'}</strong>
    <ul>{[...filter.children].map((child, index) => child.tagName === 'filter'
      ? renderFilter(child, `${key}-${index}`)
      : <li key={`${key}-${index}`}>{(() => {
          const attribute = child.getAttribute('attribute') ?? ''
          const field = catalog.find((item) => item.attribute === attribute)
          const values = [...child.querySelectorAll('value')].map((value) => value.textContent ?? '').join(', ')
          const value = child.getAttribute('value') ?? values
          return `${field?.label ?? attribute} · ${child.getAttribute('operator') ?? 'condição'}${value ? ` · ${value}` : ''}`
        })()}</li>)}</ul>
  </li>
  const filters = [...entity.querySelectorAll('filter')].filter((filter) => filter.parentElement?.tagName !== 'filter')
  return filters.length ? <section className="view-native-filters" aria-label="Filtros originais da view"><strong>Filtros originais aplicados</strong><ul>{filters.map((filter, index) => renderFilter(filter, `native-${index}`))}</ul></section> : <p className="view-native-note">Esta view não possui filtros originais.</p>
}

export function ViewManager({ catalog, views, active, definition, disabled, mockMode, filterDrawerHost, onChange, onSelect, onSave, onDelete }: Props) {
  const [panel, setPanel] = useState<'columns' | 'filters' | 'create' | 'wizard' | null>(null)
  const [columnScreen, setColumnScreen] = useState<'selected' | 'add'>('selected')
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [draft, setDraft] = useState(definition)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('personal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try { return clampDrawerWidth(Number(window.localStorage.getItem(drawerWidthKey)) || 620) }
    catch { return 620 }
  })
  const dirty = useMemo(() => JSON.stringify(comparableDefinition(definition)) !== JSON.stringify(comparableDefinition(active?.definition ?? defaultViewDefinition(moneyFields.map((field) => field.key)))), [active, definition])
  const nativeFilterCount = useMemo(() => {
    if (!active?.nativeOnly || active.nativeFiltersEditable || !active.sourceFetchXml) return 0
    const document = new DOMParser().parseFromString(active.sourceFetchXml, 'application/xml')
    return document.querySelector('parsererror') ? 0 : document.querySelectorAll('fetch > entity condition').length
  }, [active])
  const filterCount = nativeFilterCount + definition.filters.length + (definition.filterGroups ?? []).reduce((total, group) => total + group.filters.length, 0)
  const editable = mode === 'edit' && active?.managed && kind === active.kind
  const hasEmptyGroup = (draft.filterGroups ?? []).some((group) => group.filters.length === 0)
  const draftFilters = [...draft.filters, ...(draft.filterGroups ?? []).flatMap((group) => group.filters)]
  const incompleteFilterCount = draftFilters.filter((filter) => filter.operator !== 'null' && filter.operator !== 'not-null' && (filter.operator === 'in' ? !filter.values?.length : !filter.value.trim())).length
  const validFilters = !hasEmptyGroup && incompleteFilterCount === 0
  const title = mode === 'edit' ? `Gerenciar ${active?.name ?? 'view'}` : 'Criar uma view'
  const openWizard = (nextMode: 'create' | 'edit') => {
    setMode(nextMode); setDraft(definition); setStep(0)
    setName(nextMode === 'edit' ? active?.name ?? '' : '')
    setKind(nextMode === 'edit' ? active?.kind ?? 'personal' : 'personal')
    setError(''); setConfirmDelete(false); setPanel(nextMode === 'create' ? 'create' : 'wizard')
  }
  const close = () => { if (!busy) { setPanel(null); setError(''); setConfirmDelete(false) } }
  const save = async (overwrite: boolean) => {
    setBusy(true); setError('')
    try { await onSave(name.trim(), kind, overwrite, draft); setPanel(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true); setError('')
    try { await onDelete(); setPanel(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (filterDrawerHost) filterDrawerHost.style.setProperty('--filter-drawer-width', `${drawerWidth}px`)
  }, [drawerWidth, filterDrawerHost])
  const resizeDrawer = (clientX: number, save = false) => {
    const width = clampDrawerWidth(window.innerWidth - clientX)
    setDrawerWidth(width)
    if (save) { try { window.localStorage.setItem(drawerWidthKey, String(width)) } catch { /* Armazenamento indisponível. */ } }
  }
  return <>
    <label className="view-select-label">View<SearchableSelect className="view-select-menu" aria-label="Selecionar view" value={active?.id ?? ''} disabled={disabled} onChange={onSelect} options={[{ value: '', label: 'Padrão' }, ...views.map((view) => ({ value: view.id, label: view.name, icon: view.kind === 'personal' ? 'user' as const : undefined }))]} /></label>
    <Button variant="secondary" size="compact" className="view-settings-button" title="Colunas" icon={<Columns3 size={16} aria-hidden="true" />} disabled={disabled || !catalog.length} aria-expanded={panel === 'columns'} onClick={() => { if (panel === 'columns') close(); else { setDraft(definition); setColumnScreen('selected'); setPanel('columns') } }}><span className="view-button-label">Colunas</span></Button>
    <Button variant="secondary" size="compact" className="view-settings-button" title="Filtros" icon={<Filter size={16} aria-hidden="true" />} disabled={disabled || !catalog.length} onClick={() => { setDraft(definition); setError(''); setPanel('filters') }}><span className="view-button-label">Filtros</span>{filterCount ? <span className="view-button-count" aria-hidden="true">{filterCount}</span> : null}</Button>
    <Button variant="action" size="compact" className="view-settings-button" title="Nova view" icon={<Plus size={16} aria-hidden="true" />} disabled={disabled || !catalog.length} onClick={() => openWizard('create')}><span className="view-button-label">Nova view</span></Button>
    {active && <Button variant="secondary" size="compact" className="view-settings-button" title="Gerenciar" icon={<Settings2 size={16} aria-hidden="true" />} disabled={disabled || !catalog.length || (active.nativeOnly && !active.nativeFiltersEditable)} onClick={() => openWizard('edit')}><span className="view-button-label">Gerenciar</span></Button>}
    {dirty && <span className="view-unsaved-indicator" role="status">Alterações não salvas</span>}

    {panel === 'columns' && (() => {
      const drawer = <section className="view-editor view-column-drawer" role="dialog" aria-labelledby="column-editor-title" onKeyDown={(event) => { if (event.key === 'Escape') close() }}><div className="view-filter-drawer__resize" role="separator" tabIndex={0} aria-label="Redimensionar painel de colunas" aria-orientation="vertical" aria-valuemin={minDrawerWidth} aria-valuemax={drawerWidthLimit()} aria-valuenow={drawerWidth} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeDrawer(event.clientX) }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { resizeDrawer(event.clientX, true); event.currentTarget.releasePointerCapture(event.pointerId) } }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const width = clampDrawerWidth(drawerWidth + (event.key === 'ArrowLeft' ? 20 : -20)); setDrawerWidth(width); try { window.localStorage.setItem(drawerWidthKey, String(width)) } catch { /* Armazenamento indisponível. */ } } }} /><header className="view-editor-header"><div><span className="view-editor-eyebrow">COLUNAS DA GRADE</span><h2 id="column-editor-title">{columnScreen === 'add' ? 'Adicionar colunas' : 'Organizar colunas'}</h2><p>{active?.name ?? 'Composição de Preços'}</p></div><button type="button" className="view-icon-button" onClick={close} aria-label="Fechar colunas"><X size={18} /></button></header>{active?.nativeOnly && <p className="view-native-note">As colunas originais da visualização permanecem na consulta. Ajuste as colunas exibidas nesta grade.</p>}<div className="view-editor-content"><ColumnManager catalog={catalog} definition={draft} onChange={setDraft} onScreenChange={setColumnScreen} showHeading={false} /></div><footer className="view-editor-actions"><button type="button" onClick={close}>Cancelar</button><button type="button" className="view-primary-action" disabled={!draft.columns.length} onClick={() => { onChange(draft); close() }}>Aplicar colunas</button></footer></section>
      return filterDrawerHost ? createPortal(drawer, filterDrawerHost) : drawer
    })()}

    {panel === 'filters' && (() => {
      const drawer = <section className="view-editor view-filter-drawer" role="dialog" aria-labelledby="filter-editor-title" onKeyDown={(event) => { if (event.key === 'Escape') close() }}><div className="view-filter-drawer__resize" role="separator" tabIndex={0} aria-label="Redimensionar painel de filtros" aria-orientation="vertical" aria-valuemin={minDrawerWidth} aria-valuemax={drawerWidthLimit()} aria-valuenow={drawerWidth} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeDrawer(event.clientX) }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { resizeDrawer(event.clientX, true); event.currentTarget.releasePointerCapture(event.pointerId) } }} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const width = clampDrawerWidth(drawerWidth + (event.key === 'ArrowLeft' ? 20 : -20)); setDrawerWidth(width); try { window.localStorage.setItem(drawerWidthKey, String(width)) } catch { /* Armazenamento indisponível. */ } } }} /><header className="view-editor-header"><div><span className="view-editor-eyebrow">CONFIGURAR GRADE</span><h2 id="filter-editor-title">Filtros</h2><p>{active?.name ?? 'Composição de Preços'}</p></div><button type="button" className="view-icon-button" onClick={close} aria-label="Fechar filtros"><X size={18} /></button></header>{active?.nativeOnly && !active.nativeFiltersEditable && <NativeFilters fetchXml={active.sourceFetchXml ?? ''} catalog={catalog} />}<div className="view-filter-drawer__toolbar"><span>{draftFilters.length ? `${draftFilters.length} ${draftFilters.length === 1 ? 'condição' : 'condições'}` : active?.nativeOnly && !active.nativeFiltersEditable ? 'Sem filtros editáveis' : 'Nenhum filtro'}{incompleteFilterCount > 0 && <small className="view-filter-pending"> · {incompleteFilterCount} {incompleteFilterCount === 1 ? 'pendente' : 'pendentes'}</small>}</span><button type="button" disabled={!draft.filters.length && !(draft.filterGroups ?? []).some((group) => group.filters.length)} onClick={() => setDraft({ ...draft, filters: [], filterGroups: [] })}><Trash2 size={14} /> Limpar filtros</button></div><div className="view-editor-content"><FilterManager catalog={catalog} definition={draft} onChange={setDraft} showSort={false} drawer /></div><footer className="view-editor-actions"><button type="button" onClick={close}>Cancelar</button>{!validFilters && <span className="view-filter-validation">{hasEmptyGroup ? 'Adicione uma condição em cada grupo.' : 'Preencha os valores dos filtros.'}</span>}<button type="button" className="view-primary-action" disabled={!validFilters} onClick={() => { onChange(draft); close() }}>Aplicar filtros</button></footer></section>
      return filterDrawerHost ? createPortal(drawer, filterDrawerHost) : drawer
    })()}

    {panel === 'create' && <div className="view-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="view-editor view-editor--create" role="dialog" aria-modal="true" aria-labelledby="create-view-title" onKeyDown={(event) => { if (event.key === 'Escape') close() }}>
      <header className="view-editor-header"><div><span className="view-editor-eyebrow">NOVA VIEW</span><h2 id="create-view-title">Salvar configuração atual</h2><p>Esta view terá as colunas, a ordem e os filtros aplicados na grade.</p></div><button type="button" className="view-icon-button" disabled={busy} onClick={close} aria-label="Fechar editor"><X size={18} /></button></header>
      <div className="view-editor-content"><div className="view-wizard-details"><label>Nome da view<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Composições pendentes" aria-label="Nome da view" maxLength={200} autoFocus /></label><label>Visibilidade<SearchableSelect value={kind} aria-label="Visibilidade da view" onChange={(value) => setKind(value as Kind)} options={[{ value: 'personal', label: 'Pessoal · só eu' }, { value: 'public', label: 'Pública · todos com acesso' }]} /></label>{mockMode && <p className="view-editor-local-note">No localhost, ambas são salvas somente neste navegador.</p>}<p role="status">{draft.columns.length} colunas · {draft.filters.length + (draft.filterGroups ?? []).reduce((total, group) => total + group.filters.length, 0)} {draft.filters.length + (draft.filterGroups ?? []).reduce((total, group) => total + group.filters.length, 0) === 1 ? 'filtro' : 'filtros'} · {draft.sort.length ? 'ordenação aplicada' : 'sem ordenação'}</p></div></div>
      <footer className="view-editor-actions"><button type="button" onClick={close} disabled={busy}>Cancelar</button><span className="view-actions-spacer" /><button type="button" className="view-primary-action" disabled={busy || !name.trim() || !draft.columns.length || !validFilters} onClick={() => void save(false)}>Criar view</button>{error && <p className="view-editor-error" role="alert">{error}</p>}</footer>
    </section></div>}
    {panel === 'wizard' && <div className="view-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="view-editor view-editor--wizard" role="dialog" aria-modal="true" aria-labelledby="view-editor-title" onKeyDown={(event) => { if (event.key === 'Escape') close() }}>
      <header className="view-editor-header"><div><span className="view-editor-eyebrow">ASSISTENTE DE VIEWS</span><h2 id="view-editor-title">{title}</h2><p>Configure cada parte e revise antes de salvar.</p></div><button type="button" className="view-icon-button" disabled={busy} onClick={close} aria-label="Fechar editor"><X size={18} /></button></header>
      <nav className="view-wizard-steps" aria-label="Etapas da criação">{steps.map((item, index) => <button type="button" key={item} className={step === index ? 'is-active' : ''} aria-current={step === index ? 'step' : undefined} disabled={busy || (index > step && (!name.trim() || index > step + 1))} onClick={() => setStep(index)}><span>{index + 1}</span>{item}</button>)}</nav>
      <div className="view-editor-content">{step === 0 ? <div className="view-wizard-details"><h3>Como você quer identificar esta view?</h3><p>O nome aparece no seletor da grade. Escolha quem poderá vê-la.</p><label>Nome da view<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Composições pendentes" aria-label="Nome da view" maxLength={200} autoFocus /></label><label>Visibilidade<SearchableSelect value={kind} aria-label="Visibilidade da view" onChange={(value) => setKind(value as Kind)} options={[{ value: 'personal', label: 'Pessoal · só eu' }, { value: 'public', label: 'Pública · todos com acesso' }]} /></label>{mockMode && <p className="view-editor-local-note">No localhost, ambas são salvas somente neste navegador.</p>}</div>
        : step === 1 ? <ColumnManager catalog={catalog} definition={draft} onChange={setDraft} />
          : step === 2 ? <FilterManager catalog={catalog} definition={draft} onChange={setDraft} />
            : <div className="view-wizard-review"><h3>Confira antes de salvar</h3><p>Esta é a configuração que ficará disponível no seletor de views.</p><dl><div><dt>Nome</dt><dd>{name.trim()}</dd></div><div><dt>Visibilidade</dt><dd>{kind === 'public' ? 'Pública' : 'Pessoal'}</dd></div><div><dt>Colunas</dt><dd>{draft.columns.length} visíveis · {draft.columns.filter((column) => column.pinned).length} fixadas</dd></div><div><dt>Filtros</dt><dd>{draft.filters.length + (draft.filterGroups ?? []).reduce((total, group) => total + group.filters.length, 0) || 'Nenhum'}</dd></div><div><dt>Ordenação</dt><dd>{draft.sort.length ? `${catalog.find((field) => field.id === draft.sort[0].id)?.label ?? 'Padrão'} · ${draft.sort[0].descending ? 'decrescente' : 'crescente'}` : 'Sem ordenação'}</dd></div></dl>{active?.managed && mode === 'edit' && (confirmDelete ? <div className="view-delete-confirm">Excluir esta view? <button type="button" onClick={() => setConfirmDelete(false)}>Não</button><button type="button" disabled={busy} onClick={() => void remove()}>Sim, excluir</button></div> : <button type="button" className="view-delete-action" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Excluir view</button>)}</div>}
      </div>
      <footer className="view-editor-actions"><button type="button" onClick={close} disabled={busy}>Cancelar</button><span className="view-actions-spacer" />{step === 2 && !validFilters && <span className="view-filter-validation">Preencha os valores dos filtros.</span>}{step > 0 && <button type="button" disabled={busy} onClick={() => setStep(step - 1)}>Voltar</button>}{step < 3 ? <button type="button" className="view-primary-action" disabled={busy || (step === 0 && !name.trim()) || !draft.columns.length || (step === 2 && !validFilters)} onClick={() => setStep(step + 1)}>Próximo</button> : <>{editable && <button type="button" disabled={busy || !name.trim() || !validFilters} onClick={() => void save(true)}>Salvar alterações</button>}<button type="button" className="view-primary-action" disabled={busy || !name.trim() || !validFilters} onClick={() => void save(false)}>{editable ? 'Salvar como nova' : 'Criar view'}</button></>}{error && <p className="view-editor-error" role="alert">{error}</p>}</footer>
    </section></div>}
  </>
}
