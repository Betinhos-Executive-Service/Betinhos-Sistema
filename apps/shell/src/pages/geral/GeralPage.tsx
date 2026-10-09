import { useCallback, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, EmptyState, Menu, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Archive, ArchiveRestore, CalendarDays, ClipboardList, Copy, ListChecks, MoreVertical, Pencil, Plus, RefreshCw, SearchX, Ticket, X } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useMedia } from '../operacional/useMedia'
import { hrefFor } from '../../nav/useHashRoute'
import { createSource } from './data/source'
import { Cell } from './components/Cell'
import { GeralCards } from './components/GeralCards'
import { GeralSheet } from './components/GeralSheet'
import { GeralTable } from './components/GeralTable'
import { CopyDialog, MockFormDialog, StateDialog, type StateRequest } from './components/Dialogs'
import { EscalaFdsDrawer } from './components/EscalaFdsDrawer'
import { LoadMore, LoadSentinel, statusText } from './components/LoadMore'
import { GeralToolbar } from './components/GeralToolbar'
import { VoucherOverlay } from './components/VoucherOverlay'
import { copyText } from './domain/copy'
import { applyColumnPrefs, loadColumnPrefs, saveColumnPrefs, type ColumnPrefs } from './domain/columns'
import { ID_ATTRIBUTE, type CellStatus, type Column } from './domain/types'
import { cellKey, useGeral, type SaveFailure } from './useGeral'
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
  const mobile = useMedia('(max-width: 820px)')
  const [editId, setEditId] = useState<string | null>(null)
  // Falha numa linha cuja sheet não está aberta (celular) não tem onde aparecer: vira aviso.
  const editIdRef = useRef(editId)
  editIdRef.current = editId
  const mobileRef = useRef(mobile)
  mobileRef.current = mobile
  const onSaveFail = useCallback((failure: SaveFailure) => {
    if (!mobileRef.current || editIdRef.current === failure.id) return
    toast({ tone: 'danger', message: `Não foi possível salvar ${failure.label} do serviço ${failure.serviceName}: ${failure.message}` })
  }, [toast])
  const geral = useGeral(source, { onSaveFail })
  const { view, rows, total, more, loading, loadingMore, loadError, query, attributes } = geral

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

  const { reload, refresh, loadMore, retryLoadMore, setQuery, selectView, clearSelection } = geral
  // Contêiner de rolagem da tabela: raiz do observador que carrega mais linhas (nos cards a raiz é a janela).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [mockForm, setMockForm] = useState(false)
  const [copy, setCopy] = useState<{ open: boolean; loading: boolean; text: string }>({ open: false, loading: false, text: '' })
  const [stateRequest, setStateRequest] = useState<StateRequest | null>(null)
  const [stateBusy, setStateBusy] = useState(false)
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null)
  const [escalaOpen, setEscalaOpen] = useState(false)
  const openForm = useCallback(async (mode: 'create' | 'edit', id?: string) => {
    try {
      const result = await source.openForm(mode, id)
      if (result === 'closed') refresh()
      else if (result === 'external') toast({ tone: 'info', message: 'O formulário abriu em outra aba. Clique em Atualizar quando terminar.' })
      else setMockForm(true)
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, refresh, toast])

  const selectedIds = useMemo(() => Array.from(geral.selected), [geral.selected])
  const rowOf = useCallback((id: string) => rows.find((r) => String(r[ID_ATTRIBUTE]) === id), [rows])
  /** 0 = todos ativos, 1 = todos inativos, `null` = misturados ou sem estado conhecido. */
  const selectedState = useMemo(() => {
    const states = new Set(selectedIds.map((id) => { const state = rowOf(id)?.statecode; return typeof state === 'number' ? state : -1 }))
    return states.size === 1 && !states.has(-1) ? (states.values().next().value as number) : null
  }, [selectedIds, rowOf])

  // Cada pedido tem um número; fechar o diálogo invalida o pedido em andamento, que não pode reabri-lo ao chegar.
  const copyRequest = useRef(0)
  const closeCopy = useCallback(() => { copyRequest.current += 1; setCopy((c) => ({ ...c, open: false, loading: false })) }, [])
  const copySelected = useCallback(async () => {
    const mine = ++copyRequest.current
    setCopy({ open: true, loading: true, text: '' })
    try {
      const text = copyText(await source.copyRows(selectedIds))
      if (mine === copyRequest.current) setCopy({ open: true, loading: false, text })
    } catch (reason) {
      if (mine !== copyRequest.current) return
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
      } else {
        const names = failed.map((item) => { const name = rowOf(item.id)?.cr40f_id; return typeof name === 'string' && name ? name : item.id })
        toast({ tone: 'danger', message: `${ok.length} de ${ids.length} serviços ${active ? 'ativados' : 'desativados'}; falharam: ${names.join(', ')}. ${failed[0].message}` })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    } finally {
      setStateBusy(false)
      setStateRequest(null)
      reload()
      clearSelection()
    }
  }, [stateRequest, source, toast, reload, clearSelection, rowOf])

  const openVoucher = useCallback(() => {
    const url = source.openVoucher(selectedIds)
    if (url == null) toast({ tone: 'info', message: 'O voucher abre dentro do Dataverse.' })
    else setVoucherUrl(url)
  }, [source, selectedIds, toast])

  const mixedTitle = 'Selecione só serviços ativos ou só inativos.'
  const mixedId = useId()
  // Barra de seleção do celular: só aparece com linhas marcadas.
  const selectionCommands = (
    <>
      {selectedIds.length === 1 ? <Button variant="action" size="compact" icon={<Pencil size={16} />} onClick={() => { void openForm('edit', selectedIds[0]) }}>Editar</Button> : null}
      <Button variant="action" size="compact" icon={<Ticket size={16} />} onClick={openVoucher}>Gerar Voucher</Button>
      <Button variant="action" size="compact" icon={<Copy size={16} />} onClick={() => { void copySelected() }}>Copiar Serviços</Button>
      {selectedState === 1
        ? <Button variant="action" size="compact" icon={<ArchiveRestore size={16} />} onClick={() => askState(true)}>Ativar</Button>
        : selectedState === 0
          ? <Button variant="danger" size="compact" icon={<Archive size={16} />} onClick={() => askState(false)}>Desativar</Button>
          // aria-disabled (não disabled): continua focável e o leitor de tela lê o motivo; o clique não faz nada.
          : <>
            <Button variant="danger" size="compact" className="gr-btn--blocked" icon={<Archive size={16} />} aria-disabled="true" aria-describedby={mixedId} title={mixedTitle} onClick={(event) => event.preventDefault()}>Desativar</Button>
            <Button variant="action" size="compact" className="gr-btn--blocked" icon={<ArchiveRestore size={16} />} aria-disabled="true" aria-describedby={mixedId} title={mixedTitle} onClick={(event) => event.preventDefault()}>Ativar</Button>
            <span id={mixedId} className="gr-sr">{mixedTitle}</span>
          </>}
      <Button variant="ghost" size="compact" icon={<X size={16} />} onClick={clearSelection}>Limpar seleção</Button>
    </>
  )
  const noneTitle = 'Selecione ao menos um serviço.'
  const oneTitle = 'Selecione exatamente um serviço.'
  const noneId = useId()
  const oneId = useId()
  // aria-disabled (não disabled): o botão continua focável, o leitor de tela lê o motivo e o clique não faz nada.
  const blocked = (reason: string, describedBy: string) => ({
    className: 'gr-btn--blocked',
    'aria-disabled': 'true' as const,
    'aria-describedby': describedBy,
    title: reason,
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  })
  const none = selectedIds.length === 0
  const createButton = <Button size={mobile ? 'touch' : 'compact'} icon={<Plus size={16} />} onClick={() => { void openForm('create') }}>Criar serviço</Button>
  // Desktop: todos os comandos ficam sempre na barra (a posição não pula); sem seleção servível ficam inertes, com o motivo.
  const commands = mobile ? createButton : (
    <>
      {createButton}
      {selectedIds.length === 1
        ? <Button variant="action" size="compact" icon={<Pencil size={16} />} onClick={() => { void openForm('edit', selectedIds[0]) }}>Editar</Button>
        : <Button variant="action" size="compact" icon={<Pencil size={16} />} {...blocked(oneTitle, oneId)}>Editar</Button>}
      {none
        ? <Button variant="action" size="compact" icon={<Ticket size={16} />} {...blocked(noneTitle, noneId)}>Gerar Voucher</Button>
        : <Button variant="action" size="compact" icon={<Ticket size={16} />} onClick={openVoucher}>Gerar Voucher</Button>}
      {none
        ? <Button variant="action" size="compact" icon={<Copy size={16} />} {...blocked(noneTitle, noneId)}>Copiar Serviços</Button>
        : <Button variant="action" size="compact" icon={<Copy size={16} />} onClick={() => { void copySelected() }}>Copiar Serviços</Button>}
      {none
        ? <Button variant="danger" size="compact" icon={<Archive size={16} />} {...blocked(noneTitle, noneId)}>Desativar</Button>
        : selectedState === 1
          ? <Button variant="action" size="compact" icon={<ArchiveRestore size={16} />} onClick={() => askState(true)}>Ativar</Button>
          : selectedState === 0
            ? <Button variant="danger" size="compact" icon={<Archive size={16} />} onClick={() => askState(false)}>Desativar</Button>
            : <>
              <Button variant="danger" size="compact" icon={<Archive size={16} />} {...blocked(mixedTitle, mixedId)}>Desativar</Button>
              <Button variant="action" size="compact" icon={<ArchiveRestore size={16} />} {...blocked(mixedTitle, mixedId)}>Ativar</Button>
            </>}
      <span id={oneId} className="gr-sr">{oneTitle}</span>
      <span id={noneId} className="gr-sr">{noneTitle}</span>
      <span id={mixedId} className="gr-sr">{mixedTitle}</span>
    </>
  )
  const shortcuts = (
    <Menu
      trigger={(props) => <Button {...props} variant="secondary" size={mobile ? 'touch' : 'compact'} icon={<MoreVertical size={16} />} aria-label="Mais ações" />}
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
  // Callbacks estáveis: a célula passa o próprio id/coluna, então só a que mudou de status ou de linha renderiza de novo.
  const searchLookup = useCallback((attribute: string, text: string) => source.search(attribute, text), [source])
  const renderCell = useCallback((row: Row, column: Column): ReactNode => {
    const id = String(row[ID_ATTRIBUTE])
    return (
      <Cell
        row={row}
        column={column}
        info={attributes?.get(column.key)}
        status={cells.get(cellKey(id, column.attribute)) ?? IDLE}
        onSave={save}
        onReset={resetCell}
        search={searchLookup}
        editable={attributes != null}
      />
    )
  }, [attributes, cells, save, resetCell, searchLookup])

  const editRow = editId == null ? undefined : rowOf(editId)

  const loadMoreProps = { more, loading, loadingMore, error: loadError, loaded: rows.length, total, onLoadMore: loadMore, onRetry: retryLoadMore, touch: mobile }
  const sentinel = more && !loading && !loadingMore && !loadError
  const status = loading && rows.length === 0 ? null : statusText(rows.length, total, more)

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
        {mobile
          ? (
            <div className={geral.selected.size > 0 ? 'gr-mobile has-selection' : 'gr-mobile'}>
              <GeralCards
                rows={rows}
                columns={visibleColumns}
                attributes={attributes}
                loading={loading}
                selected={geral.selected}
                onToggle={geral.toggle}
                onOpen={(id) => { void openForm('edit', id) }}
                onEdit={setEditId}
                footer={rows.length > 0 || loadError ? <LoadMore root={null} {...loadMoreProps} /> : null}
              />
              {!loading && rows.length === 0 && !geral.pageError ? <div className="gr-empty">{empty}</div> : null}
            </div>
          )
          : (
            <GeralTable
              columns={visibleColumns}
              attributes={attributes}
              rows={rows}
              loading={loading}
              sort={geral.sort}
              defaultSort={geral.defaultOrder}
              onSort={geral.setSort}
              selected={geral.selected}
              onToggle={geral.toggle}
              onToggleAll={geral.toggleAll}
              onOpen={(id) => { void openForm('edit', id) }}
              renderCell={renderCell}
              scrollRef={scrollRef}
              tail={<LoadSentinel root={scrollRef} active={sentinel} loaded={rows.length} onLoadMore={loadMore} />}
              footer={<LoadMore root={scrollRef} sentinel={false} {...loadMoreProps} />}
              empty={geral.pageError ? null : empty}
            />
          )}
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Operacional"
      title="Geral"
      meta={<span className="gr-meta">{status != null ? <span>{status}</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      className="gr-page"
      bodyClassName="gr-body"
      actions={<Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && rows.length > 0} onClick={reload}>Atualizar</Button>}
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
          selectedCount={mobile ? 0 : geral.selected.size}
          mobile={mobile}
          commands={commands}
          shortcuts={shortcuts}
        />
      }
    >
      {body}
      {mobile && geral.selected.size > 0 ? (
        <div className="gr-selbar" role="group" aria-label="Ações sobre os selecionados">
          <span role="status" className="gr-selbar__count">{geral.selected.size === 1 ? '1 selecionado' : `${geral.selected.size} selecionados`}</span>
          {selectionCommands}
        </div>
      ) : null}
      {mobile && editRow ? (
        <GeralSheet
          row={editRow}
          columns={visibleColumns}
          attributes={attributes}
          cellStatus={(attribute) => cells.get(cellKey(String(editRow[ID_ATTRIBUTE]), attribute)) ?? IDLE}
          open
          onClose={() => setEditId(null)}
          onSave={(column, value) => save(String(editRow[ID_ATTRIBUTE]), column, value)}
          onReset={(column) => resetCell(String(editRow[ID_ATTRIBUTE]), column.attribute)}
          search={(column, text) => source.search(column.attribute, text)}
        />
      ) : null}
      <CopyDialog open={copy.open} loading={copy.loading} text={copy.text} onClose={closeCopy} onCopied={() => { closeCopy(); toast({ tone: 'success', message: 'Serviços copiados.' }) }} />
      <StateDialog request={stateRequest} busy={stateBusy} onClose={() => setStateRequest(null)} onConfirm={() => { void confirmState() }} />
      <MockFormDialog open={mockForm} onClose={() => setMockForm(false)} />
      <EscalaFdsDrawer url={source.escalaFdsUrl()} open={escalaOpen} onClose={() => setEscalaOpen(false)} />
      {voucherUrl ? <VoucherOverlay url={voucherUrl} onClose={() => setVoucherUrl(null)} /> : null}
    </PageLayout>
  )
}
