import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { FileStack, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame, SaveViewDialog } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterOps, loadViews, matchView, newView, periodoStart, saveViews, total, viewFilters, type Filters, type View } from './domain/filters'
import type { Op } from './domain/types'
import { useOps } from './useOps'
import { OpsToolbar } from './components/OpsToolbar'
import { OpsCards, OpsTable } from './components/OpsList'
import { OpDrawer } from './components/OpDrawer'
import { CancelDialog } from './components/CancelDialog'
import '../pagantes/pagantes.css'
import './ops.css'

export function OpsPage({ host }: { host: Host }) {
  return <ToastProvider><Ops host={host} /></ToastProvider>
}

const PAGE_SIZE = 50
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Ops({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // Visões: as prontas + as do usuário; a última usada volta ao abrir a tela.
  const [stored, setStored] = useState(() => loadViews(source.kv))
  const views = useMemo(() => [...BUILTIN_VIEWS, ...stored.views], [stored.views])
  const [filters, setFiltersState] = useState<Filters>(() => {
    const last = views.find((v) => v.id === stored.last)
    return last ? viewFilters(last) : { ...EMPTY_FILTERS }
  })
  const activeView = useMemo(() => matchView(views, filters, stored.last), [views, filters, stored.last])
  const [page, setPage] = useState(1)
  const setFilters = useCallback((next: Filters, viewId?: string) => {
    setFiltersState(next)
    setStored((s) => {
      const last = viewId ?? matchView([...BUILTIN_VIEWS, ...s.views], next, s.last)?.id ?? null
      if (last === s.last) return s
      const data = { ...s, last }
      saveViews(source.kv, data)
      return data
    })
    setPage(1)
  }, [source.kv])

  const since = useMemo(() => periodoStart(filters.periodo, new Date()), [filters.periodo])
  const ops = useOps(source, since)
  const visible = useMemo(() => filterOps(ops.list, filters), [ops.list, filters])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const current = selectedId ? ops.list.find((op) => op.id === selectedId) ?? null : null
  const [cancelRequest, setCancelRequest] = useState<Op | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => { setVersion((v) => v + 1); void ops.reload() }, [ops.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar ordens de pagamento" onClick={refresh} />, [refresh])
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
    setFrameUrl(url)
  }

  const closeFrame = useCallback((reload: boolean) => { setFrameUrl(null); if (reload) refresh() }, [refresh])

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
  if (ops.error && !ops.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as ordens de pagamento" action={<Button variant="secondary" onClick={() => void ops.reload()}>Tentar de novo</Button>}>{ops.error}</Alert>
  } else if (!ops.choices) {
    body = <OpsTable list={[]} choices={{ status: [], idioma: [] }} onOpen={() => undefined} loading />
  } else if (!ops.loading && !ops.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileStack size={36} />} title="Nenhuma OP neste período">As OPs nascem pelo botão Gerar OP nas reservas. Amplie o período para ver as mais antigas.</EmptyState>
  } else if (!ops.loading && !visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhuma OP encontrada para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    body = (
      <>
        {mobile
          ? <OpsCards list={slice} choices={ops.choices} onOpen={setSelectedId} />
          : <OpsTable list={slice} choices={ops.choices} onOpen={setSelectedId} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="OPs" /> : null}
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Financeiro"
      title="Ordens de Pagamento"
      meta={<span className="pg-meta">{ops.choices ? <span className="pg-num">{visible.length} {visible.length === 1 ? 'OP' : 'OPs'} · {formatMoney(total(visible))}</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Cobranças agrupadas por OP: acompanhe o rateio, o recebido e os serviços de cada uma."
      actions={mobile ? undefined : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={ops.loading && Boolean(ops.choices)} onClick={refresh}>Atualizar</Button>}
      toolbar={ops.choices ? <OpsToolbar filters={filters} onChange={setFilters} choices={ops.choices} views={views} activeView={activeView} onSaveView={() => setSaving(true)} onDeleteView={deleteView} /> : undefined}
    >
      {ops.error && ops.choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ops.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {ops.choices ? (
        <OpDrawer op={current} onClose={() => setSelectedId(null)} choices={ops.choices} source={source} version={version}
          busy={current != null && busyId === current.id} onCancel={setCancelRequest} onGerarPagantes={gerarPagantes} />
      ) : null}
      <CancelDialog op={cancelRequest} onClose={() => setCancelRequest(null)} onConfirm={(op) => void confirmCancel(op)} />
      <SaveViewDialog open={saving} onClose={() => setSaving(false)} onSave={saveView} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </PageLayout>
  )
}
