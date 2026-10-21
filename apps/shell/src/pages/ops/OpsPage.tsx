import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, useShellHeader, useToast } from '@betinhos/ui'
import { CalendarCheck, FileStack, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { listCache } from '../../app/listCache'
import { keywordIndex, searchWords, useDebouncedText, useMergedById, useServerSearch } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { EMPTY_FILTERS, PERIODOS, VIEWS_KEY, loadViews, periodoStart, total, type Periodo } from './domain/filters'
import { OP_COLUMNS, OP_SORT, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, opFields, opKeywordText, readOp, sortOps } from './domain/lista'
import { opsQuery } from './domain/query'
import type { Op } from './domain/types'
import { useOps } from './useOps'
import { OpsCards, OpsTable } from './components/OpsList'
import { OpDrawer } from './components/OpDrawer'
import { CancelDialog } from './components/CancelDialog'
import { FecharMesDialog } from '../pendencias/components/FecharMesDialog'
import { createSource as createPendenciasSource } from '../pendencias/data/source'
import { detectarPendencias } from '../pendencias/domain/detect'
import type { Pendencia } from '../pendencias/domain/types'
import '../pagantes/pagantes.css'
import '../pendencias/pendencias.css'
import './ops.css'

export function OpsPage({ host }: { host: Host }) {
  return <ToastProvider><Ops host={host} /></ToastProvider>
}

const isPeriodo = (v: string): v is Periodo => PERIODOS.some((p) => p.value === v)
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Ops({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // O período decide o que carrega do Dataverse; fica na URL e fora da visão.
  const [periodoUrl, setPeriodo] = useQueryTexto('periodo', EMPTY_FILTERS.periodo)
  const periodo = isPeriodo(periodoUrl) ? periodoUrl : EMPTY_FILTERS.periodo
  const since = useMemo(() => periodoStart(periodo, new Date()), [periodo])
  const ops = useOps(source, since, listCache(host))
  const choices = ops.choices
  const fields = useMemo(() => (choices ? opFields(choices) : []), [choices])

  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    defaultName: 'Todas as OPs',
    tela: TELA,
    columns: OP_COLUMNS,
    defaultSort: OP_SORT,
    fields,
    ready: Boolean(choices),
    builtins: () => (choices ? builtinViews(choices) : []),
    legacy: { keys: ['status'], read: (q) => fromLegacyFilters(opsQuery.ler(q), choices!) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters, choices!) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca, OP aberta e Gerar Pagantes continuam na URL; os filtros vão em `f=` (useListView). A lista filtra 200 ms
  // depois da última tecla; enquanto o período não chegou inteiro, a busca também vai ao servidor.
  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const searchOps = useCallback((text: string) => source.search(since, text), [source, since])
  const found = useServerSearch({ query: q, enabled: Boolean(choices) && !ops.complete, search: searchOps })
  const list = useMergedById(ops.list, found)
  // Ordena e filtra uma vez por lista/visão; a cada busca só confere o texto já normalizado de cada linha.
  const sorted = useMemo(() => (choices ? sortOps(list, view.config.sort, choices) : list), [list, choices, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, filters, fields, readOp), [sorted, filters, fields])
  const index = useMemo(() => keywordIndex<Op>(opKeywordText), [])
  const visible = useMemo(() => {
    if (!choices) return []
    const words = searchWords(q)
    return words.length ? filtered.filter((op) => index.matches(op, words)) : filtered
  }, [filtered, index, q, choices])
  // Rolagem infinita: trocar filtro, busca ou ordenação volta ao primeiro lote; a lista crescer (carga em segundo
  // plano) ou recarregar não. A chave é texto para não mudar quando só a identidade dos filtros muda.
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? list.find((op) => op.id === selectedId) ?? null : null
  const [cancelRequest, setCancelRequest] = useState<Op | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // O Gerar Pagantes aberto (por cima da tela) também vive na URL: `gerar=<id da OP>`.
  const [gerarOpId, setGerarOpId] = useQueryId('gerar')
  const frameUrl = gerarOpId ? source.pagantes.gerarPagantesUrl(gerarOpId) : null
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => { setVersion((v) => v + 1); void ops.reload() }, [ops.reload])
  // Fechar mês: as opções são as pendências tipo 4 (cliente + mês com serviços mensais sem OP) dos últimos 12 meses.
  const pendSource = useMemo(() => createPendenciasSource(host), [host])
  const [fechar, setFechar] = useState<{ open: boolean; opcoes: Pendencia[] | null; erro: string | null }>({ open: false, opcoes: null, erro: null })
  useEffect(() => {
    if (!fechar.open) return
    let cancelled = false
    pendSource.load(periodoStart('365', new Date()))
      .then((d) => { if (!cancelled) setFechar((s) => ({ ...s, opcoes: detectarPendencias(d.ops, d.reservas, d.pagantes).filter((p) => p.tipo === 'mensal-sem-op') })) })
      .catch((reason) => { if (!cancelled) setFechar((s) => ({ ...s, erro: reasonText(reason) })) })
    return () => { cancelled = true }
  }, [fechar.open, pendSource])
  const abrirFechar = useCallback(() => setFechar({ open: true, opcoes: null, erro: null }), [])
  const headerActions = useMemo(() => <>
    <Button icon={<CalendarCheck size={18} />} aria-label="Fechar mês" onClick={abrirFechar} />
    <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar ordens de pagamento" onClick={refresh} />
  </>, [refresh, abrirFechar])
  useShellHeader({ title: 'Ordens de Pagamento', actions: headerActions })

  async function confirmCancel(op: Op) {
    if (busyId) return
    setCancelRequest(null)
    setBusyId(op.id)
    try {
      await ops.cancel(op.id)
      setVersion((v) => v + 1)
      toast({ tone: 'success', message: `${op.codigo || 'OP'} cancelada.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cancelar a ${op.codigo || 'OP'}. Nada foi alterado. ${reasonText(reason)}` })
    } finally {
      setBusyId(null)
    }
  }

  function gerarPagantes(op: Op) {
    const url = source.pagantes.gerarPagantesUrl(op.id)
    if (!url) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    setSelectedId(null)
    setGerarOpId(op.id)
  }

  const closeFrame = useCallback((reload: boolean) => { setGerarOpId(null); if (reload) refresh() }, [refresh, setGerarOpId])

  let body
  if (ops.error && !ops.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as ordens de pagamento" action={<Button variant="secondary" onClick={() => void ops.reload()}>Tentar de novo</Button>}>{ops.error}</Alert>
  } else if (!ops.choices) {
    body = <OpsTable list={[]} choices={{ status: [], idioma: [] }} onOpen={() => undefined} loading />
  } else if (ops.complete && !ops.loading && !ops.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileStack size={36} />} title="Nenhuma OP neste período">As OPs nascem pelo botão Gerar OP nas reservas. Amplie o período para ver as mais antigas.</EmptyState>
  } else {
    // O total só vale com o período inteiro e os valores dos serviços: até lá, o rodapé avisa que ainda soma.
    const pending = !ops.complete && ops.loading
    const footer = <span className="pg-num">{visible.length} {visible.length === 1 ? 'OP' : 'OPs'} · {pending ? 'somando valores…' : formatMoney(total(visible))}</span>
    const empty = pending
      ? <EmptyState align="start" icon={<SearchX size={36} />} title="Procurando no restante do período…" />
      : <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma OP com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <OpsCards list={slice} choices={ops.choices} onOpen={setSelectedId} /> : <div className="surface">{empty}</div>)
          : <OpsTable list={slice} choices={ops.choices} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} pending={pending} />
      </>
    )
  }

  return (
    <div className="page page--full op-page">
      <div role="toolbar" aria-label="Comandos de ordens de pagamento">
        <ViewBar view={view} columns={OP_COLUMNS} filters={choices ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por OP, cliente, passageiro ou trajeto" aria-label="Buscar ordens de pagamento" />
          <Select className="pg-filters__select" aria-label="Período de criação" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={ops.loading && Boolean(choices)} onClick={refresh} />}
          {mobile ? null : <Button icon={<CalendarCheck size={16} />} onClick={abrirFechar}>Fechar mês</Button>}
        </ViewBar>
      </div>
      {ops.error && ops.choices ? (
        <Alert tone="danger" title={ops.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>
          {ops.error} {ops.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só as OPs que chegaram; busca, filtros e total valem para elas.'}
        </Alert>
      ) : null}
      {body}
      {ops.choices ? (
        <OpDrawer op={current} onClose={() => setSelectedId(null)} choices={ops.choices} source={source} version={version}
          busy={current != null && busyId === current.id} onCancel={setCancelRequest} onGerarPagantes={gerarPagantes} />
      ) : null}
      <CancelDialog op={cancelRequest} onClose={() => setCancelRequest(null)} onConfirm={(op) => void confirmCancel(op)} />
      <FecharMesDialog escolha={fechar} source={pendSource} onClose={() => setFechar({ open: false, opcoes: null, erro: null })}
        onDone={(r) => {
          setFechar({ open: false, opcoes: null, erro: null })
          toast({ tone: 'success', message: `OP criada com ${r.reservas} serviço(s).` })
          // No mock a OP nova não aparece na lista de OPs: os sources de OPs e de Pendências são separados.
          refresh()
          if (!source.pagantes.gerarPagantesUrl(r.opId)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
          setSelectedId(null)
          setGerarOpId(r.opId)
        }} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </div>
  )
}
