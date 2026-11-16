import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Row } from '@betinhos/dataverse'
import { Alert, Button, ContextMenu, EmptyState, SearchBox, Stack, StatusBadge, ToastProvider, ViewBar, readFilters, selectionMenuActions, useShellHeader, useToast, wantsNativeMenu, type FilterGroup, type FilterOption, type MenuAction, type SelectionAction } from '@betinhos/ui'
import { Archive, ArchiveRestore, Bug, CalendarDays, ClipboardList, Copy, FilePlus2, LayoutGrid, Link2, ListChecks, Pencil, Plus, RefreshCw, SearchX, Send, Share2, ShieldCheck, Table2, Ticket, UserPlus } from 'lucide-react'
import type { Host } from '../../host'
import { useMedia } from '../operacional/useMedia'
import { hrefFor, patchHashQuery, queryFromHash, readHashQuery } from '../../nav/useHashRoute'
import { createDataverseExtraSource, createMockExtraSource, extraCatalog, resolveLinkColumns } from '../../app/extraColumns'
import { useTableLabel } from '../../app/useListView'
import { createSource } from './data/source'
import { ProtecaoContext } from './components/ProtecaoLock'
import type { Protecao } from './domain/protecao'
import { Cell } from './components/Cell'
import { GeralCards } from './components/GeralCards'
import { GeralSheet } from './components/GeralSheet'
import { recebimentosSource } from '../recebimentos/source'
import { useContagemRecebimentos } from '../recebimentos/useContagemRecebimentos'
import { ComprovantesServicoDrawer, IndicadorRecebimentos, type ServicoAberto } from '../recebimentos/ComprovantesServicoDrawer'
import { GeralTable, type Grouping } from './components/GeralTable'
import { CopyDialog, DispararDialog, GerarOpDialog, LinkDialog, MockFormDialog, StateDialog, type DispararRequest, type LinkRequest, type OpRequest, type StateRequest } from './components/Dialogs'
import { ContagemDrawer, shiftDay, todayIso } from './components/ContagemDrawer'
import { EscalaFdsDrawer } from './components/EscalaFdsDrawer'
import { LoadMore, LoadSentinel, statusText } from './components/LoadMore'
import { debounceSearch } from './components/useLookupSearch'
import { LiberarPortalDrawer } from './components/LiberarPortalDrawer'
import { createPortalSource, type Liberacao } from './data/portal'
import { PORTAL_COLUMN, PORTAL_KEY, rotuloStatus, tomStatus, type StatusValidacao } from './domain/portal'
import { COMPROVANTES_COLUMN, COMPROVANTES_KEY } from './domain/comprovantes'
import { groupFields } from './domain/grouping'
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
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'
import { formatCell } from './domain/format'
import { ENTITY, ID_ATTRIBUTE, type CellStatus, type Column, type Sort } from './domain/types'
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
const VIRTUAL_COLUMNS = [COMPROVANTES_COLUMN, PORTAL_COLUMN]
const VIRTUAL_KEYS: ReadonlySet<string> = new Set(VIRTUAL_COLUMNS.map((c) => c.key))

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
  const auditoria = useAuditoria()
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
  // Colunas virtuais: "Comprovantes" vem ligada logo depois da primeira coluna; "Portal" fica no painel, oculta até o
  // usuário ligar. Preferência salva antes delas recebe cada uma no lugar padrão.
  const allColumns = useMemo(() => {
    const [first, ...rest] = geral.columns
    return first ? [first, COMPROVANTES_COLUMN, ...rest, PORTAL_COLUMN] : []
  }, [geral.columns])
  const viewPrefs = useMemo(() => {
    if (!prefs) return prefs
    let { order, hidden } = prefs
    if (order.length && !order.includes(COMPROVANTES_KEY)) order = [order[0], COMPROVANTES_KEY, ...order.slice(1)]
    if (!order.includes(PORTAL_KEY)) { order = [...order, PORTAL_KEY]; hidden = [...hidden, PORTAL_KEY] }
    return order === prefs.order ? prefs : { ...prefs, order, hidden }
  }, [prefs])
  // A primeira coluna é o botão que abre o serviço: coluna virtual levada para lá fica logo depois dela.
  const visibleColumns = useMemo(() => {
    const cols = applyColumnPrefs(allColumns, viewPrefs ?? { hidden: [PORTAL_KEY], order: [] })
    const real = cols.findIndex((c) => !VIRTUAL_KEYS.has(c.key))
    // Só virtuais visíveis (todas as reais ocultas): a primeira real volta, senão a coluna virtual viraria o botão.
    if (real < 0) return allColumns.length ? [allColumns[0], ...cols] : cols
    return real > 0 ? [cols[real], ...cols.slice(0, real), ...cols.slice(real + 1)] : cols
  }, [allColumns, viewPrefs])
  const dataColumns = useMemo(() => visibleColumns.filter((c) => !VIRTUAL_KEYS.has(c.key)), [visibleColumns])
  const setPrefs = useCallback((next: ColumnPrefs | null) => {
    if (viewId == null) return
    saveColumnPrefs(source.kv, viewId, next)
    setSaved((s) => ({ ...s, [viewId]: next }))
  }, [source.kv, viewId])

  // "Adicionar coluna" (DS §10.9.1): campos da reserva e das relações N:1; as escolhidas viram link-entity na consulta.
  const extraSource = useMemo(() => (host.mode === 'dataverse' ? createDataverseExtraSource(host) : createMockExtraSource()), [host])
  const tableLabel = useTableLabel(extraSource, ENTITY)
  const catalog = useMemo(() => extraCatalog(extraSource, ENTITY, tableLabel), [extraSource, tableLabel])
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
  const [opRequest, setOpRequest] = useState<OpRequest | null>(null)
  const [opBusy, setOpBusy] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const [dispRequest, setDispRequest] = useState<DispararRequest | null>(null)
  const [dispBusy, setDispBusy] = useState(false)
  const [escalaOpen, setEscalaOpen] = useState(false)
  const [contagemOpen, setContagemOpen] = useState(false)
  // Filtros do Design System (§10.9.2): rápidos por coluna e avançado E/OU; valem os que casam com os campos da metadata.
  const { filters, setFilters, setQuickFilter, filterFields } = geral
  const { group, setGroup, groupSpec, buckets, groupLoads, toggleGroup, retryGroup, loadMoreGroup } = geral
  // Cartões (celular ou modo Cartões) não agrupam: ao entrar neles o agrupamento sai, para a lista não ficar vazia com os grupos fechados.
  useEffect(() => { if (cardsLayout && group) setGroup(null) }, [cardsLayout, group, setGroup])
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
    let at = Math.max(0, Math.min(toIndex, next.length))
    // A primeira coluna saindo do lugar: as virtuais que vinham logo depois dela ficam com a nova primeira, então ela
    // vai para depois da próxima real (sem isso, Alt+→ e soltar logo depois da virtual não a moviam).
    const lead = key === keys[0] ? next.findIndex((k) => !VIRTUAL_KEYS.has(k)) : 0
    if (lead > 0 && at <= lead) at = Math.min(lead + 1, next.length)
    next.splice(at, 0, key)
    const all = applyColumnPrefs(geral.columns, { ...base, hidden: [] }).map((c) => c.key)
    setPrefs({ ...base, order: [...next, ...all.filter((k) => !next.includes(k))] })
  }, [prefs, geral.columns, visibleColumns, setPrefs])
  // Visões pessoais: o que está na tela (colunas, larguras, ordenação e filtros) vira o fetchxml/layoutxml da visão.
  const { reloadViews } = geral
  const viewPayload = useCallback(async () => {
    if (!view) throw new Error('Nenhuma visão aberta.')
    if (geral.filtersIgnored) throw new Error('Os filtros não puderam ser aplicados porque os campos não carregaram. Atualize e tente de novo.')
    const fetchxml = buildViewFetch(view.fetchxml, geral.filters, geral.sort, geral.filterFields)
    const layoutxml = buildLayout(dataColumns, prefs?.widths, await source.objectTypeCode())
    return { fetchxml, layoutxml }
  }, [view, geral.filtersIgnored, geral.filters, geral.sort, geral.filterFields, dataColumns, prefs, source])
  const createView = useCallback(async (name: string) => (await source.createView({ name, ...(await viewPayload()) })).id, [source, viewPayload])
  const updateView = useCallback(async () => {
    if (!view) return
    await source.updateView(view.id, await viewPayload())
    // A visão agora carrega as colunas e larguras: das preferências locais só fica a coluna virtual oculta (não entra no layoutxml).
    const hiddenVirtual = (prefs?.hidden ?? []).filter((k) => VIRTUAL_KEYS.has(k))
    setPrefs(hiddenVirtual.length ? { hidden: hiddenVirtual, order: [] } : null)
    await reloadViews()
  }, [view, source, viewPayload, prefs, setPrefs, reloadViews])
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
  const { setSort: setGeralSort } = geral
  // Colunas virtuais não existem no FetchXML: não ordenam.
  const setSort = useCallback((next: Sort) => {
    const virtual = next && VIRTUAL_COLUMNS.find((c) => c.key === next.attribute)
    if (virtual) { toast({ tone: 'info', message: `A coluna ${virtual.label} não pode ser ordenada.` }); return }
    setGeralSort(next)
  }, [setGeralSort, toast])
  const { state: viewState, columnDefs } = useGeralViewState({
    views: geral.views, view, viewsError: geral.viewsError, columns: allColumns, attributes, prefs: viewPrefs, setPrefs, hiddenByDefault: [PORTAL_KEY],
    sort: geral.sort, setSort, filters, setFilters, group, setGroup, selectView, reloadViews,
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

  // Com seleção, só as OS selecionadas; sem seleção, as alterações recentes da tabela.
  const openAuditoria = useCallback(() => auditoria({ entity: ENTITY, ids: selectedIds }), [auditoria, selectedIds])

  const registrarErro = useCallback(async () => {
    try {
      const result = await source.openErroOperacional(selectedIds[0])
      if (result === 'mock') toast({ tone: 'info', message: 'A Gestão de Qualidade abre dentro do Dataverse.' })
      else if (result === 'closed') refresh()
    } catch (reason) {
      toast({ tone: 'danger', message: reason instanceof Error ? reason.message : String(reason) })
    }
  }, [source, selectedIds, toast, refresh])

  // Liberar para o portal do cliente: cria/reativa cr40f_validacaoservico; a reserva (e o status de faturamento) não muda.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const portal = useMemo(() => createPortalSource(host, () => rowsRef.current), [host])
  const [liberarIds, setLiberarIds] = useState<string[] | null>(null)
  const [portalStatus, setPortalStatus] = useState<Map<string, StatusValidacao>>(new Map())
  const [portalSeq, setPortalSeq] = useState(0)
  const portalVisible = visibleColumns.some((c) => c.key === PORTAL_KEY)
  // Status já pedidos: cada página nova consulta só as linhas que chegaram; liberar tira do cache os liberados.
  const portalAsked = useRef(new Set<string>())
  useEffect(() => {
    if (!portalVisible) return
    const novos = rows.map((r) => String(r[ID_ATTRIBUTE])).filter((id) => !portalAsked.current.has(id))
    if (!novos.length) return
    novos.forEach((id) => portalAsked.current.add(id))
    portal.status(novos).then(
      (found) => setPortalStatus((cur) => { const next = new Map(cur); for (const id of novos) { const st = found.get(id); if (st) next.set(id, st); else next.delete(id) } return next }),
      // Falha: some do cache para a próxima mudança de linhas tentar de novo.
      () => novos.forEach((id) => portalAsked.current.delete(id)),
    )
  }, [portal, portalVisible, rows, portalSeq])
  const recebimentos = recebimentosSource(host)
  // Contagem só quando aparece: nos cards (ao lado do ID) ou com a coluna Comprovantes visível na tabela.
  const comprovantesVisible = cardsLayout || visibleColumns.some((c) => c.key === COMPROVANTES_KEY)
  const contagem = useContagemRecebimentos(recebimentos, useMemo(() => (comprovantesVisible ? rows.map((r) => String(r[ID_ATTRIBUTE])) : []), [rows, comprovantesVisible]))
  const [comprovantesDe, setComprovantesDe] = useState<ServicoAberto | null>(null)
  const besideId = useCallback((id: string, nome: string) => <IndicadorRecebimentos quantidade={contagem.get(id.toLowerCase())} onClick={() => setComprovantesDe({ id, nome })} />, [contagem])
  const askLiberar = useCallback(() => { if (selectedIds.length) setLiberarIds(selectedIds) }, [selectedIds])
  const doneLiberar = useCallback((result: Liberacao, bloqueados: number) => {
    setLiberarIds(null)
    const fora = bloqueados + result.failed.length
    const msg = `${result.ok.length} ${result.ok.length === 1 ? 'serviço liberado' : 'serviços liberados'} para o portal${fora ? `; ${fora} ${fora === 1 ? 'ficou' : 'ficaram'} de fora` : ''}.`
    toast(result.failed.length
      ? { tone: 'danger', message: `${msg} Falharam: ${result.failed.map((f) => labelOf(f.id)).join(', ')}. ${result.failed[0].message}` }
      : { tone: 'success', message: msg })
    result.ok.forEach((id) => portalAsked.current.delete(id))
    setPortalSeq((n) => n + 1)
    clearSelection()
  }, [toast, labelOf, clearSelection])

  const mixedTitle = 'Selecione só serviços ativos ou só inativos.'
  const one = selectedIds.length === 1
  // Todos os comandos da linha têm o mesmo tamanho da barra do DS (40 px no desktop, 44 px no celular): nada de misturar compacto com padrão.
  const size = mobile ? 'touch' : 'default'
  // Ações da seleção (DS §10.9.6): uma lista só para a linha de comando, o menu ⋮, a barra do celular e o clique direito.
  // `inline` vai para a linha. No desktop a lista é a mesma com 0, 1 ou N marcados: a barra reserva o espaço medindo-a, então
  // os controles fixos não andam ao marcar (com N, "Editar" fica inerte com o motivo). No celular a barra do rodapé tem 2
  // lugares: "Editar" só entra com um serviço marcado.
  const selectionActions: SelectionAction[] = [
    { id: 'editar', label: 'Editar', icon: <Pencil size={16} />, single: true, inline: mobile ? one : true, onSelect: () => { void openForm('edit', selectedIds[0]) } },
    { id: 'copiar', label: 'Copiar Serviços', icon: <Copy size={16} />, inline: true, onSelect: () => { void copySelected() } },
    selectedState === 1
      ? { id: 'ativar', label: 'Ativar', icon: <ArchiveRestore size={16} />, inline: true, onSelect: () => askState(true) }
      : { id: 'desativar', label: 'Desativar', icon: <Archive size={16} />, tone: 'danger', inline: true, blocked: selectedState === 0 ? null : mixedTitle, onSelect: () => askState(false) },
    { id: 'voucher', label: 'Gerar Voucher', icon: <Ticket size={16} />, group: 'Enviar', onSelect: openVoucher },
    { id: 'disparar', label: 'Disparar', icon: <Send size={16} />, group: 'Enviar', onSelect: () => setDispRequest({ ids: selectedIds }) },
    { id: 'portal', label: 'Liberar para o portal', icon: <Share2 size={16} />, group: 'Enviar', onSelect: askLiberar },
    { id: 'link', label: 'Gerar link', icon: <Link2 size={16} />, group: 'Enviar', blocked: linkBlock, onSelect: () => { void gerarLink() } },
    { id: 'cadastro', label: 'Link de cadastro', icon: <UserPlus size={16} />, group: 'Enviar', blocked: cadastroBlock, onSelect: () => { void gerarLinkCadastro() } },
    { id: 'op', label: 'Gerar OP', icon: <FilePlus2 size={16} />, group: 'Operação', onSelect: askOp },
    { id: 'erro', label: 'Registrar Erro', icon: <Bug size={16} />, group: 'Operação', single: true, onSelect: () => { void registrarErro() } },
  ]
  const selection = { count: selectedIds.length, onClear: clearSelection, actions: selectionActions }
  const contextActions = selectionMenuActions(selection)
  // "⋮" (Mais ações): só o que é raro e não depende da seleção. Modo de exibição, link da tela e os atalhos para outras telas.
  const moreActions: MenuAction[] = [
    ...(mobile ? [] : [
      { id: 'tabela', label: 'Ver como tabela', icon: <Table2 size={16} />, group: 'Mostrar como', selected: mode === 'tabela', onSelect: () => changeMode('tabela') },
      { id: 'cards', label: 'Ver como cards', icon: <LayoutGrid size={16} />, group: 'Mostrar como', selected: mode === 'cards', onSelect: () => changeMode('cards') },
    ]),
    { id: 'compartilhar', label: 'Compartilhar link', icon: <Link2 size={16} />, group: '', onSelect: () => { void shareLink() } },
    { id: 'funcoes', label: 'Funções Operacionais', icon: <ClipboardList size={16} />, group: 'Atalhos', onSelect: () => { location.hash = hrefFor('funcoes-operacionais') } },
    { id: 'escala', label: 'Escala FDS', icon: <CalendarDays size={16} />, group: 'Atalhos', onSelect: () => setEscalaOpen(true) },
    { id: 'contagem', label: 'Contagem de Serviços', icon: <ListChecks size={16} />, group: 'Atalhos', onSelect: () => setContagemOpen(true) },
  ]
  // "Atualizar" fica na linha de comando em todas as larguras; o cabeçalho do celular não repete.
  useShellHeader({ title: 'Geral' })

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
    if (column.key === COMPROVANTES_KEY) return <div role="gridcell" className="bt-table__cell gr-cell gr-cell--readonly">{besideId(id, formatCell('readonly', row, 'cr40f_id'))}</div>
    if (column.key === PORTAL_KEY) {
      const st = portalStatus.get(id)
      return <div role="gridcell" className="bt-table__cell gr-cell gr-cell--readonly">{st ? <StatusBadge tone={tomStatus(st)}>{rotuloStatus(st)}</StatusBadge> : <span className="gr-cell__value">—</span>}</div>
    }
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
  }, [attributes, cells, save, resetCell, searchLookup, selectForEdit, portalStatus, besideId])

  const editRow = editId == null ? undefined : rowOf(editId)

  const rowById = useMemo(() => new Map(rows.map((r) => [String(r[ID_ATTRIBUTE]), r])), [rows])
  const grouping = useMemo<Grouping | undefined>(() => {
    if (cardsLayout) return undefined
    const fields = groupFields(filterFields)
    return {
      groups: groupSpec && buckets
        ? buckets.map((bucket) => {
          const load = groupLoads.get(bucket.id)
          return {
            id: bucket.id, label: bucket.label, count: bucket.count, open: load != null,
            rows: (load?.ids ?? []).flatMap((id) => { const row = rowById.get(id); return row ? [row] : [] }),
            more: load?.more ?? false, loading: load?.loading ?? false, error: load?.error ?? null,
          }
        })
        : null,
      onToggle: toggleGroup,
      onLoadMore: loadMoreGroup,
      onRetry: retryGroup,
      menu: (column) => {
        const field = column.alias ? undefined : fields.find((f) => f.key === column.attribute)
        if (!field) return undefined
        const date = field.kind === 'date'
        return {
          date,
          active: group?.key !== field.key ? null : date ? group.by ?? 'month' : 'value',
          onChange: (next) => setGroup(!next ? null : date ? { key: field.key, by: next === 'year' ? 'year' : 'month' } : { key: field.key }),
        }
      },
    }
  }, [cardsLayout, filterFields, groupSpec, buckets, groupLoads, rowById, group, toggleGroup, loadMoreGroup, retryGroup, setGroup])
  const grouped = grouping?.groups != null
  const loadMoreProps = { more, loading, loadingMore, error: loadError, loaded: rows.length, total, onLoadMore: loadMore, onRetry: retryLoadMore, touch: mobile }
  const sentinel = more && !loading && !loadingMore && !loadError
  const status = loading && rows.length === 0 && !grouped ? null : grouped ? `${total ?? 0} ${total === 1 ? 'serviço' : 'serviços'} em ${buckets?.length ?? 0} ${buckets?.length === 1 ? 'grupo' : 'grupos'}` : statusText(rows.length, total, more)

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
                columns={dataColumns}
                attributes={attributes}
                loading={loading}
                selected={geral.selected}
                onToggle={geral.toggle}
                onOpen={(id) => { void openForm('edit', id) }}
                besideId={besideId}
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
              density={viewState.density}
              columns={visibleColumns}
              customWidths={prefs?.widths}
              onResize={resizeColumn}
              onMove={moveColumn}
              attributes={attributes}
              rows={rows}
              grouping={grouping}
              loading={loading}
              sort={geral.sort}
              defaultSort={geral.defaultOrder}
              onSort={setSort}
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
              unsortable={VIRTUAL_KEYS}
              scrollRef={scrollRef}
              tail={<LoadSentinel root={scrollRef} active={sentinel} loaded={rows.length} onLoadMore={loadMore} />}
              footer={grouped ? <div className="gr-loadmore" role="status"><span>{status}{rows.length > 0 ? ` · ${rows.length} carregados` : ''}</span></div> : <LoadMore root={scrollRef} sentinel={false} {...loadMoreProps} />}
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
        <div role="toolbar" aria-label="Comandos de serviços" className="gr-commandline">
        <ViewBar
          onAudit={openAuditoria}
          view={viewState}
          columns={columnDefs}
          catalog={catalog}
          filters={{ fields: filterFields, search: searchFilter, notApplied }}
          search={<SearchBox className="gr-filters__search" size={size} aria-label="Buscar serviços" placeholder="Buscar por ID, trajeto, cliente…" value={searchText} onChange={setSearchText} onSearch={(value) => { if (value.trim() !== query) setQuery(value.trim()) }} debounce={300} loading={loading && query !== ''} />}
          more={moreActions}
          // "Atualizar" fica junto da primária: o que está em `primary` nunca sai da linha (DS §10.9.1).
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title={status ?? 'Atualizar'} loading={loading && rows.length > 0} onClick={reload} />
            <Button size={size} icon={<Plus size={16} />} title="Criar serviço" onClick={() => { void openForm('create') }}>Criar serviço</Button>
          </>}
          selection={selection}
        >
          {/* Depois da busca; continua visível com seleção (DS 1.26). Não encolhe: no celular empurraria "Criar serviço" para fora. */}
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
        </div>
        <Stack gap="4" className="gr-body">
        {body}
        {cardsLayout && editRow ? (
          <GeralSheet
            row={editRow}
            columns={dataColumns}
            attributes={attributes}
            cellStatus={(attribute) => cells.get(cellKey(String(editRow[ID_ATTRIBUTE]), attribute)) ?? IDLE}
            open
            onClose={() => setEditId(null)}
            onSave={(column, value) => save(String(editRow[ID_ATTRIBUTE]), column, value)}
            onReset={(column) => resetCell(String(editRow[ID_ATTRIBUTE]), column.attribute)}
            search={(column, text) => source.search(column.attribute, text)}
            recebimentos={recebimentos}
          />
        ) : null}
        <ComprovantesServicoDrawer servico={comprovantesDe} source={recebimentos} mobile={mobile} onClose={() => setComprovantesDe(null)} />
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
        <LiberarPortalDrawer ids={liberarIds} source={portal} mobile={mobile} onClose={() => setLiberarIds(null)} onDone={doneLiberar} />
        <ContextMenu at={contextAt} actions={contextActions} onClose={closeContext} />
        {voucherUrl ? <VoucherOverlay url={voucherUrl} onClose={() => setVoucherUrl(null)} /> : null}
        {formUrl ? <FormOverlay url={formUrl} onClose={() => { setFormUrl(null); refresh() }} /> : null}
        </Stack>
      </div>
    </ProtecaoContext.Provider>
  )
}
