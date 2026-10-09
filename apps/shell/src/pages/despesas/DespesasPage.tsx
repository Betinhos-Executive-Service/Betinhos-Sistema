import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Grid, MetricCard, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Clock, Copy, Paperclip, ReceiptText, RefreshCw, SearchX, Wallet } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryBandeira, useQueryFilters, useQueryId, useQueryPagina } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { SaveViewDialog } from '../pagantes/components/Dialogs'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { BUILTIN_VIEWS, EMPTY_FILTERS, filterDespesas, loadViews, matchView, newView, opcoes, periodoStart, saveViews, viewFilters, type Filters, type View } from './domain/filters'
import { despesasQuery } from './domain/query'
import { resumo } from './domain/resumo'
import { useDespesas } from './useDespesas'
import { DespesasToolbar } from './components/DespesasToolbar'
import { DespesasCards, DespesasTable } from './components/DespesasList'
import { DespesaDrawer } from './components/DespesaDrawer'
import '../pagantes/pagantes.css'
import './despesas.css'

export function DespesasPage({ host }: { host: Host }) {
  return <ToastProvider><Despesas host={host} /></ToastProvider>
}

const PAGE_SIZE = 50
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function Despesas({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // Visões: as prontas + as do usuário; a última usada volta ao abrir a tela.
  const [stored, setStored] = useState(() => loadViews(source.kv))
  const views = useMemo(() => [...BUILTIN_VIEWS, ...stored.views], [stored.views])
  // Filtros, página e despesa aberta vivem na URL (#/despesas?q=…&periodo=…&pagina=2&abrir=…); sem filtro na abertura, entra a última visão.
  const [filters, setFiltersUrl] = useQueryFilters(despesasQuery, () => {
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
  const despesas = useDespesas(source, since)
  const visible = useMemo(() => filterDespesas(despesas.list, filters), [despesas.list, filters])
  const totais = useMemo(() => resumo(visible), [visible])
  const { categorias, motoristas } = useMemo(() => opcoes(despesas.list), [despesas.list])

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? despesas.list.find((d) => d.id === selectedId) ?? null : null
  const [saving, setSaving] = useQueryBandeira('salvarvisao')
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => { setVersion((v) => v + 1); void despesas.reload() }, [despesas.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar despesas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Despesas operacionais', actions: headerActions })

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

  const loadingFirst = !despesas.choices
  let body
  if (despesas.error && !despesas.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as despesas" action={<Button variant="secondary" onClick={() => void despesas.reload()}>Tentar de novo</Button>}>{despesas.error}</Alert>
  } else if (loadingFirst) {
    body = <DespesasTable list={[]} choices={{ operacional: [], financeiro: [], anexo: [], origem: [], anexoTipo: [], anexoStatus: [] }} onOpen={() => undefined} loading />
  } else if (!despesas.loading && !despesas.list.length) {
    body = <EmptyState className="surface" align="start" icon={<ReceiptText size={36} />} title="Nenhuma despesa neste período">As despesas são lançadas pelos motoristas no App Motoristas. Amplie o período para ver as mais antigas.</EmptyState>
  } else if (!despesas.loading && !visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhuma despesa encontrada para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    body = (
      <>
        {mobile
          ? <DespesasCards list={slice} choices={despesas.choices!} onOpen={setSelectedId} />
          : <DespesasTable list={slice} choices={despesas.choices!} onOpen={setSelectedId} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="despesas" /> : null}
      </>
    )
  }

  const kpis = despesas.error && !despesas.choices ? undefined : (
    <Grid min={190}>
      <MetricCard icon={<Wallet size={20} />} label="Total filtrado" value={formatMoney(totais.total)} hint={plural(totais.qtd, 'lançamento', 'lançamentos')} loading={loadingFirst} />
      <MetricCard icon={<Clock size={20} />} tone="warning" label="Aguardando pagamento" value={formatMoney(totais.aguardandoValor)} hint={plural(totais.aguardandoQtd, 'despesa', 'despesas')} loading={loadingFirst} />
      <MetricCard icon={<Paperclip size={20} />} tone="warning" label="Sem comprovante" value={totais.semComprovante} hint="sem anexo completo" loading={loadingFirst} />
      <MetricCard icon={<Copy size={20} />} tone="danger" label="Possível duplicidade" value={totais.duplicidade} hint="conferir antes de pagar" loading={loadingFirst} />
    </Grid>
  )

  return (
    <PageLayout
      className="dp-page"
      eyebrow="Operação"
      title="Despesas operacionais"
      meta={<span className="pg-meta">{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Gastos lançados pelos motoristas no App Motoristas, com comprovantes e situação de pagamento. Somente consulta."
      actions={mobile ? undefined : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={despesas.loading && !loadingFirst} onClick={refresh}>Atualizar</Button>}
      tabs={kpis}
      toolbar={despesas.choices ? <DespesasToolbar filters={filters} onChange={setFilters} choices={despesas.choices} categorias={categorias} motoristas={motoristas} views={views} activeView={activeView} onSaveView={() => setSaving(true)} onDeleteView={deleteView} /> : undefined}
    >
      {despesas.error && despesas.choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{despesas.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {despesas.choices ? <DespesaDrawer despesa={current} onClose={() => setSelectedId(null)} choices={despesas.choices} source={source} version={version} /> : null}
      <SaveViewDialog open={saving} onClose={() => setSaving(false)} onSave={saveView} />
    </PageLayout>
  )
}
