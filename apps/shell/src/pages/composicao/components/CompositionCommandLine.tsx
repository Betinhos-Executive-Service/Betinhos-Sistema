import { memo, type RefObject } from 'react'
import { Download, FilePlus2, RefreshCw, Trash2 } from 'lucide-react'
import { Button, SearchBox, StatusBadge, ViewBar, type MenuAction, type SelectionAction } from '@betinhos/ui'
import type { ComposicaoViewState } from '../useComposicaoViewState'
import type { CatalogField } from '../data/views'
import type { CommandPhase } from './useCompositionCommands'
import { ReadOnlyFilters } from './ReadOnlyFilters'

/** Comandos que mudam a cada render da página: lidos na hora do clique, sem renderizar a linha de novo. */
export type CommandLineActions = {
  refresh: () => void
  exportExcel: () => void
  generateOp: () => void
  exclude: () => void
  audit: () => void
  clearSelection: () => void
}

type Props = {
  view: ComposicaoViewState
  actions: RefObject<CommandLineActions>
  onSearch: (value: string) => void
  catalog: CatalogField[]
  /** FetchXML da view nativa com filtros originais não editáveis aqui. */
  nativeFetchXml: string | null
  ready: boolean
  mock: boolean
  mobile: boolean
  search: string
  commandPhase: CommandPhase
  commandLocked: boolean
  /** Motivo de Gerar OP, Excluir e Auditoria estarem inertes (sem dados ou comando em andamento). */
  commandBlock: string | null
  exporting: boolean
  exportBlocked: boolean
  selectedCount: number
  countText: string
  countLabel?: string
}

/**
 * Linha de comando da Composição (DS §10.9.1): seletor de visão como título, Colunas, Filtros, Densidade, Auditoria, busca,
 * "⋮" com Extrair para Excel e Atualizar na primária. Gerar OP e Excluir são ações da seleção. Memoizada: a `ViewBar` mede a
 * linha a cada render, e a página renderiza a cada tecla na grade.
 */
export const CompositionCommandLine = memo(function CompositionCommandLine(p: Props) {
  const size = p.mobile ? 'touch' : 'default'
  const run = (name: keyof CommandLineActions) => () => p.actions.current[name]()
  const selectionActions: SelectionAction[] = [
    { id: 'op', label: p.commandPhase === 'inspect-op' ? 'Verificando…' : p.commandPhase === 'send-op' ? 'Enviando…' : 'Gerar OP', icon: <FilePlus2 size={16} />, inline: true, blocked: p.commandBlock, onSelect: run('generateOp') },
    { id: 'excluir', label: p.commandPhase === 'delete' ? 'Excluindo…' : 'Excluir', icon: <Trash2 size={16} />, tone: 'danger', inline: true, blocked: p.commandBlock, onSelect: run('exclude') },
  ]
  const more: MenuAction[] = [{
    id: 'excel', label: p.exporting ? 'Extraindo…' : p.selectedCount ? `Extrair ${p.selectedCount} para Excel` : 'Extrair para Excel', icon: <Download size={16} />,
    disabled: p.commandLocked || p.exportBlocked,
    description: p.selectedCount ? 'Só as composições selecionadas.' : 'As linhas da view, dos filtros e da busca atuais.',
    onSelect: run('exportExcel'),
  }]
  return (
    <div role="toolbar" aria-label="Comandos da composição de preços" className="composition-commandline">
      <ViewBar
        view={p.view.state}
        columns={p.view.columnDefs}
        catalog={p.ready && !p.mock ? p.view.catalog : undefined}
        pinnable
        filters={p.ready ? { fields: p.view.filterFields, search: p.view.search } : undefined}
        // Sem seleção, a auditoria da tabela; com seleção, a das composições marcadas.
        onAudit={run('audit')}
        search={<SearchBox size={size} value={p.search} onChange={p.onSearch} disabled={!p.ready} placeholder="Buscar cliente ou trajeto" aria-label="Buscar cliente ou trajeto" />}
        more={more}
        // "Atualizar" fica na primária: o que está em `primary` nunca sai da linha (DS §10.9.1).
        primary={<Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title={p.commandPhase === 'refresh' ? 'Atualizando…' : 'Recarregar dados sem perder filtros, seleção ou posição'} loading={p.commandPhase === 'refresh'} disabled={p.commandLocked} onClick={run('refresh')} />}
        selection={{ count: p.selectedCount, onClear: run('clearSelection'), actions: selectionActions, label: (count) => count === 1 ? '1 selecionada' : `${count} selecionadas` }}
      >
        <span className="composition-count" aria-label={p.countLabel}>{p.countText}</span>
        {p.mock && !p.mobile ? <StatusBadge tone="info">Modo local</StatusBadge> : null}
        {p.ready ? <ReadOnlyFilters catalog={p.catalog} nativeFetchXml={p.nativeFetchXml} valueLabel={p.view.valueLabel} locked={p.view.lockedFilters} onClear={p.view.clearLockedFilters} /> : null}
      </ViewBar>
    </div>
  )
})
