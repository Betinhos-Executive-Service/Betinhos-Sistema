import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, ContextMenu, EmptyState, Menu, SearchBox, Stack, StatusBadge, ToastProvider, ViewBar, readFilters, useShellHeader, useToast, wantsNativeMenu, type FilterGroup, type FilterOption, type MenuAction } from '@betinhos/ui'
import { Archive, ArchiveRestore, Bug, CalendarDays, ChevronDown, ClipboardList, Copy, FilePlus2, LayoutGrid, Link2, ListChecks, MoreVertical, Pencil, Plus, RefreshCw, SearchX, Send, ShieldCheck, Table2, Ticket, UserPlus, X } from 'lucide-react'
import type { Host } from '../../host'
import { useMedia } from '../operacional/useMedia'
import { hrefFor, patchHashQuery, queryFromHash, readHashQuery } from '../../nav/useHashRoute'
import { createDataverseExtraSource, createMockExtraSource, extraCatalog, resolveLinkColumns } from '../../app/extraColumns'
import { createSource } from './data/source'
import { ProtecaoContext } from './components/ProtecaoLock'
import type { Protecao } from './domain/protecao'
import { Cell } from './components/Cell'
import { GeralCards } from './components/GeralCards'
import { GeralSheet } from './components/GeralSheet'
import { GeralTable } from './components/GeralTable'
import { CopyDialog, DispararDialog, GerarOpDialog, LinkDialog, MockFormDialog, StateDialog, type DispararRequest, type LinkRequest, type OpRequest, type StateRequest } from './components/Dialogs'
import { ContagemDrawer, shiftDay, todayIso } from './components/ContagemDrawer'
import { EscalaFdsDrawer } from './components/EscalaFdsDrawer'
import { LoadMore, LoadSentinel, statusText } from './components/LoadMore'
import { debounceSearch } from './components/useLookupSearch'
import { AuditoriaOverlay } from './components/AuditoriaOverlay'
import { LINK_FALHA, gerarLinkBlock } from './domain/link'
import { LINK_CADASTRO_FALHA, linkCadastroBlock } from './domain/linkCadastro'
import { LinkCadastroDrawer, type LinkCadastroRequest } from './components/LinkCadastroDrawer'
import { VoucherOverlay } from './components/VoucherOverlay'
import { FormOverlay } from './components/FormOverlay'
import { copyText } from './domain/copy'
import { loadViewMode, saveViewMode, type ViewMode } from './domain/viewMode'
import { splitOp } from './domain/commands'
import { applyColumnPrefs, loadColumnPrefs, saveColumnPrefs, type ColumnPrefs } from './domain/columns'
import { buildLayout, buildViewFetch } from './domain/views'
import { ENTITY, ID_ATTRIBUTE, type CellStatus, type Column } from './domain/types'
import { readUrlState, writeUrlState, type UrlState } from './domain/urlState'
import { cellKey, useGeral, type SaveFailure } from './useGeral'
import { useGeralViewState } from './useGeralViewState'
import './geral.css'

export function GeralPage({ host }: { host: Host }) {
  // Trocar a chave recria a tela inteira: é o "Tentar de novo" quando as visões não carregam.
  const [attempt, setAttempt] = useState(0)
  return <ToastProvider><Geral key={attempt} host={host} onRetry={() => setAttempt((n) => n + 1)} /></ToastProvider>
}

const IDLE: CellStatus = { kind: 'idle' }

function Geral({ host, onRetry }: { host: Host; onRetry: () => void }) {
  const source = useMemo(() => createSource(host), [host])
  // Histórico do campo protegido sob demanda, uma consulta por OS enquanto a tela está aberta; falha não fica no cache.
  const protecao = useMemo(() => {
    const cache = new Map<string, Promise<Protecao>>()
    return (id: string) => {
      let pending = cache.get(id)
      if (!pending) {
        pending = source.protecao(id)
        cache.set(id, pending)
        pending.catch(() => cache.delete(id))
      }
      return pending
    }
  }, [source])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const [mode, setModeState] = useState<ViewMode>(() => loadViewMode(source.kv))
  // Celular é sempre cards; no desktop vale a escolha lembrada.
  const cardsLayout = mobile || mode === 'cards'
  const changeMode = useCallback((next: ViewMode) => { setModeState(next); setEditId(null); saveViewMode(source.kv, next) }, [source.kv])
  const [editId, setEditId] = useState<string | null>(null)
  // Falha numa linha cuja sheet não está aberta (celular) não tem onde aparecer: vira aviso.
  const editIdRef = useRef(editId)
  editIdRef.current = editId
  const mobileRef = useRef(cardsLayout)
  mobileRef.current = cardsLayout
  const onSaveFail = useCallback((failure: SaveFailure) => {
    if (!mobileRef.current || editIdRef.current === failure.id) return
    toast({ tone: 'danger', message: `Não foi possível salvar ${failure.label} do serviço ${failure.serviceName}: ${failure.message}` })
  }, [toast])
  // O estado da tela vive na URL (`#/geral?view=…`): lido uma vez ao montar e regravado sem empilhar histórico.
  const [initial] = useState(() => readUrlState(queryFromHash(window.location.hash)))
  const onStateChange = useCallback((state: UrlState) => {
    const next = hrefFor('geral', new URLSearchParams(writeUrlState(state)))
    if (next !== window.location.hash) window.history.replaceState(null, '', next)
  }, [])
  const geral = useGeral(source, { onSaveFail, initial, onStateChange })
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

  // "Adicionar coluna" (DS §10.9.1): campos da reserva e das relações N:1; as escolhidas viram link-entity na consulta.
  const extraSource = useMemo(() => (host.mode === 'dataverse' ? createDataverseExtraSource(host) : createMockExtraSource()), [host])
  const catalog = useMemo(() => extraCatalog(extraSource, ENTITY), [extraSource])
  const extraPrefs = JSON.stringify(prefs?.extra ?? [])
  const { setExtras } = geral
  useEffect(() => {
    let alive = true
    const list = JSON.parse(extraPrefs) as { key: string; label: string }[]
    if (!list.length) { setExtras([]); return }
    void resolveLinkColumns(extraSource, ENTITY, list).then((resolved) => { if (alive) setExtras(resolved) })
    return () => { alive = false }
  }, [extraSource, extraPrefs, viewId, setExtras])

  const { reload, refresh, loadMore, retryLoadMore, setQuery, selectView, clearSelection } = geral
  // Contêiner de rolagem da tabela: raiz do observador que carrega mais linhas (nos cards a raiz é a janela).
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardsScrollRef = useRef<HTMLDivElement>(null)
  const [mockForm, setMockForm] = useState(false)
  const [copy, setCopy] = useState<{ open: boolean; loading: boolean; text: string }>({ open: false, loading: false, text: '' })
  const [stateRequest, setStateRequest] = useState<StateRequest | null>(null)
  const [stateBusy, setStateBusy] = useState(false)
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null)
  const [formUrl, setFormUrl] = useState<string | null>(null)
  const [auditoriaUrl, setAuditoriaUrl] = useState<string | null>(null)
  const [opRequest, setOpRequest] = useState<OpRequest | null>(null)
  const [opBusy, setOpBusy] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const [dispRequest, setDispRequest] = useState<DispararRequest | null>(null)
  const [dispBusy, setDispBusy] = useState(false)
  const [escalaOpen, setEscalaOpen] = useState(false)
  const [contagemOpen, setContagemOpen] = useState(false)
  // Filtros do Design System (§10.9.2): rápidos por coluna e avançado E/OU; valem os que casam com os campos da metadata.
  const { filters, setFilters, setQuickFilter, filterFields } = geral
  const valid = useMemo(() => readFilters(filters, filterFields), [filters, filterFields])
  const filteredKeys = useMemo(() => {
    const keys = new Set(Object.keys(valid.quick))
    const walk = (group: FilterGroup) => group.items.forEach((item) => (item.type === 'group' ? walk(item) : keys.add(item.field)))
    walk(valid.advanced)
    return [...keys]
  }, [valid])
  const contagemDay = useMemo(() => {
    const f = valid.quick.cr40f_dataehorriodesada
    if (f?.op === 'today') return todayIso()
    if (f?.op === 'tomorrow') return shiftDay(todayIso(), 1)
    if (f?.op === 'between' && typeof f.value === 'string') return f.value.slice(0, 10)
    return todayIso()
  }, [valid])
  const hideColumn = useCallback((key: string) => {
    const base = prefs ?? { hidden: [], order: geral.columns.map((c) => c.key) }
    setPrefs({ ...base, hidden: base.hidden.includes(key) ? base.hidden : [...base.hidden, key] })
  }, [prefs, geral.columns, setPrefs])
  const resizeColumn = useCallback((key: string, width: number | null) => {
    const base = prefs ?? { hidden: [], order: geral.columns.map((c) => c.key) }
    const { [key]: _old, ...rest } = base.widths ?? {}
    const widths = width == null ? rest : { ...rest, [key]: width }
    const { widths: _w, ...others } = base
    setPrefs(Object.keys(widths).length ? { ...others, widths } : others)
  }, [prefs, geral.columns, setPrefs])
  const moveColumn = useCallback((key: string, toIndex: number) => {
    const base = prefs ?? { hidden: [], order: geral.columns.map((c) => c.key) }
    const keys = visibleColumns.map((c) => c.key)
    if (!keys.includes(key)) return
    const next = keys.filter((k) => k !== key)
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, key)
    const all = applyColumnPrefs(geral.columns, { ...base, hidden: [] }).map((c) => c.key)
    setPrefs({ ...base, order: [...next, ...all.filter((k) => !next.includes(k))] })
  }, [prefs, geral.columns, visibleColumns, setPrefs])
  // Visões pessoais: o que está na tela (colunas, larguras, ordenação e filtros) vira o fetchxml/layoutxml da visão.
  const { reloadViews } = geral
  const viewPayload = useCallback(async () => {
    if (!view) throw new Error('Nenhuma visão aberta.')
    if (geral.filtersIgnored) throw new Error('Os filtros não puderam ser aplicados porque os campos não carregaram. Atualize e tente de novo.')
    const fetchxml = buildViewFetch(view.fetchxml, geral.filters, geral.sort, geral.filterFields)
    const layoutxml = buildLayout(visibleColumns, prefs?.widths, await source.objectTypeCode())
    return { fetchxml, layoutxml }
  }, [view, geral.filtersIgnored, geral.filters, geral.sort, geral.filterFields, visibleColumns, prefs, source])
  const createView = useCallback(async (name: string) => (await source.createView({ name, ...(await viewPayload()) })).id, [source, viewPayload])
  const updateView = useCallback(async () => {
    if (!view) return
    await source.updateView(view.id, await viewPayload())
    // A visão agora carrega as colunas e larguras: as preferências locais já não têm o que acrescentar.
    setPrefs(null)
    await reloadViews()
  }, [view, source, viewPayload, setPrefs, reloadViews])
  const renameView = useCallback(async (name: string) => {
    if (!view) return
    await source.renameView(view.id, name)
    await reloadViews()
  }, [view, source, reloadViews])
  const deleteView = useCallback(async () => {
    if (!view) return
    await source.deleteView(view.id)
    saveColumnPrefs(source.kv, view.id, null)
    await reloadViews()
  }, [view, source, reloadViews])
  const { state: viewState, columnDefs } = useGeralViewState({
    views: geral.views, view, viewsError: geral.viewsError, columns: geral.columns, attributes, prefs, setPrefs,
    sort: geral.sort, setSort: geral.setSort, filters, setFilters, selectView, reloadViews,
    createView, updateView, renameView, deleteView, kv: source.kv,
  })
  const shareLink = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível.')
      await navigator.clipboard.writeText(window.location.href)
      toast({ tone: 'success', message: 'Link copiado.' })
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível copiar o link. Copie o endereço do navegador.' })
    }
  }, [toast])

  const openForm = useCallback(async (mode: 'create' | 'edit', id?: string) => {
    try {
      const result = await source.openForm(mode, id)
      if (result === 'closed') refresh()
      else if (result === 'external') setFormUrl(source.formUrl(mode, id))
      else setMockForm(true)
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, refresh, toast])

  // `#/geral?novo=1` (atalho "Novo serviço" da Página Inicial): abre a criação uma vez e tira o parâmetro do link.
  const novoTratado = useRef(false)
  useEffect(() => {
    if (novoTratado.current || readHashQuery().get('novo') !== '1') return
    novoTratado.current = true
    patchHashQuery({ novo: null })
    void openForm('create')
  }, [openForm])

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

  const linkBlock = useMemo(() => {
    const row = selectedIds.length === 1 ? rowOf(selectedIds[0]) : undefined
    return gerarLinkBlock(row ? [row] : [], selectedIds.length)
  }, [selectedIds, rowOf])
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null)
  const gerarLink = useCallback(async () => {
    if (linkBlock) return
    const id = selectedIds[0]
    const codigo = rowOf(id)?.cr40f_id
    const base = { codigo: typeof codigo === 'string' && codigo ? codigo : id }
    setLinkRequest({ ...base, loading: true })
    try {
      const result = await source.gerarLink(id)
      if (!result.ok || !result.link) setLinkRequest({ ...base, loading: false, erro: result.erro || LINK_FALHA })
      else setLinkRequest({ ...base, loading: false, link: result.link, expiraEm: result.expiraEm })
    } catch (reason) {
      setLinkRequest({ ...base, loading: false, erro: reason instanceof Error ? reason.message : LINK_FALHA })
    }
  }, [linkBlock, source, selectedIds, rowOf])

  const cadastroBlock = useMemo(() => {
    const row = selectedIds.length === 1 ? rowOf(selectedIds[0]) : undefined
    return linkCadastroBlock(row ? [row] : [], selectedIds.length)
  }, [selectedIds, rowOf])
  const [cadastroRequest, setCadastroRequest] = useState<LinkCadastroRequest | null>(null)
  const gerarLinkCadastro = useCallback(async () => {
    if (cadastroBlock) return
    const id = selectedIds[0]
    const codigo = rowOf(id)?.cr40f_id
    const base = { codigo: typeof codigo === 'string' && codigo ? codigo : id }
    setCadastroRequest({ ...base, loading: true })
    try {
      const result = await source.gerarLinkCadastro(id)
      if (!result.ok || !result.link) setCadastroRequest({ ...base, loading: false, erro: result.erro || LINK_CADASTRO_FALHA })
      else setCadastroRequest({ ...base, loading: false, link: result.link, expiraEm: result.expiraEm, passageiros: result.passageiros })
    } catch (reason) {
      setCadastroRequest({ ...base, loading: false, erro: reason instanceof Error ? reason.message : LINK_CADASTRO_FALHA })
    }
  }, [cadastroBlock, source, selectedIds, rowOf])

  const labelOf = useCallback((id: string) => { const name = rowOf(id)?.cr40f_id; return typeof name === 'string' && name ? name : id }, [rowOf])

  const askOp = useCallback(() => {
    const split = splitOp(selectedIds.map((id) => rowOf(id) ?? ({ [ID_ATTRIBUTE]: id } as Row)))
    if (split.ok.length === 0) { toast({ tone: 'info', message: 'Todos os serviços selecionados já possuem OP.' }); return }
    setOpError(null)
    setOpRequest({ ids: split.ok.map((r) => String(r[ID_ATTRIBUTE])), labels: split.ok.map((r) => labelOf(String(r[ID_ATTRIBUTE]))), excluded: split.comOp.map((r) => labelOf(String(r[ID_ATTRIBUTE]))) })
  }, [selectedIds, rowOf, labelOf, toast])

  const confirmOp = useCallback(async () => {
    if (!opRequest) return
    setOpBusy(true)
    setOpError(null)
    try {
      const url = await source.flowUrl('new_FlowUrlCriarOP')
      if (url == null) { setOpError('Variável de ambiente new_FlowUrlCriarOP não configurada.'); return }
      const { status } = await source.triggerFlow(url, { guids: opRequest.ids.join(',') })
      if (status === 200 || status === 202) {
        toast({ tone: 'success', message: `OP criada para ${opRequest.ids.length} serviço(s).` })
        setOpRequest(null)
        refresh()
      } else setOpError(`Erro ao acionar o flow (status ${status})`)
    } catch (reason) {
      setOpError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpBusy(false)
    }
  }, [opRequest, source, toast, refresh])

  const confirmDisparar = useCallback(async () => {
    if (!dispRequest) return
    const { ids } = dispRequest
    setDispBusy(true)
    try {
      const { ok, failed } = await source.programar(ids)
      if (failed.length === 0) toast({ tone: 'success', message: `${ok.length} serviço(s) programado(s).` })
      else toast({ tone: 'danger', message: `${ok.length} de ${ids.length} programados; falharam: ${failed.map((f) => labelOf(f.id)).join(', ')}. ${failed[0].message}` })
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    } finally {
      setDispBusy(false)
      setDispRequest(null)
      refresh()
      clearSelection()
    }
  }, [dispRequest, source, toast, refresh, clearSelection, labelOf])

  const openAuditoria = useCallback(async () => {
    try {
      const result = await source.openAuditoria(selectedIds)
      if (result === 'mock') toast({ tone: 'info', message: 'A auditoria abre dentro do Dataverse.' })
      else if (result === 'external') { const url = source.auditoriaUrl(selectedIds); if (url) setAuditoriaUrl(url) }
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, selectedIds, toast])

  const registrarErro = useCallback(async () => {
    try {
      const result = await source.openErroOperacional(selectedIds[0])
      if (result === 'mock') toast({ tone: 'info', message: 'A Gestão de Qualidade abre dentro do Dataverse.' })
      else if (result === 'closed') refresh()
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, selectedIds, toast, refresh])

  const mixedTitle = 'Selecione só serviços ativos ou só inativos.'
  const mixedId = useId()
  // Barra de seleção do celular: só aparece com linhas marcadas.
  const selectionCommands = (
    <>
      {selectedIds.length === 1 ? <Button variant="action" size="touch" icon={<Pencil size={16} />} onClick={() => { void openForm('edit', selectedIds[0]) }}>Editar</Button> : null}
      <Button variant="action" size="touch" icon={<Ticket size={16} />} onClick={openVoucher}>Gerar Voucher</Button>
      <Button variant="action" size="touch" icon={<Copy size={16} />} onClick={() => { void copySelected() }}>Copiar Serviços</Button>
      <Button variant="action" size="touch" icon={<FilePlus2 size={16} />} onClick={askOp}>Gerar OP</Button>
      <Button variant="action" size="touch" icon={<Send size={16} />} onClick={() => setDispRequest({ ids: selectedIds })}>Disparar</Button>
      {selectedState === 1
        ? <Button variant="action" size="touch" icon={<ArchiveRestore size={16} />} onClick={() => askState(true)}>Ativar</Button>
        : selectedState === 0
          ? <Button variant="danger" size="touch" icon={<Archive size={16} />} onClick={() => askState(false)}>Desativar</Button>
          // aria-disabled (não disabled): continua focável e o leitor de tela lê o motivo; o clique não faz nada.
          : <>
            <Button variant="danger" size="touch" className="gr-btn--blocked" icon={<Archive size={16} />} aria-disabled="true" aria-describedby={mixedId} title={mixedTitle} onClick={(event) => event.preventDefault()}>Desativar</Button>
            <Button variant="action" size="touch" className="gr-btn--blocked" icon={<ArchiveRestore size={16} />} aria-disabled="true" aria-describedby={mixedId} title={mixedTitle} onClick={(event) => event.preventDefault()}>Ativar</Button>
            <span id={mixedId} className="gr-sr">{mixedTitle}</span>
          </>}
      <Button variant="ghost" size="touch" icon={<X size={16} />} onClick={clearSelection}>Limpar seleção</Button>
    </>
  )
  const oneTitle = 'Selecione exatamente um serviço.'
  // aria-disabled (não disabled): o botão continua focável, o leitor de tela lê o motivo e o clique não faz nada.
  const blocked = (reason: string, describedBy: string) => ({
    className: 'gr-btn--blocked',
    'aria-disabled': 'true' as const,
    'aria-describedby': describedBy,
    title: reason,
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  })
  // Rótulo de item de menu com o motivo embaixo quando o item está inerte.
  const hint = (label: string, reason: string | null) => (reason ? <span className="gr-menu__hint" title={reason}>{label}<small>{reason}</small></span> : label)
  // Todos os comandos da linha têm o mesmo tamanho da barra do DS (40 px no desktop, 44 px no celular): nada de misturar compacto com padrão.
  const size = mobile ? 'touch' : 'default'
  const createButton = <Button size={size} icon={<Plus size={16} />} onClick={() => { void openForm('create') }}>Criar serviço</Button>
  // Desktop com linhas marcadas: a linha de comando vira a barra da seleção (como no model-driven). Sem seleção, os comandos
  // que dependem dela não aparecem; a única ação primária da página é "Criar serviço", a última à direita (DS §10.9.1).
  const selecting = !mobile && selectedIds.length > 0
  // Ações em lote do botão "Ações"; o clique direito na linha usa as mesmas, com Editar, Ativar/Desativar e Registrar Erro.
  const bulkActions: MenuAction[] = [
    { id: 'voucher', label: 'Gerar Voucher', icon: <Ticket size={16} />, onSelect: openVoucher },
    { id: 'copiar', label: 'Copiar Serviços', icon: <Copy size={16} />, onSelect: () => { void copySelected() } },
    { id: 'op', label: 'Gerar OP', icon: <FilePlus2 size={16} />, onSelect: askOp },
    { id: 'link', label: hint('Gerar link', linkBlock), icon: <Link2 size={16} />, disabled: linkBlock != null, onSelect: () => { void gerarLink() } },
    { id: 'cadastro', label: hint('Link de cadastro', cadastroBlock), icon: <UserPlus size={16} />, disabled: cadastroBlock != null, onSelect: () => { void gerarLinkCadastro() } },
    { id: 'disparar', label: 'Disparar', icon: <Send size={16} />, onSelect: () => setDispRequest({ ids: selectedIds }) },
  ]
  const one = selectedIds.length === 1
  const contextActions: MenuAction[] = [
    { id: 'editar', label: hint('Editar', one ? null : oneTitle), icon: <Pencil size={16} />, disabled: !one, onSelect: () => { void openForm('edit', selectedIds[0]) } },
    ...bulkActions,
    selectedState === 1
      ? { id: 'ativar', label: 'Ativar', icon: <ArchiveRestore size={16} />, group: '', onSelect: () => askState(true) }
      : { id: 'desativar', label: hint('Desativar', selectedState === 0 ? null : mixedTitle), icon: <Archive size={16} />, tone: 'danger' as const, group: '', disabled: selectedState !== 0, onSelect: () => askState(false) },
    { id: 'erro', label: hint('Registrar Erro', one ? null : oneTitle), icon: <Bug size={16} />, group: '', disabled: !one, onSelect: () => { void registrarErro() } },
  ]
  const selectedLabel = selectedIds.length === 1 ? '1 selecionado' : `${selectedIds.length} selecionados`
  const selectionBar = (
    <div className="gr-selection" role="group" aria-label="Comandos da seleção">
      <Button variant="ghost" size={size} icon={<X size={16} />} aria-label="Limpar seleção" title="Limpar seleção" onClick={clearSelection} />
      <span role="status" className="gr-filters__selected"><StatusBadge tone="info">{selectedLabel}</StatusBadge></span>
      {selectedIds.length === 1 ? <Button variant="action" size={size} icon={<Pencil size={16} />} onClick={() => { void openForm('edit', selectedIds[0]) }}>Editar</Button> : null}
      {selectedState === 1
        ? <Button variant="action" size={size} icon={<ArchiveRestore size={16} />} onClick={() => askState(true)}>Ativar</Button>
        : selectedState === 0
          ? <Button variant="danger" size={size} icon={<Archive size={16} />} onClick={() => askState(false)}>Desativar</Button>
          : <>
            <Button variant="danger" size={size} icon={<Archive size={16} />} {...blocked(mixedTitle, mixedId)}>Desativar</Button>
            <Button variant="action" size={size} icon={<ArchiveRestore size={16} />} {...blocked(mixedTitle, mixedId)}>Ativar</Button>
            <span id={mixedId} className="gr-sr">{mixedTitle}</span>
          </>}
      <Menu
        align="start"
        trigger={(props) => <Button {...props} variant="action" size={size} icon={<ChevronDown size={16} />} aria-label={`Ações (${selectedIds.length})`}>Ações</Button>}
        actions={bulkActions}
      />
    </div>
  )
  // "⋮" (Mais ações): o que é raro sai da linha. Modo de exibição, link da tela e os atalhos para outras telas.
  const shortcuts = (
    <Menu
      trigger={(props) => <Button {...props} variant="secondary" size={size} icon={<MoreVertical size={16} />} aria-label="Mais ações" />}
      actions={[
        ...(mobile ? [] : [
          { id: 'tabela', label: 'Ver como tabela', icon: <Table2 size={16} />, group: 'Mostrar como', selected: mode === 'tabela', onSelect: () => changeMode('tabela') },
          { id: 'cards', label: 'Ver como cards', icon: <LayoutGrid size={16} />, group: 'Mostrar como', selected: mode === 'cards', onSelect: () => changeMode('cards') },
        ]),
        { id: 'compartilhar', label: 'Compartilhar link', icon: <Link2 size={16} />, group: '', onSelect: () => { void shareLink() } },
        { id: 'funcoes', label: 'Funções Operacionais', icon: <ClipboardList size={16} />, group: 'Atalhos', onSelect: () => { location.hash = hrefFor('new_telafuncoesoperacionais') } },
        { id: 'escala', label: 'Escala FDS', icon: <CalendarDays size={16} />, group: 'Atalhos', onSelect: () => setEscalaOpen(true) },
        { id: 'auditoria', label: 'Auditoria', icon: <ShieldCheck size={16} />, group: 'Atalhos', onSelect: () => { void openAuditoria() } },
        { id: 'erro', label: hint('Registrar Erro', selectedIds.length === 1 ? null : oneTitle), icon: <Bug size={16} />, group: 'Atalhos', disabled: selectedIds.length !== 1, onSelect: () => { void registrarErro() } },
        { id: 'contagem', label: 'Contagem de Serviços', icon: <ListChecks size={16} />, group: 'Atalhos', onSelect: () => setContagemOpen(true) },
      ]}
    />
  )

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar serviços" onClick={reload} />, [reload])
  useShellHeader({ title: 'Geral', actions: headerActions })

  const { save, resetCell, cells, selectOnly, selectRange, toggle } = geral
  const selectForEdit = useCallback((id: string) => selectOnly(id, true), [selectOnly])
  // Clique direito (DS §10.9.3): linha fora da seleção vira a seleção; Ctrl/⌘, campos e célula em edição ficam com o menu do navegador.
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null)
  const closeContext = useCallback(() => setContextAt(null), [])
  const openContext = useCallback((id: string, event: MouseEvent<HTMLElement>) => {
    if (wantsNativeMenu(event) || (event.target as Element).closest('.gr-cell--editing')) return
    event.preventDefault()
    if (!geral.selected.has(id)) selectOnly(id)
    setContextAt({ x: event.clientX, y: event.clientY })
  }, [geral.selected, selectOnly])
  const selectRow = useCallback((id: string, mode: 'only' | 'toggle' | 'range') => {
    if (mode === 'range') selectRange(id)
    else if (mode === 'toggle') toggle(id)
    else selectOnly(id)
  }, [selectOnly, selectRange, toggle])
  // Callbacks estáveis: a célula passa o próprio id/coluna, então só a que mudou de status ou de linha renderiza de novo.
  const searchLookup = useCallback((attribute: string, text: string) => source.search(attribute, text), [source])
  // Os filtros do @betinhos/ui descartam respostas antigas, mas consultam a cada tecla: aqui ganham a pausa na digitação.
  // Um por editor (painel de filtros e filtro rápido da coluna), para um não cancelar a busca do outro.
  const filterOptions = useCallback(async (field: { key: string }, text: string): Promise<FilterOption[]> =>
    (await source.search(field.key, text)).map((o) => ({ value: o.id, label: o.nome })), [source])
  const searchFilter = useMemo(() => debounceSearch(filterOptions), [filterOptions])
  const searchQuickFilter = useMemo(() => debounceSearch(filterOptions), [filterOptions])
  // Busca por palavra-chave: o texto fica local; a busca de verdade sai depois da pausa.
  const [searchText, setSearchText] = useState(query)
  useEffect(() => setSearchText(query), [query])
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
        onBeginEdit={selectForEdit}
        search={searchLookup}
        editable={attributes != null}
      />
    )
  }, [attributes, cells, save, resetCell, searchLookup, selectForEdit])

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
        {cardsLayout
          ? (
            <div className={mobile ? (geral.selected.size > 0 ? 'gr-mobile has-selection' : 'gr-mobile') : 'gr-cardsview'}>
              <div ref={mobile ? undefined : cardsScrollRef} className={mobile ? undefined : 'gr-cardsview__scroll'}>
              <GeralCards
                grid={!mobile}
                rows={rows}
                columns={visibleColumns}
                attributes={attributes}
                loading={loading}
                selected={geral.selected}
                onToggle={geral.toggle}
                onOpen={(id) => { void openForm('edit', id) }}
                onEdit={setEditId}
                onCardContextMenu={mobile ? undefined : openContext}
                footer={rows.length > 0 || loadError ? <LoadMore root={mobile ? null : cardsScrollRef} {...loadMoreProps} /> : null}
              />
              </div>
              {!loading && rows.length === 0 && !geral.pageError ? <div className="gr-empty">{empty}</div> : null}
            </div>
          )
          : (
            <GeralTable
              columns={visibleColumns}
              customWidths={prefs?.widths}
              onResize={resizeColumn}
              onMove={moveColumn}
              attributes={attributes}
              rows={rows}
              loading={loading}
              sort={geral.sort}
              defaultSort={geral.defaultOrder}
              onSort={geral.setSort}
              filteredKeys={filteredKeys}
              quick={{ fields: filterFields, value: valid.quick, onChange: setQuickFilter, search: searchQuickFilter }}
              onClearFilter={(attribute) => setQuickFilter(attribute, null)}
              onHide={hideColumn}
              selected={geral.selected}
              onToggle={geral.toggle}
              onSelectRow={selectRow}
              onRowContextMenu={openContext}
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

  const notApplied = geral.filtersIgnored ? [...Object.keys(filters.quick), ...filters.advanced.items.map((i) => i.id)] : undefined

  return (
    <ProtecaoContext.Provider value={protecao}>
      <div className="page page--full gr-page">
        {/* A linha de comando da lista (DS §10.9.1): visão, colunas, filtros, busca e comandos. */}
        <div role="toolbar" aria-label="Comandos de serviços" className={selecting ? 'gr-commandline is-selecting' : 'gr-commandline'}>
        <ViewBar
          view={viewState}
          columns={columnDefs}
          catalog={catalog}
          filters={{ fields: filterFields, search: searchFilter, notApplied }}
        >
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          {selecting ? selectionBar : (
            <>
              <SearchBox className="gr-filters__search" size={size} aria-label="Buscar serviços" placeholder="Buscar por ID, trajeto, cliente…" value={searchText} onChange={setSearchText} onSearch={(value) => { if (value.trim() !== query) setQuery(value.trim()) }} debounce={300} loading={loading && query !== ''} />
              <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title={status ?? 'Atualizar'} loading={loading && rows.length > 0} onClick={reload} />
            </>
          )}
          {shortcuts}
          {selecting ? null : createButton}
        </ViewBar>
        </div>
        <Stack gap="4" className="gr-body">
        {body}
        {mobile && geral.selected.size > 0 ? (
          <div className="gr-selbar" role="group" aria-label="Ações sobre os selecionados">
            <span role="status" className="gr-selbar__count">{geral.selected.size === 1 ? '1 selecionado' : `${geral.selected.size} selecionados`}</span>
            {selectionCommands}
          </div>
        ) : null}
        {cardsLayout && editRow ? (
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
        <LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)}
          onCopied={(what) => toast({ tone: 'success', message: what === 'link' ? 'Link copiado.' : 'Mensagem copiada.' })}
          onCopyFailed={(reason) => toast({ tone: 'danger', message: `Não foi possível copiar. ${reason instanceof Error ? reason.message : ''}`.trim() })} />
        <LinkCadastroDrawer request={cadastroRequest} mobile={mobile} onClose={() => setCadastroRequest(null)}
          onCopied={() => toast({ tone: 'success', message: 'Link copiado.' })}
          onCopyFailed={(reason) => toast({ tone: 'danger', message: `Não foi possível copiar. ${reason instanceof Error ? reason.message : ''}`.trim() })} />
        <StateDialog request={stateRequest} busy={stateBusy} onClose={() => setStateRequest(null)} onConfirm={() => { void confirmState() }} />
        <MockFormDialog open={mockForm} onClose={() => setMockForm(false)} />
        <ContagemDrawer open={contagemOpen} onClose={() => setContagemOpen(false)} source={source} initialDay={contagemDay} kv={source.kv} mobile={mobile} />
        <EscalaFdsDrawer url={source.escalaFdsUrl()} open={escalaOpen} onClose={() => setEscalaOpen(false)} />
        <GerarOpDialog request={opRequest} busy={opBusy} error={opError} onClose={() => setOpRequest(null)} onConfirm={() => { void confirmOp() }} />
        <DispararDialog request={dispRequest} busy={dispBusy} onClose={() => setDispRequest(null)} onConfirm={() => { void confirmDisparar() }} />
        <ContextMenu at={contextAt} actions={contextActions} onClose={closeContext} />
        {auditoriaUrl ? <AuditoriaOverlay url={auditoriaUrl} onClose={() => setAuditoriaUrl(null)} /> : null}
        {voucherUrl ? <VoucherOverlay url={voucherUrl} onClose={() => setVoucherUrl(null)} /> : null}
        {formUrl ? <FormOverlay url={formUrl} onClose={() => { setFormUrl(null); refresh() }} /> : null}
        </Stack>
      </div>
    </ProtecaoContext.Provider>
  )
}
