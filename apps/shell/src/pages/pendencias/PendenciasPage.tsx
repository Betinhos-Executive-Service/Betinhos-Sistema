import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { CircleCheck, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor } from '../../nav/useHashRoute'
import { useQueryBandeira, useQueryFilters, useQueryId, useQueryPagina } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame, SaveViewDialog } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource as createPagantesSource } from '../pagantes/data/source'
import { createSource } from './data/source'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterPendencias, loadViews, matchView, newView, periodoStart, saveViews, viewFilters, type Filters, type View } from './domain/filters'
import { pendenciasQuery } from './domain/query'
import type { Pendencia } from './domain/types'
import { usePendencias } from './usePendencias'
import { PendenciasToolbar } from './components/PendenciasToolbar'
import { PendenciasCards, PendenciasTable } from './components/PendenciasList'
import { PendenciaDrawer } from './components/PendenciaDrawer'
import '../pagantes/pagantes.css'
import './pendencias.css'

type Props = { host: Host; onCorrigir?: (p: Pendencia) => void }

export function PendenciasPage({ host, onCorrigir }: Props) {
  return <ToastProvider><Pendencias host={host} onCorrigir={onCorrigir} /></ToastProvider>
}

const PAGE_SIZE = 50
const soma = (list: Pendencia[]) => list.reduce((acc, p) => acc + (p.valor ?? 0), 0)
const noop = () => undefined

function Pendencias({ host, onCorrigir = noop }: Props) {
  const source = useMemo(() => createSource(host), [host])
  const pagantes = useMemo(() => createPagantesSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // Visões: as prontas + as do usuário; a última usada volta ao abrir a tela.
  const [stored, setStored] = useState(() => loadViews(source.kv))
  const views = useMemo(() => [...BUILTIN_VIEWS, ...stored.views], [stored.views])
  // Filtros, página e pendência aberta vivem na URL (#/pendencias?q=…&tipos=…&abrir=…).
  const [filters, setFiltersUrl] = useQueryFilters(pendenciasQuery, () => {
    const last = views.find((v) => v.id === stored.last)
    return last ? viewFilters(last) : { ...EMPTY_FILTERS }
  })
  const activeView = useMemo(() => matchView(views, filters, stored.last), [views, filters, stored.last])
  const [page, setPage] = useQueryPagina()
  const setFilters = useCallback((next: Filters, viewId?: string) => {
    setFiltersUrl(next)
    setStored((s) => {
      const last = viewId ?? matchView([...BUILTIN_VIEWS, ...s.views], next, s.last)?.id ?? null
      if (last === s.last) return s
      const data = { ...s, last }
      saveViews(source.kv, data)
      return data
    })
  }, [source.kv, setFiltersUrl])

  const since = useMemo(() => periodoStart(filters.periodo, new Date()), [filters.periodo])
  const pend = usePendencias(source, since)
  const visible = useMemo(() => filterPendencias(pend.list, filters), [pend.list, filters])

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? pend.list.find((p) => p.id === selectedId) ?? null : null
  const [saving, setSaving] = useQueryBandeira('salvarvisao')
  // O Gerar Pagantes aberto por cima da tela também vive na URL: `gerar=<id da OP>`.
  const [gerarOpId, setGerarOpId] = useQueryId('gerar')
  const frameUrl = gerarOpId ? pagantes.gerarPagantesUrl(gerarOpId) : null

  const refresh = useCallback(() => { void pend.reload() }, [pend.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pendências" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pendências', actions: headerActions })

  const acoes = {
    onCorrigir,
    onAbrirOp: (opId: string) => { window.location.hash = hrefFor('ops', { abrir: opId }) },
    onVerServico: (reservaId: string) => { window.location.hash = hrefFor('geral', { abrir: reservaId }) },
    onRateio: (p: Pendencia) => {
      if (!p.opId) return
      if (!pagantes.gerarPagantesUrl(p.opId)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
      setSelectedId(null)
      setGerarOpId(p.opId)
    },
  }

  const closeFrame = useCallback((reload: boolean) => { setGerarOpId(null); if (reload) refresh() }, [refresh, setGerarOpId])

  function saveView(nome: string) {
    const same = matchView(views, filters)
    setSaving(false)
    if (same) { toast({ tone: 'info', message: `Esses filtros já estão na visão “${same.nome}”.` }); return }
    const view = newView(nome, filters)
    setStored((s) => { const data = { views: [...s.views, view], last: view.id }; saveViews(source.kv, data); return data })
    toast({ tone: 'success', message: `Visão “${view.nome}” salva.` })
  }

  function deleteView(view: View) {
    setStored((s) => { const data = { views: s.views.filter((v) => v.id !== view.id), last: s.last === view.id ? null : s.last }; saveViews(source.kv, data); return data })
    toast({ tone: 'success', message: `Visão “${view.nome}” excluída.` })
  }

  let body
  if (pend.error && !pend.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as pendências" action={<Button variant="secondary" onClick={() => void pend.reload()}>Tentar de novo</Button>}>{pend.error}</Alert>
  } else if (!pend.loaded) {
    body = <PendenciasTable list={[]} onOpen={noop} loading {...acoes} />
  } else if (!pend.loading && !pend.list.length) {
    body = <EmptyState className="surface" align="start" icon={<CircleCheck size={36} />} title="Nenhuma pendência neste período">OPs, pagantes e serviços estão alinhados. Amplie o período para conferir os mais antigos.</EmptyState>
  } else if (!pend.loading && !visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhuma pendência encontrada para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    body = (
      <>
        {mobile
          ? <PendenciasCards list={slice} onOpen={setSelectedId} {...acoes} />
          : <PendenciasTable list={slice} onOpen={setSelectedId} {...acoes} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="pendências" /> : null}
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Financeiro"
      title="Pendências"
      meta={<span className="pg-meta">{pend.loaded ? <span className="pg-num">{visible.length} {visible.length === 1 ? 'pendência' : 'pendências'} · {formatMoney(soma(visible))}</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Divergências entre OPs, pagantes e serviços: corrija, abra a OP ou refaça o rateio."
      actions={mobile ? undefined : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={pend.loading && pend.loaded} onClick={refresh}>Atualizar</Button>}
      toolbar={pend.loaded ? <PendenciasToolbar filters={filters} onChange={setFilters} views={views} activeView={activeView} onSaveView={() => setSaving(true)} onDeleteView={deleteView} /> : undefined}
    >
      {pend.error && pend.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{pend.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      <PendenciaDrawer pendencia={current} onClose={() => setSelectedId(null)} {...acoes} />
      <SaveViewDialog open={saving} onClose={() => setSaving(false)} onSave={saveView} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </PageLayout>
  )
}
