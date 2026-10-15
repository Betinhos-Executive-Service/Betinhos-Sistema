import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { CalendarCheck, FileStack, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryBandeira, useQueryFilters, useQueryId, useQueryPagina } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame, SaveViewDialog } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterOps, loadViews, matchView, newView, periodoStart, saveViews, total, viewFilters, type Filters, type View } from './domain/filters'
import { opsQuery } from './domain/query'
import type { Op } from './domain/types'
import { useOps } from './useOps'
import { OpsToolbar } from './components/OpsToolbar'
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

const PAGE_SIZE = 50
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Ops({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // Visões: as prontas + as do usuário; a última usada volta ao abrir a tela.
  const [stored, setStored] = useState(() => loadViews(source.kv))
  const views = useMemo(() => [...BUILTIN_VIEWS, ...stored.views], [stored.views])
  // Filtros, página e OP aberta vivem na URL (#/ops?q=…&status=…&pagina=2&abrir=…); sem filtro na abertura, entra a última visão.
  const [filters, setFiltersUrl] = useQueryFilters(opsQuery, () => {
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
  const ops = useOps(source, since)
  const visible = useMemo(() => filterOps(ops.list, filters), [ops.list, filters])

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? ops.list.find((op) => op.id === selectedId) ?? null : null
  const [cancelRequest, setCancelRequest] = useState<Op | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useQueryBandeira('salvarvisao')
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
      actions={mobile ? undefined : <>
        <Button variant="secondary" icon={<RefreshCw size={16} />} loading={ops.loading && Boolean(ops.choices)} onClick={refresh}>Atualizar</Button>
        <Button icon={<CalendarCheck size={16} />} onClick={abrirFechar}>Fechar mês</Button>
      </>}
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
    </PageLayout>
  )
}
