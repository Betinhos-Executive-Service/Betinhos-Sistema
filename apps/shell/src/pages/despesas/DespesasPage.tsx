import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Grid, MetricCard, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader, useToast } from '@betinhos/ui'
import { Clock, Copy, Paperclip, ReceiptText, RefreshCw, SearchX, Wallet } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { EMPTY_FILTERS, PERIODOS, VIEWS_KEY, loadViews, opcoes, periodoStart, type Periodo } from './domain/filters'
import { DESPESA_COLUMNS, TELA, builtinViews, despesaFields, fromLegacyFilters, legacyViewConfig, matchesKeyword, readDespesa, sortDespesas } from './domain/lista'
import { despesasQuery } from './domain/query'
import { resumo } from './domain/resumo'
import { useDespesas } from './useDespesas'
import { DespesasCards, DespesasTable } from './components/DespesasList'
import { DespesaDrawer } from './components/DespesaDrawer'
import '../pagantes/pagantes.css'
import './despesas.css'

export function DespesasPage({ host }: { host: Host }) {
  return <ToastProvider><Despesas host={host} /></ToastProvider>
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. `q` e `periodo` continuam. */
const LEGACY_KEYS = ['operacional', 'financeiro', 'categoria', 'motorista', 'alertas'] as const
const isPeriodo = (v: string): v is Periodo => PERIODOS.some((p) => p.value === v)

function Despesas({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  // O período decide o que carrega do Dataverse; fica na URL e fora da visão.
  const [periodoUrl, setPeriodo] = useQueryTexto('periodo', EMPTY_FILTERS.periodo)
  const periodo = isPeriodo(periodoUrl) ? periodoUrl : EMPTY_FILTERS.periodo
  const since = useMemo(() => periodoStart(periodo, new Date()), [periodo])
  const despesas = useDespesas(source, since)
  const choices = despesas.choices
  const op = useMemo(() => opcoes(despesas.list), [despesas.list])
  const fields = useMemo(() => (choices ? despesaFields(choices, op) : []), [choices, op])

  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    tela: TELA,
    columns: DESPESA_COLUMNS,
    defaultSort: { key: 'data', dir: 'desc' },
    fields,
    ready: Boolean(choices),
    builtins: () => (choices ? builtinViews(choices) : []),
    legacy: { keys: LEGACY_KEYS, read: (q) => fromLegacyFilters(despesasQuery.ler(q), choices!, op) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters, choices!, op) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca e despesa aberta continuam na URL; os filtros vão em `f=` (useListView).
  const [query, setQuery] = useQueryTexto('q')
  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? despesas.list.find((d) => d.id === selectedId) ?? null : null
  const [version, setVersion] = useState(0)

  const visible = useMemo(() => {
    if (!choices) return []
    const list = despesas.list.filter((d) => matchesFilters(d, filters, fields, readDespesa) && matchesKeyword(d, query))
    const sort = view.config.sort
    return sort ? sortDespesas(list, sort.key, sort.dir, choices) : list
  }, [despesas.list, filters, fields, query, choices, view.config.sort])
  const totais = useMemo(() => resumo(visible), [visible])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)

  const refresh = useCallback(() => { setVersion((v) => v + 1); void despesas.reload() }, [despesas.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar despesas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Despesas operacionais', actions: headerActions })
  const clearAll = () => { clearFilters(); setQuery('') }

  const loadingFirst = !choices
  let body
  if (despesas.error && !choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as despesas" action={<Button variant="secondary" onClick={() => void despesas.reload()}>Tentar de novo</Button>}>{despesas.error}</Alert>
  } else if (loadingFirst) {
    body = <DespesasTable list={[]} choices={{ operacional: [], financeiro: [], anexo: [], origem: [], anexoTipo: [], anexoStatus: [] }} onOpen={() => undefined} loading />
  } else if (!despesas.loading && !despesas.list.length) {
    body = <EmptyState className="surface" align="start" icon={<ReceiptText size={36} />} title="Nenhuma despesa neste período">As despesas são lançadas pelos motoristas no App Motoristas. Amplie o período para ver as mais antigas.</EmptyState>
  } else {
    const footer = <span className="pg-num">{plural(visible.length, 'despesa', 'despesas')} de {despesas.list.length} no período</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma despesa com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <DespesasCards list={slice} choices={choices} onOpen={setSelectedId} /> : <div className="surface">{empty}</div>)
          : <DespesasTable list={slice} choices={choices} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} loading={despesas.loading && !despesas.list.length} />}
        {more ? <LazyFooter loaded={slice.length} total={visible.length} more onLoadMore={loadMore} noun={['despesa', 'despesas']} touch={mobile} /> : null}
      </>
    )
  }

  return (
    <div className="page dp-page">
      <div role="toolbar" aria-label="Comandos de despesas">
        <ViewBar view={view} columns={DESPESA_COLUMNS} filters={choices ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por despesa, local, motorista, reserva ou protocolo" aria-label="Buscar despesas" />
          <Select className="pg-filters__select" aria-label="Período do gasto" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={despesas.loading && !loadingFirst} onClick={refresh} />}
        </ViewBar>
      </div>
      {despesas.error && !choices ? null : (
        <Grid min={190}>
          <MetricCard icon={<Wallet size={20} />} label="Total filtrado" value={formatMoney(totais.total)} hint={plural(totais.qtd, 'lançamento', 'lançamentos')} loading={loadingFirst} />
          <MetricCard icon={<Clock size={20} />} tone="warning" label="Aguardando pagamento" value={formatMoney(totais.aguardandoValor)} hint={plural(totais.aguardandoQtd, 'despesa', 'despesas')} loading={loadingFirst} />
          <MetricCard icon={<Paperclip size={20} />} tone="warning" label="Sem comprovante" value={totais.semComprovante} hint="sem anexo completo" loading={loadingFirst} />
          <MetricCard icon={<Copy size={20} />} tone="danger" label="Possível duplicidade" value={totais.duplicidade} hint="conferir antes de pagar" loading={loadingFirst} />
        </Grid>
      )}
      {despesas.error && choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{despesas.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {choices ? <DespesaDrawer despesa={current} onClose={() => setSelectedId(null)} choices={choices} source={source} version={version} /> : null}
    </div>
  )
}
