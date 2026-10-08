import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, EmptyState, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { createSource } from './data/source'
import { GeralTable } from './components/GeralTable'
import { GeralToolbar } from './components/GeralToolbar'
import { cellKind, statusTone } from './domain/cells'
import { applyColumnPrefs, loadColumnPrefs, saveColumnPrefs, type ColumnPrefs } from './domain/columns'
import { formatCell } from './domain/format'
import { rowKey } from './domain/layout'
import { PAGE_SIZE, type Column } from './domain/types'
import { useGeral } from './useGeral'
import './geral.css'

export function GeralPage({ host }: { host: Host }) {
  // Trocar a chave recria a tela inteira: é o "Tentar de novo" quando as visões não carregam.
  const [attempt, setAttempt] = useState(0)
  return <ToastProvider><Geral key={attempt} host={host} onRetry={() => setAttempt((n) => n + 1)} /></ToastProvider>
}

const STATUS_COLUMNS: ReadonlySet<string> = new Set(['cr40f_status', 'cr40f_statusdefaturamento'])

function Geral({ host, onRetry }: { host: Host; onRetry: () => void }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const geral = useGeral(source)
  const { view, rows, page, total, more, loading, query, attributes } = geral

  // Preferências de colunas por visão: lidas do armazenamento local ao entrar na visão, gravadas ao aplicar.
  const [saved, setSaved] = useState<Record<string, ColumnPrefs | null>>({})
  const viewId = view?.id ?? null
  const prefs = useMemo(() => (viewId == null ? null : viewId in saved ? saved[viewId] : loadColumnPrefs(source.kv, viewId)), [viewId, saved, source.kv])
  const visibleColumns = useMemo(() => applyColumnPrefs(geral.columns, prefs), [geral.columns, prefs])
  const setPrefs = useCallback((next: ColumnPrefs | null) => {
    if (viewId == null) return
    saveColumnPrefs(source.kv, viewId, next)
    setSaved((s) => ({ ...s, [viewId]: next }))
  }, [source.kv, viewId])

  const { reload, goTo, setQuery, selectView } = geral
  const openForm = useCallback(async (mode: 'create' | 'edit', id?: string) => {
    try {
      const result = await source.openForm(mode, id)
      if (result === 'closed') reload()
      else if (result === 'external') toast({ tone: 'info', message: 'O formulário abriu em outra aba. Clique em Atualizar quando terminar.' })
      else toast({ tone: 'info', message: 'O Formulário Geral só abre dentro do Dataverse.' })
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, reload, toast])

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar serviços" onClick={reload} />, [reload])
  useShellHeader({ title: 'Geral', actions: headerActions })

  // Leitura apenas: a Tarefa 10 troca este texto pela célula editável.
  const renderCell = useCallback((row: Row, column: Column): ReactNode => {
    const info = attributes?.get(column.key)
    const key = rowKey(column, info)
    const kind = cellKind(column, info)
    const text = formatCell(kind, row, key)
    const raw = row[key]
    const badge = !column.alias && STATUS_COLUMNS.has(column.attribute) && typeof raw === 'number'
    return (
      <div className={`bt-table__cell gr-cell gr-cell--${kind}`} role="gridcell">
        {badge ? <StatusBadge tone={statusTone(column.attribute, raw)}>{text}</StatusBadge> : <span className="gr-cell__text" title={text}>{text}</span>}
      </div>
    )
  }, [attributes])

  const start = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const end = start + rows.length - 1
  const footer = (
    <>
      <span>{loading ? 'Carregando…' : rows.length ? `Linhas ${start}–${end}${total != null ? ` de ${total}` : ''}` : 'Nenhuma linha'}</span>
      {total != null
        ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={goTo} noun="serviços" />
        : (
          <span className="gr-footer__pages">
            <Button variant="secondary" size="compact" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>Anterior</Button>
            <Button variant="secondary" size="compact" disabled={!more || loading} onClick={() => goTo(page + 1)}>Próxima</Button>
          </span>
        )}
    </>
  )

  const empty = (
    <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum serviço nesta visão" action={query ? <Button variant="secondary" onClick={() => setQuery('')}>Limpar busca</Button> : undefined}>
      {query ? `Nada encontrado para “${query}”.` : 'Troque de visão ou ajuste a busca.'}
    </EmptyState>
  )

  const backToAgenda = () => {
    const first = geral.views.find((v) => v.padrao) ?? geral.views[0]
    if (first) selectView(first.id)
  }

  let body: ReactNode
  if (geral.viewsError) {
    body = <Alert tone="danger" title="Não foi possível carregar as visões" action={<Button variant="secondary" onClick={onRetry}>Tentar de novo</Button>}>{geral.viewsError}</Alert>
  } else {
    body = (
      <>
        {geral.attributesError ? <Alert tone="warning">Edição indisponível no momento: {geral.attributesError}</Alert> : null}
        {geral.pageError ? <Alert tone="danger" title="Não foi possível carregar os serviços" action={<Button variant="secondary" onClick={backToAgenda}>Voltar para a Agenda</Button>}>{geral.pageError}</Alert> : null}
        <GeralTable
          columns={visibleColumns}
          attributes={attributes}
          rows={rows}
          loading={loading}
          sort={geral.sort}
          onSort={geral.setSort}
          selected={geral.selected}
          onToggle={geral.toggle}
          onToggleAll={geral.toggleAll}
          onOpen={(id) => { void openForm('edit', id) }}
          renderCell={renderCell}
          footer={footer}
          empty={empty}
        />
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Operacional"
      title="Geral"
      meta={<span className="gr-meta">{total != null ? `${total} serviços` : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      actions={<>
        <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && rows.length > 0} onClick={reload}>Atualizar</Button>
        <Button icon={<Plus size={16} />} onClick={() => { void openForm('create') }}>Criar serviço</Button>
      </>}
      toolbar={
        <GeralToolbar
          views={geral.views}
          view={view}
          onSelectView={selectView}
          query={query}
          onQuery={setQuery}
          searching={loading && query !== ''}
          columns={geral.columns}
          attributes={attributes}
          prefs={prefs}
          onPrefs={setPrefs}
          selectedCount={geral.selected.size}
          commands={null}
          shortcuts={null}
        />
      }
    >
      {body}
    </PageLayout>
  )
}
