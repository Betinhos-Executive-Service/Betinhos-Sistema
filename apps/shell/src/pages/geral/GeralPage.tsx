import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, EmptyState, Menu, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Archive, ArchiveRestore, CalendarDays, ClipboardList, Copy, ListChecks, MoreVertical, Pencil, Plus, RefreshCw, SearchX, Ticket, X } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor } from '../../nav/useHashRoute'
import { createSource } from './data/source'
import { Cell } from './components/Cell'
import { GeralTable } from './components/GeralTable'
import { CopyDialog, MockFormDialog, StateDialog, type StateRequest } from './components/Dialogs'
import { EscalaFdsDrawer } from './components/EscalaFdsDrawer'
import { GeralToolbar } from './components/GeralToolbar'
import { VoucherOverlay } from './components/VoucherOverlay'
import { copyText } from './domain/copy'
import { applyColumnPrefs, loadColumnPrefs, saveColumnPrefs, type ColumnPrefs } from './domain/columns'
import { ID_ATTRIBUTE, PAGE_SIZE, type CellStatus, type Column } from './domain/types'
import { cellKey, useGeral } from './useGeral'
import './geral.css'

export function GeralPage({ host }: { host: Host }) {
  // Trocar a chave recria a tela inteira: é o "Tentar de novo" quando as visões não carregam.
  const [attempt, setAttempt] = useState(0)
  return <ToastProvider><Geral key={attempt} host={host} onRetry={() => setAttempt((n) => n + 1)} /></ToastProvider>
}

const IDLE: CellStatus = { kind: 'idle' }

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

  const { reload, goTo, setQuery, selectView, clearSelection } = geral
  const [mockForm, setMockForm] = useState(false)
  const [copy, setCopy] = useState<{ open: boolean; loading: boolean; text: string }>({ open: false, loading: false, text: '' })
  const [stateRequest, setStateRequest] = useState<StateRequest | null>(null)
  const [stateBusy, setStateBusy] = useState(false)
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null)
  const [escalaOpen, setEscalaOpen] = useState(false)
  const openForm = useCallback(async (mode: 'create' | 'edit', id?: string) => {
    try {
      const result = await source.openForm(mode, id)
      if (result === 'closed') reload()
      else if (result === 'external') toast({ tone: 'info', message: 'O formulário abriu em outra aba. Clique em Atualizar quando terminar.' })
      else setMockForm(true)
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, reload, toast])

  const selectedIds = useMemo(() => Array.from(geral.selected), [geral.selected])
  const rowOf = useCallback((id: string) => rows.find((r) => String(r[ID_ATTRIBUTE]) === id), [rows])
  /** 0 = todos ativos, 1 = todos inativos, `null` = misturados ou sem estado conhecido. */
  const selectedState = useMemo(() => {
    const states = new Set(selectedIds.map((id) => { const state = rowOf(id)?.statecode; return typeof state === 'number' ? state : -1 }))
    return states.size === 1 && !states.has(-1) ? (states.values().next().value as number) : null
  }, [selectedIds, rowOf])

  const copySelected = useCallback(async () => {
    setCopy({ open: true, loading: true, text: '' })
    try {
      const text = copyText(await source.copyRows(selectedIds))
      setCopy({ open: true, loading: false, text })
    } catch (reason) {
      setCopy({ open: false, loading: false, text: '' })
      toast({ tone: 'danger', message: `Não foi possível montar o texto: ${reason instanceof Error ? reason.message : String(reason)}` })
    }
  }, [source, selectedIds, toast])

  const askState = useCallback((active: boolean) => {
    const labels = selectedIds.map((id) => { const name = rowOf(id)?.cr40f_id; return typeof name === 'string' && name ? name : id })
    setStateRequest({ ids: selectedIds, labels, active })
  }, [selectedIds, rowOf])

  const confirmState = useCallback(async () => {
    if (!stateRequest) return
    const { ids, active } = stateRequest
    setStateBusy(true)
    try {
      const { ok, failed } = await source.setState(ids, active)
      if (failed.length === 0) {
        const one = ok.length === 1
        toast({ tone: 'success', message: `${ok.length} ${one ? 'serviço' : 'serviços'} ${active ? 'ativado' : 'desativado'}${one ? '' : 's'}.` })
      } else toast({ tone: 'danger', message: `${failed.length} de ${ids.length} falharam: ${failed[0].message}` })
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    } finally {
      setStateBusy(false)
      setStateRequest(null)
      reload()
      clearSelection()
    }
  }, [stateRequest, source, toast, reload, clearSelection])

  const openVoucher = useCallback(() => {
    const url = source.openVoucher(selectedIds)
    if (url == null) toast({ tone: 'info', message: 'O voucher abre dentro do Dataverse.' })
    else setVoucherUrl(url)
  }, [source, selectedIds, toast])

  const mixedTitle = 'Selecione só serviços ativos ou só inativos.'
  const commands = (
    <>
      {selectedIds.length === 1 ? <Button variant="action" size="compact" icon={<Pencil size={16} />} onClick={() => { void openForm('edit', selectedIds[0]) }}>Editar</Button> : null}
      <Button variant="action" size="compact" icon={<Ticket size={16} />} onClick={openVoucher}>Gerar Voucher</Button>
      <Button variant="action" size="compact" icon={<Copy size={16} />} onClick={() => { void copySelected() }}>Copiar Serviços</Button>
      {selectedState === 1
        ? <Button variant="action" size="compact" icon={<ArchiveRestore size={16} />} onClick={() => askState(true)}>Ativar</Button>
        : selectedState === 0
          ? <Button variant="danger" size="compact" icon={<Archive size={16} />} onClick={() => askState(false)}>Desativar</Button>
          : <>
            <Button variant="danger" size="compact" icon={<Archive size={16} />} disabled title={mixedTitle}>Desativar</Button>
            <Button variant="action" size="compact" icon={<ArchiveRestore size={16} />} disabled title={mixedTitle}>Ativar</Button>
          </>}
      <Button variant="ghost" size="compact" icon={<X size={16} />} onClick={clearSelection}>Limpar seleção</Button>
    </>
  )
  const shortcuts = (
    <Menu
      trigger={(props) => <Button {...props} variant="secondary" icon={<MoreVertical size={18} />} aria-label="Mais ações" />}
      actions={[
        { id: 'funcoes', label: 'Funções Operacionais', icon: <ClipboardList size={16} />, onSelect: () => { location.hash = hrefFor('new_telafuncoesoperacionais') } },
        { id: 'escala', label: 'Escala FDS', icon: <CalendarDays size={16} />, onSelect: () => setEscalaOpen(true) },
        { id: 'contagem', label: 'Contagem de Serviços', icon: <ListChecks size={16} />, onSelect: () => { location.hash = hrefFor('operacional') } },
      ]}
    />
  )

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar serviços" onClick={reload} />, [reload])
  useShellHeader({ title: 'Geral', actions: headerActions })

  const { save, resetCell, cells } = geral
  const renderCell = useCallback((row: Row, column: Column): ReactNode => {
    const id = String(row[ID_ATTRIBUTE])
    return (
      <Cell
        row={row}
        column={column}
        info={attributes?.get(column.key)}
        status={cells.get(cellKey(id, column.attribute)) ?? IDLE}
        onSave={(value) => save(id, column, value)}
        onReset={() => resetCell(id, column.attribute)}
        search={(text) => source.search(column.attribute, text)}
        editable={attributes != null}
      />
    )
  }, [attributes, cells, save, resetCell, source])

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
          empty={geral.pageError ? null : empty}
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
          commands={commands}
          shortcuts={shortcuts}
        />
      }
    >
      {body}
      <CopyDialog open={copy.open} loading={copy.loading} text={copy.text} onClose={() => setCopy((c) => ({ ...c, open: false }))} onCopied={() => { setCopy((c) => ({ ...c, open: false })); toast({ tone: 'success', message: 'Serviços copiados.' }) }} />
      <StateDialog request={stateRequest} busy={stateBusy} onClose={() => setStateRequest(null)} onConfirm={() => { void confirmState() }} />
      <MockFormDialog open={mockForm} onClose={() => setMockForm(false)} />
      <EscalaFdsDrawer url={source.escalaFdsUrl()} open={escalaOpen} onClose={() => setEscalaOpen(false)} />
      {voucherUrl ? <VoucherOverlay url={voucherUrl} onClose={() => setVoucherUrl(null)} /> : null}
    </PageLayout>
  )
}
