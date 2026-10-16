import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader, useToast } from '@betinhos/ui'
import { RefreshCw, SearchX, WalletCards } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { EMPTY_FILTERS, PERIODOS, VIEWS_KEY, loadViews, periodoStart, total, type Periodo } from './domain/filters'
import { PAGANTE_COLUMNS, PAGANTE_SORT, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, matchesKeyword, paganteFields, readPagante, sortPagantes } from './domain/lista'
import { formatMoney } from './domain/messages'
import { pagantesQuery } from './domain/query'
import { applyPatch, statusPatch } from './domain/status'
import type { Pagante } from './domain/types'
import { usePagantes } from './usePagantes'
import { PagantesCards, PagantesTable } from './components/PagantesList'
import { PaganteDrawer } from './components/PaganteDrawer'
import { GerarPagantesFrame, StatusDialog, type StatusRequest } from './components/Dialogs'
import './pagantes.css'

export function PagantesPage({ host }: { host: Host }) {
  return <ToastProvider><Pagantes host={host} /></ToastProvider>
}

/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. `q` e `periodo` continuam. */
const LEGACY_KEYS = ['status', 'forma', 'recibo', 'falhas'] as const
const isPeriodo = (v: string): v is Periodo => PERIODOS.some((p) => p.value === v)
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Pagantes({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // O período decide o que carrega do Dataverse; fica na URL e fora da visão.
  const [periodoUrl, setPeriodo] = useQueryTexto('periodo', EMPTY_FILTERS.periodo)
  const periodo = isPeriodo(periodoUrl) ? periodoUrl : EMPTY_FILTERS.periodo
  const since = useMemo(() => periodoStart(periodo, new Date()), [periodo])
  const pg = usePagantes(source, since)
  const choices = pg.choices
  const fields = useMemo(() => (choices ? paganteFields(choices) : []), [choices])

  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    tela: TELA,
    columns: PAGANTE_COLUMNS,
    defaultSort: PAGANTE_SORT,
    fields,
    ready: Boolean(choices),
    builtins: () => (choices ? builtinViews(choices) : []),
    legacy: { keys: LEGACY_KEYS, read: (q) => fromLegacyFilters(pagantesQuery.ler(q), choices!) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters, choices!) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca, ficha aberta e Gerar Pagantes continuam na URL; os filtros vão em `f=` (useListView).
  const [query, setQuery] = useQueryTexto('q')
  const visible = useMemo(() => {
    if (!choices) return []
    const list = pg.list.filter((p) => matchesFilters(p, filters, fields, readPagante) && matchesKeyword(p, query, pg.contatos.get(p.pessoaId)))
    return sortPagantes(list, view.config.sort, choices)
  }, [pg.list, pg.contatos, filters, fields, query, choices, view.config.sort])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  const [selectedId, setSelectedId] = useQueryId('abrir')
  // A ficha pode vir do rateio (pagante fora da lista carregada): guarda a cópia dela para continuar aberta.
  const [selectedCopy, setSelectedCopy] = useState<Pagante | null>(null)
  const current = selectedId ? pg.list.find((p) => p.id === selectedId) ?? (selectedCopy?.id === selectedId ? selectedCopy : null) : null
  const setSelected = (p: Pagante | null) => { setSelectedCopy(p); setSelectedId(p?.id ?? null) }
  const [statusRequest, setStatusRequest] = useState<StatusRequest>(null)
  // O Gerar Pagantes aberto (por cima da tela) também vive na URL: `gerar=<id da OP>`.
  const [gerarOpId, setGerarOpId] = useQueryId('gerar')
  const frameUrl = gerarOpId ? source.gerarPagantesUrl(gerarOpId) : null
  const [version, setVersion] = useState(0)
  // Um pagante por vez com gravação ou recibo em andamento: evita duplo clique e envio duplicado.
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(() => { setVersion((v) => v + 1); void pg.reload() }, [pg.reload])
  // O gerador de recibo chama o refresh minutos depois: usa sempre o mais recente (período atual).
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pagantes" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pagantes', actions: headerActions })

  async function confirmStatus(enviarRecibo: boolean) {
    const request = statusRequest
    if (!request || busyId) return
    setStatusRequest(null)
    const { p, kind } = request
    const nome = p.pessoa || p.codigo
    const payload = statusPatch(kind, p, enviarRecibo)
    setBusyId(p.id)
    try {
      await pg.update(p.id, payload)
      // A ficha pode ter vindo do rateio (fora da lista filtrada): atualiza a cópia dela também.
      setSelectedCopy((s) => (s?.id === p.id ? { ...s, ...applyPatch(payload) } : s))
      setVersion((v) => v + 1)
      const recibo = payload.cr40f_statusdorecibo != null ? ' O recibo entra na fila de envio.' : ''
      toast({ tone: 'success', message: kind === 'pago' ? `${nome} marcado como pago.${recibo}` : `Pagante ${p.codigo} cancelado.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível atualizar ${nome}. Nada foi alterado. ${reasonText(reason)}` })
    } finally {
      setBusyId(null)
    }
  }

  async function gerarRecibo(p: Pagante) {
    if (busyId) return
    setBusyId(p.id)
    // A ficha é modal (top layer): o modal do gerador, no documento, ficaria atrás dela e inerte.
    setSelected(null)
    try {
      await source.gerarRecibo([p.id], () => refreshRef.current())
    } catch (reason) {
      toast({ tone: 'danger', message: reasonText(reason) })
    } finally {
      setBusyId(null)
    }
  }

  function abrirOp(p: Pagante) {
    const url = source.gerarPagantesUrl(p.opId)
    if (!url) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    setSelected(null)
    setGerarOpId(p.opId)
  }

  const closeFrame = useCallback((reload: boolean) => { setGerarOpId(null); if (reload) refresh() }, [refresh, setGerarOpId])

  let body
  if (pg.error && !pg.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar os pagantes" action={<Button variant="secondary" onClick={() => void pg.reload()}>Tentar de novo</Button>}>{pg.error}</Alert>
  } else if (!pg.choices) {
    body = <PagantesTable list={[]} choices={{ status: [], forma: [], recibo: [] }} contatos={pg.contatos} onOpen={() => undefined} loading />
  } else if (!pg.loading && !pg.list.length) {
    body = <EmptyState className="surface" align="start" icon={<WalletCards size={36} />} title="Nenhum pagante neste período">Os pagantes são criados no Gerar Pagantes, a partir de uma Ordem de Pagamento. Amplie o período para ver os mais antigos.</EmptyState>
  } else {
    const open = (id: string) => setSelected(visible.find((p) => p.id === id) ?? null)
    const footer = <span className="pg-num">{visible.length} {visible.length === 1 ? 'pagante' : 'pagantes'} · {formatMoney(total(visible))}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum pagante com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <PagantesCards list={slice} choices={pg.choices} contatos={pg.contatos} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <PagantesTable list={slice} choices={pg.choices} contatos={pg.contatos} onOpen={open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} total={visible.length} more onLoadMore={loadMore} noun={['pagante', 'pagantes']} touch={mobile} /> : null}
      </>
    )
  }

  return (
    <div className="page pg-page">
      <div role="toolbar" aria-label="Comandos de pagantes">
        <ViewBar view={view} columns={PAGANTE_COLUMNS} filters={choices ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por pagante, PAG, OP, telefone ou e-mail" aria-label="Buscar pagantes" />
          <Select className="pg-filters__select" aria-label="Período de criação" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={pg.loading && Boolean(choices)} onClick={refresh} />}
        </ViewBar>
      </div>
      {pg.error && pg.choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{pg.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {pg.contatosError && pg.choices ? <Alert tone="warning" title="Contatos não carregados">{pg.contatosError} Busca por telefone e WhatsApp ficam indisponíveis até atualizar.</Alert> : null}
      {body}
      {pg.choices ? (
        <PaganteDrawer p={current} onClose={() => setSelected(null)} onOpen={setSelected} choices={pg.choices} contatos={pg.contatos} source={source} version={version}
          onStatus={(p, kind) => setStatusRequest({ p, kind })} onRecibo={(p) => void gerarRecibo(p)} onAbrirOp={abrirOp} busyId={busyId} />
      ) : null}
      <StatusDialog request={statusRequest} contato={statusRequest ? pg.contatos.get(statusRequest.p.pessoaId) : undefined} onClose={() => setStatusRequest(null)} onConfirm={(enviar) => void confirmStatus(enviar)} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </div>
  )
}
