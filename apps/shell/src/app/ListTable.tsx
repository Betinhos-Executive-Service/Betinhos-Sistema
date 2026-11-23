import { ExternalLink, History } from 'lucide-react'
import { Table, type MenuAction, type TableProps } from '@betinhos/ui'
import { BrandLoader } from './BrandLoader'
import { useAuditoria } from './auditoria/AuditoriaProvider'

/** De qual tabela do Dataverse é a linha, para o "Auditoria" do clique direito. */
export type ListAudit<Row> = {
  /** Nome lógico da tabela; função quando a lista mistura tabelas (ex.: registros da Frota). */
  entity: string | ((row: Row) => string)
  /** Ids do registro no Dataverse. Padrão: `[rowKey(row)]`. */
  ids?: (row: Row) => (string | null | undefined)[]
  /** Nome do registro no subtítulo do painel, quando a auditoria é de uma linha só. */
  name?: (row: Row) => string | undefined
  /** Abre o registro clicado no painel. */
  onOpenRecord?: (id: string) => void
}

type Props<Row> = TableProps<Row> & { loadingLabel?: string; audit?: ListAudit<Row> }

export const AUDIT_ACTION_ID = 'auditoria'

/**
 * Ações do clique direito com "Auditoria" logo depois de "Abrir" (ou no fim): alterações das linhas sobre as quais o menu
 * age (a clicada ou a seleção), só das que são da mesma tabela da linha clicada. Sem ids válidos, o item não aparece.
 */
export function withAudit<Row>(
  base: ((row: Row, selection: Row[]) => MenuAction[]) | undefined,
  audit: ListAudit<Row>,
  rowKey: (row: Row) => string,
  open: (target: { entity: string; ids: string[]; name?: string; onOpenRecord?: (id: string) => void }) => void,
) {
  const entityOf = (row: Row) => (typeof audit.entity === 'function' ? audit.entity(row) : audit.entity)
  const idsOf = (row: Row) => (audit.ids ? audit.ids(row) : [rowKey(row)])
  return (row: Row, selection: Row[]): MenuAction[] => {
    const actions = base ? base(row, selection) : []
    const entity = entityOf(row)
    const targets = (selection.length ? selection : [row]).filter((other) => entityOf(other) === entity)
    const ids = [...new Set(targets.flatMap(idsOf).filter((id): id is string => Boolean(id)))]
    if (!ids.length) return actions
    const item: MenuAction = {
      id: AUDIT_ACTION_ID,
      label: 'Auditoria',
      icon: <History size={16} />,
      onSelect: () => open({ entity, ids, name: targets.length === 1 ? audit.name?.(targets[0]) : undefined, onOpenRecord: audit.onOpenRecord }),
    }
    const at = actions.findIndex((action) => action.id === 'abrir')
    if (at < 0) return [...actions, { ...item, group: actions.length ? '' : undefined }]
    return [...actions.slice(0, at + 1), { ...item, group: actions[at].group }, ...actions.slice(at + 1)]
  }
}

/**
 * `Table` do DS como as listas do shell usam: virtualização acima de 100 linhas (rola no `main`), barra horizontal presa ao
 * pé da tela, colunas da visão que encolhem para caber (`view.fit`) e o loader da marca na primeira carga. Com `audit`, o
 * clique direito ganha "Auditoria" (o mínimo de toda lista é Abrir e Auditoria). Todo o comportamento é do DS (§10.9);
 * aqui só ficam os padrões das listas.
 */
export function ListTable<Row>({ loadingLabel = 'Carregando a lista', view, audit, rowActions, ...props }: Props<Row>) {
  const auditoria = useAuditoria()
  const { onRowClick, rowKey } = props
  // Sem `rowActions`, o mesmo "Abrir" que o DS daria sozinho com `onRowClick`.
  const base = rowActions ?? (onRowClick ? (row: Row): MenuAction[] => [{ id: 'abrir', label: 'Abrir', icon: <ExternalLink size={16} />, onSelect: () => onRowClick(row) }] : undefined)
  const actions = audit ? withAudit(base, audit, rowKey, auditoria) : rowActions
  return (
    <Table
      virtual
      stickyScrollbar
      loadingContent={<BrandLoader variant="inline" label={loadingLabel} text={`${loadingLabel}…`} />}
      view={view ? { ...view, fit: true } : undefined}
      rowActions={actions}
      {...props}
    />
  )
}
