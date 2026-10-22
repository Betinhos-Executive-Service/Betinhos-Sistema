import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader, useToast } from '@betinhos/ui'
import { CircleCheck, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { hrefFor } from '../../nav/useHashRoute'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource as createPagantesSource } from '../pagantes/data/source'
import { createSource } from './data/source'
import { EMPTY_FILTERS, PERIODOS, VIEWS_KEY, loadViews, periodoStart, type Periodo } from './domain/filters'
import { PENDENCIA_COLUMNS, PENDENCIA_FIELDS, PENDENCIA_SORT, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, matchesKeyword, readPendencia, sortPendencias } from './domain/lista'
import { pendenciasQuery } from './domain/query'
import type { Pendencia } from './domain/types'
import { usePendencias } from './usePendencias'
import { PendenciasCards, PendenciasTable } from './components/PendenciasList'
import { PendenciaDrawer } from './components/PendenciaDrawer'
import { CorrigirDialog } from './components/CorrigirDialog'
import { FecharMesDialog } from './components/FecharMesDialog'
import '../pagantes/pagantes.css'
import './pendencias.css'

type Props = { host: Host }

export function PendenciasPage({ host }: Props) {
  return <ToastProvider><Pendencias host={host} /></ToastProvider>
}

const soma = (list: Pendencia[]) => list.reduce((acc, p) => acc + (p.valor ?? 0), 0)
const noop = () => undefined
const isPeriodo = (v: string): v is Periodo => PERIODOS.some((p) => p.value === v)

function Pendencias({ host }: Props) {
  const source = useMemo(() => createSource(host), [host])
  const pagantes = useMemo(() => createPagantesSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // O período decide o que carrega do Dataverse; fica na URL e fora da visão.
  const [periodoUrl, setPeriodo] = useQueryTexto('periodo', EMPTY_FILTERS.periodo)
  const periodo = isPeriodo(periodoUrl) ? periodoUrl : EMPTY_FILTERS.periodo
  const since = useMemo(() => periodoStart(periodo, new Date()), [periodo])
  const pend = usePendencias(source, since)

  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    defaultName: 'Todas as pendências',
    tela: TELA,
    columns: PENDENCIA_COLUMNS,
    defaultSort: PENDENCIA_SORT,
    fields: PENDENCIA_FIELDS,
    ready: true,
    builtins: builtinViews,
    legacy: { keys: ['tipos'], read: (q) => fromLegacyFilters(pendenciasQuery.ler(q)) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca, pendência aberta e Gerar Pagantes continuam na URL; os filtros vão em `f=` (useListView).
  const [query, setQuery] = useQueryTexto('q')
  const visible = useMemo(
    () => sortPendencias(pend.list.filter((p) => matchesFilters(p, filters, PENDENCIA_FIELDS, readPendencia) && matchesKeyword(p, query)), view.config.sort),
    [pend.list, filters, query, view.config.sort],
  )
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? pend.list.find((p) => p.id === selectedId) ?? null : null
  // O Gerar Pagantes aberto por cima da tela também vive na URL: `gerar=<id da OP>`.
  const [gerarOpId, setGerarOpId] = useQueryId('gerar')
  const [corrigir, setCorrigir] = useState<Pendencia | null>(null)
  const [fecharMes, setFecharMes] = useState<Pendencia | null>(null)
  const frameUrl = gerarOpId ? pagantes.gerarPagantesUrl(gerarOpId) : null

  const refresh = useCallback(() => { void pend.reload() }, [pend.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pendências" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pendências', actions: headerActions })

  const acoes = {
    onCorrigir: (p: Pendencia) => { setSelectedId(null); setCorrigir(p) },
    onAbrirOp: (opId: string) => { window.location.hash = hrefFor('ops', { abrir: opId }) },
    onVerServico: (reservaId: string) => { window.location.hash = hrefFor('geral', { abrir: reservaId }) },
    onRateio: (p: Pendencia) => { if (p.opId) abrirGerarPagantes(p.opId) },
    onFecharMes: (p: Pendencia) => { setSelectedId(null); setFecharMes(p) },
  }

  function abrirGerarPagantes(opId: string) {
    if (!pagantes.gerarPagantesUrl(opId)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    setSelectedId(null)
    setGerarOpId(opId)
  }

  const closeFrame = useCallback((reload: boolean) => { setGerarOpId(null); if (reload) refresh() }, [refresh, setGerarOpId])

  let body
  if (pend.error && !pend.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as pendências" action={<Button variant="secondary" onClick={() => void pend.reload()}>Tentar de novo</Button>}>{pend.error}</Alert>
  } else if (!pend.loaded || (pend.loading && !visible.length)) {
    body = <PendenciasTable list={[]} onOpen={noop} loading {...acoes} />
  } else if (!pend.loading && !pend.list.length) {
    body = <EmptyState className="surface" align="start" icon={<CircleCheck size={36} />} title="Nenhuma pendência neste período">OPs, pagantes e serviços estão alinhados. Amplie o período para conferir os mais antigos.</EmptyState>
  } else {
    const footer = <span className="pg-num">{visible.length} {visible.length === 1 ? 'pendência' : 'pendências'} · {formatMoney(soma(visible))}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma pendência com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <PendenciasCards list={slice} onOpen={setSelectedId} {...acoes} /> : <div className="surface">{empty}</div>)
          : <PendenciasTable list={slice} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} {...acoes} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page page--full pd-page">
      <div role="toolbar" aria-label="Comandos de pendências">
        <ViewBar view={view} columns={PENDENCIA_COLUMNS} filters={{ fields: PENDENCIA_FIELDS }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por OP, serviço ou cliente" aria-label="Buscar pendências" />
          <Select className="pg-filters__select" aria-label="Período do serviço" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={pend.loading && pend.loaded} onClick={refresh} />}
        </ViewBar>
      </div>
      {pend.error && pend.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{pend.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      <PendenciaDrawer pendencia={current} onClose={() => setSelectedId(null)} {...acoes} />
      <CorrigirDialog pendencia={corrigir} source={source} onClose={() => setCorrigir(null)}
        onApplied={(n) => { setCorrigir(null); toast({ tone: 'success', message: n === 1 ? '1 alteração aplicada.' : `${n} alterações aplicadas.` }); refresh() }} />
      <FecharMesDialog pendencia={fecharMes} source={source} onClose={() => setFecharMes(null)}
        onDone={(r) => { setFecharMes(null); toast({ tone: 'success', message: `OP criada com ${r.reservas} serviço(s).` }); refresh(); abrirGerarPagantes(r.opId) }} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </div>
  )
}
