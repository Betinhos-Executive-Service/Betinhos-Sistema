import { useEffect, useState, type ReactNode } from 'react'
import { Filter, LayoutGrid, Table2 } from 'lucide-react'
import { Button, PageToolbar, SearchBox, SegmentedControl, Select, StatusBadge, type SelectOption } from '@betinhos/ui'
import type { ColumnPrefs } from '../domain/columns'
import type { ViewMode } from '../domain/viewMode'
import type { AttributeMap, Column, View } from '../domain/types'
import { ColumnsMenu } from './ColumnsMenu'

export const FILTERS_UNAVAILABLE = 'Filtros indisponíveis: não foi possível carregar os campos.'

type Props = {
  views: View[]
  view: View | null
  onSelectView: (id: string) => void
  /** Menu de ações da visão (salvar, renomear, excluir, compartilhar). */
  viewMenu?: ReactNode
  query: string
  onQuery: (query: string) => void
  searching: boolean
  /** Todas as colunas da visão ativa. */
  columns: Column[]
  attributes: AttributeMap | null
  prefs: ColumnPrefs | null
  onPrefs: (prefs: ColumnPrefs | null) => void
  selectedCount: number
  /** Filtros por coluna ativos. */
  filtersCount: number
  onOpenFilters: () => void
  /** Metadata indisponível: o botão continua abrindo o painel (que explica) e leva o motivo no title. */
  filtersUnavailable?: boolean
  /** Celular: controles em tamanho de toque (44 px); no desktop ficam compactos (32 px). */
  mobile: boolean
  /** Desktop: modo de exibição atual; ausente no celular (sempre cards), onde o alternador não aparece. */
  mode?: ViewMode
  onMode?: (mode: ViewMode) => void
  /** Comandos sempre visíveis; os que dependem da seleção ficam inertes (aria-disabled) enquanto ela não serve. */
  commands: ReactNode
  /** Atalhos fixos à direita. */
  shortcuts: ReactNode
}

/** Uma linha só: visão e busca à esquerda; contagem da seleção, comandos, colunas e atalhos à direita. */
export function GeralToolbar({ views, view, onSelectView, viewMenu, query, onQuery, searching, columns, attributes, prefs, onPrefs, selectedCount, filtersCount, onOpenFilters, filtersUnavailable, mobile, mode, onMode, commands, shortcuts }: Props) {
  const size = mobile ? 'touch' : 'compact'
  const options: SelectOption[] = views.map((v) => ({ value: v.id, label: v.nome, group: v.grupo === 'sistema' ? 'Visões do sistema' : 'Minhas visões' }))
  // O texto digitado fica local; a busca de verdade sai depois da pausa. Mudança externa (limpar busca) ressincroniza.
  const [text, setText] = useState(query)
  useEffect(() => setText(query), [query])

  return (
    <PageToolbar
      variant="filters"
      label="Filtros de serviços"
      className="gr-toolbar"
      start={<>
        <Select className="gr-filters__view" size={size} aria-label="Visão" placeholder="Selecione uma visão" searchable={false} clearable={false} options={options} value={view?.id ?? null} onChange={(id) => { if (id) onSelectView(id) }} />
        {viewMenu}
        {!mobile && mode && onMode ? (
          <SegmentedControl<ViewMode> size="compact" aria-label="Mostrar como" value={mode} onChange={onMode} options={[
            { value: 'tabela', label: <span className="gr-mode"><Table2 size={14} aria-hidden="true" />Tabela</span> },
            { value: 'cards', label: <span className="gr-mode"><LayoutGrid size={14} aria-hidden="true" />Cards</span> },
          ]} />
        ) : null}
        <SearchBox className="gr-filters__search" size={size} aria-label="Buscar serviços" placeholder="Buscar por ID, trajeto, cliente…" value={text} onChange={setText} onSearch={(value) => { if (value.trim() !== query) onQuery(value.trim()) }} debounce={300} loading={searching} />
      </>}
      end={<>
        {selectedCount > 0 ? <span role="status" className="gr-filters__selected"><StatusBadge tone="info">{selectedCount === 1 ? '1 selecionado' : `${selectedCount} selecionados`}</StatusBadge></span> : null}
        {commands}
        <Button variant="secondary" size={size} icon={<Filter size={16} />} aria-haspopup="dialog" aria-label={filtersCount > 0 ? `Filtros (${filtersCount})` : 'Filtros'} title={filtersUnavailable ? FILTERS_UNAVAILABLE : undefined} onClick={onOpenFilters}>
          Filtros{filtersCount > 0 ? <span className="gr-filters__count">{filtersCount}</span> : null}
        </Button>
        <span className="gr-filters__columns"><ColumnsMenu size={size} columns={columns} attributes={attributes} prefs={prefs} onChange={onPrefs} /></span>
        {shortcuts}
      </>}
    />
  )
}
