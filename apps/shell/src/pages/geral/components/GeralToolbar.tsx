import { useEffect, useState, type ReactNode } from 'react'
import { PageToolbar, SearchBox, Select, StatusBadge, type SelectOption } from '@betinhos/ui'
import type { ColumnPrefs } from '../domain/columns'
import type { AttributeMap, Column, View } from '../domain/types'
import { ColumnsMenu } from './ColumnsMenu'

type Props = {
  views: View[]
  view: View | null
  onSelectView: (id: string) => void
  query: string
  onQuery: (query: string) => void
  searching: boolean
  /** Todas as colunas da visão ativa. */
  columns: Column[]
  attributes: AttributeMap | null
  prefs: ColumnPrefs | null
  onPrefs: (prefs: ColumnPrefs | null) => void
  selectedCount: number
  /** Comandos sempre visíveis; os que dependem da seleção ficam inertes (aria-disabled) enquanto ela não serve. */
  commands: ReactNode
  /** Atalhos fixos à direita. */
  shortcuts: ReactNode
}

/** Uma linha só: visão e busca à esquerda; contagem da seleção, comandos, colunas e atalhos à direita. */
export function GeralToolbar({ views, view, onSelectView, query, onQuery, searching, columns, attributes, prefs, onPrefs, selectedCount, commands, shortcuts }: Props) {
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
        <Select className="gr-filters__view" size="compact" aria-label="Visão" placeholder="Selecione uma visão" searchable={false} clearable={false} options={options} value={view?.id ?? null} onChange={(id) => { if (id) onSelectView(id) }} />
        <SearchBox className="gr-filters__search" size="compact" aria-label="Buscar serviços" placeholder="Buscar por ID, trajeto, cliente…" value={text} onChange={setText} onSearch={(value) => { if (value.trim() !== query) onQuery(value.trim()) }} debounce={300} loading={searching} />
      </>}
      end={<>
        {selectedCount > 0 ? <span role="status" className="gr-filters__selected"><StatusBadge tone="info">{selectedCount === 1 ? '1 selecionado' : `${selectedCount} selecionados`}</StatusBadge></span> : null}
        {commands}
        <span className="gr-filters__columns"><ColumnsMenu columns={columns} attributes={attributes} prefs={prefs} onChange={onPrefs} /></span>
        {shortcuts}
      </>}
    />
  )
}
