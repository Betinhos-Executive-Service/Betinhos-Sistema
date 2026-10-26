import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Grid, MetricCard, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, useShellHeader, useToast } from '@betinhos/ui'
import { Clock, Copy, Paperclip, ReceiptText, RefreshCw, SearchX, Wallet } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { listCache } from '../../app/listCache'
import { keywordIndex, searchWords, useDebouncedText, useMergedById, useServerSearch } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { formatMoney } from '../pagantes/domain/messages'
import { createSource } from './data/source'
import { EMPTY_FILTERS, PERIODOS, VIEWS_KEY, loadViews, opcoes, periodoStart, type Periodo } from './domain/filters'
import { DESPESA_COLUMNS, TELA, builtinViews, despesaFields, despesaKeywordText, fromLegacyFilters, legacyViewConfig, readDespesa, sortDespesas } from './domain/lista'
import { despesasQuery } from './domain/query'
import { resumo } from './domain/resumo'
import { useDespesas } from './useDespesas'
import { DespesasCards, DespesasTable } from './components/DespesasList'
import { DespesaDrawer } from './components/DespesaDrawer'
import type { Despesa } from './domain/types'
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
  const despesas = useDespesas(source, since, listCache(host))
  const choices = despesas.choices
  // Busca e despesa aberta continuam na URL; os filtros vão em `f=` (useListView). A lista filtra 200 ms depois da
  // última tecla; enquanto o período não chegou inteiro, a busca também vai ao servidor.
  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const searchDespesas = useCallback((text: string) => source.search(since, text), [source, since])
  const found = useServerSearch({ query: q, enabled: Boolean(choices) && !despesas.complete, search: searchDespesas })
  const list = useMergedById(despesas.list, found)
  const op = useMemo(() => opcoes(list), [list])
  const fields = useMemo(() => (choices ? despesaFields(choices, op) : []), [choices, op])

  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_despesaoperacional', ids: list.map((d) => d.id) },
    defaultName: 'Todas as despesas',
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

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? list.find((d) => d.id === selectedId) ?? null : null
  const [version, setVersion] = useState(0)

  // Ordena e filtra uma vez por lista/visão; a cada busca só confere o texto já normalizado de cada linha.
  const sorted = useMemo(() => {
    const sort = view.config.sort
    return extra.sort(choices && sort ? sortDespesas(list, sort.key, sort.dir, choices) : list, sort, (d) => d.id)
  }, [list, choices, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, filters, allFields, extra.read(readDespesa, (d) => d.id)), [sorted, filters, allFields, extra])
  const index = useMemo(() => keywordIndex<Despesa>(despesaKeywordText), [])
  const visible = useMemo(() => {
    if (!choices) return []
    const words = searchWords(q)
    return words.length ? filtered.filter((d) => index.matches(d, words)) : filtered
  }, [filtered, index, q, choices])
  const totais = useMemo(() => resumo(visible), [visible])
  // Rolagem infinita: trocar filtro, busca ou ordenação volta ao primeiro lote; a lista crescer (carga em segundo
  // plano) ou recarregar não. A chave é texto para não mudar quando só a identidade dos filtros muda.
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  // Os cartões de totais só valem com o período inteiro: até lá ficam carregando.
  const pending = !despesas.complete && despesas.loading
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
  } else if (despesas.complete && !despesas.loading && !despesas.list.length) {
    body = <EmptyState className="surface" align="start" icon={<ReceiptText size={36} />} title="Nenhuma despesa neste período">As despesas são lançadas pelos motoristas no App Motoristas. Amplie o período para ver as mais antigas.</EmptyState>
  } else {
    const footer = <span className="pg-num">{plural(visible.length, 'despesa', 'despesas')} de {list.length} no período{pending ? ' · carregando o restante…' : ''}</span>
    const empty = pending
      ? <EmptyState align="start" icon={<SearchX size={36} />} title="Procurando no restante do período…" />
      : <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma despesa com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <DespesasCards list={slice} choices={choices} onOpen={setSelectedId} /> : <div className="surface">{empty}</div>)
          : <DespesasTable list={slice} choices={choices} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} loading={despesas.loading && !list.length} />}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} pending={pending} />
      </>
    )
  }

  return (
    <div className="page dp-page">
      <div role="toolbar" aria-label="Comandos de despesas">
        <ViewBar view={view} columns={DESPESA_COLUMNS} catalog={extra.catalog} filters={choices ? { fields: allFields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por despesa, local, motorista, reserva ou protocolo" aria-label="Buscar despesas" />
          <Select className="pg-filters__select" aria-label="Período do gasto" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={despesas.loading && !loadingFirst} onClick={refresh} />}
        </ViewBar>
      </div>
      {despesas.error && !choices ? null : (
        <Grid min={190}>
          <MetricCard icon={<Wallet size={20} />} label="Total filtrado" value={formatMoney(totais.total)} hint={plural(totais.qtd, 'lançamento', 'lançamentos')} loading={loadingFirst || pending} />
          <MetricCard icon={<Clock size={20} />} tone="warning" label="Aguardando pagamento" value={formatMoney(totais.aguardandoValor)} hint={plural(totais.aguardandoQtd, 'despesa', 'despesas')} loading={loadingFirst || pending} />
          <MetricCard icon={<Paperclip size={20} />} tone="warning" label="Sem comprovante" value={totais.semComprovante} hint="sem anexo completo" loading={loadingFirst || pending} />
          <MetricCard icon={<Copy size={20} />} tone="danger" label="Possível duplicidade" value={totais.duplicidade} hint="conferir antes de pagar" loading={loadingFirst || pending} />
        </Grid>
      )}
      {despesas.error && choices ? (
        <Alert tone="danger" title={despesas.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>
          {despesas.error} {despesas.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só as despesas que chegaram; busca, filtros e totais valem para elas.'}
        </Alert>
      ) : null}
      {body}
      {choices ? <DespesaDrawer despesa={current} onClose={() => setSelectedId(null)} choices={choices} source={source} version={version} /> : null}
    </div>
  )
}
