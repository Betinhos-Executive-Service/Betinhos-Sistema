import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { RefreshCw, SearchX, WalletCards } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterPagantes, loadViews, matchView, newView, periodoStart, saveViews, total, viewFilters, type Filters, type View } from './domain/filters'
import { formatMoney } from './domain/messages'
import { applyPatch, statusPatch } from './domain/status'
import type { Pagante } from './domain/types'
import { usePagantes } from './usePagantes'
import { PagantesToolbar } from './components/PagantesToolbar'
import { PagantesCards, PagantesTable } from './components/PagantesList'
import { PaganteDrawer } from './components/PaganteDrawer'
import { GerarPagantesFrame, SaveViewDialog, StatusDialog, type StatusRequest } from './components/Dialogs'
import './pagantes.css'

export function PagantesPage({ host }: { host: Host }) {
  return <ToastProvider><Pagantes host={host} /></ToastProvider>
}

const PAGE_SIZE = 50
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Pagantes({ host }: { host: Host }) {
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
  // A visão escolhida desempata quando outra tem os mesmos filtros.
  const activeView = useMemo(() => matchView(views, filters, stored.last), [views, filters, stored.last])
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
  const [page, setPage] = useState(1)

  const since = useMemo(() => periodoStart(filters.periodo, new Date()), [filters.periodo])
  const pg = usePagantes(source, since)
  const visible = useMemo(() => filterPagantes(pg.list, filters, pg.contatos), [pg.list, filters, pg.contatos])

  const [selected, setSelected] = useState<Pagante | null>(null)
  const current = selected ? pg.list.find((p) => p.id === selected.id) ?? selected : null
  const [statusRequest, setStatusRequest] = useState<StatusRequest>(null)
  const [saving, setSaving] = useState(false)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
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
      setSelected((s) => (s?.id === p.id ? { ...s, ...applyPatch(payload) } : s))
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
    setFrameUrl(url)
  }

  const closeFrame = useCallback((reload: boolean) => { setFrameUrl(null); if (reload) refresh() }, [refresh])

  function saveView(nome: string) {
    const same = matchView(views, filters)
    if (same) {
      setSaving(false)
      toast({ tone: 'info', message: `Esses filtros já estão na visão “${same.nome}”.` })
      return
    }
    const view = newView(nome, filters)
    setStored((s) => { const data = { views: [...s.views, view], last: view.id }; saveViews(source.kv, data); return data })
    setSaving(false)
    toast({ tone: 'success', message: `Visão “${view.nome}” salva.` })
  }

  function deleteView(view: View) {
    setStored((s) => { const data = { views: s.views.filter((v) => v.id !== view.id), last: s.last === view.id ? null : s.last }; saveViews(source.kv, data); return data })
    toast({ tone: 'success', message: `Visão “${view.nome}” excluída.` })
  }

  let body
  if (pg.error && !pg.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar os pagantes" action={<Button variant="secondary" onClick={() => void pg.reload()}>Tentar de novo</Button>}>{pg.error}</Alert>
  } else if (!pg.choices) {
    body = <PagantesTable list={[]} choices={{ status: [], forma: [], recibo: [] }} contatos={pg.contatos} onOpen={() => undefined} loading />
  } else if (!pg.loading && !pg.list.length) {
    body = <EmptyState className="surface" align="start" icon={<WalletCards size={36} />} title="Nenhum pagante neste período">Os pagantes são criados no Gerar Pagantes, a partir de uma Ordem de Pagamento. Amplie o período para ver os mais antigos.</EmptyState>
  } else if (!pg.loading && !visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum pagante encontrado para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    // Paginado: com "Todo o período" a lista pode ter milhares de linhas, cada uma com ações.
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const open = (id: string) => setSelected(visible.find((p) => p.id === id) ?? null)
    body = (
      <>
        {mobile
          ? <PagantesCards list={slice} choices={pg.choices} contatos={pg.contatos} onOpen={open} />
          : <PagantesTable list={slice} choices={pg.choices} contatos={pg.contatos} onOpen={open} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="pagantes" /> : null}
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Financeiro"
      title="Pagantes"
      meta={<span className="pg-meta">{pg.choices ? <span className="pg-num">{visible.length} pagantes · {formatMoney(total(visible))}</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Cobranças de cada Ordem de Pagamento: acompanhe, envie o link e confirme o recebimento."
      actions={mobile ? undefined : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={pg.loading && Boolean(pg.choices)} onClick={refresh}>Atualizar</Button>}
      toolbar={pg.choices ? <PagantesToolbar filters={filters} onChange={setFilters} choices={pg.choices} views={views} activeView={activeView} onSaveView={() => setSaving(true)} onDeleteView={deleteView} /> : undefined}
    >
      {pg.error && pg.choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{pg.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {pg.contatosError && pg.choices ? <Alert tone="warning" title="Contatos não carregados">{pg.contatosError} Busca por telefone e WhatsApp ficam indisponíveis até atualizar.</Alert> : null}
      {body}
      {pg.choices ? (
        <PaganteDrawer p={current} onClose={() => setSelected(null)} onOpen={setSelected} choices={pg.choices} contatos={pg.contatos} source={source} version={version}
          onStatus={(p, kind) => setStatusRequest({ p, kind })} onRecibo={(p) => void gerarRecibo(p)} onAbrirOp={abrirOp} busyId={busyId} />
      ) : null}
      <StatusDialog request={statusRequest} contato={statusRequest ? pg.contatos.get(statusRequest.p.pessoaId) : undefined} onClose={() => setStatusRequest(null)} onConfirm={(enviar) => void confirmStatus(enviar)} />
      <SaveViewDialog open={saving} onClose={() => setSaving(false)} onSave={saveView} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </PageLayout>
  )
}
