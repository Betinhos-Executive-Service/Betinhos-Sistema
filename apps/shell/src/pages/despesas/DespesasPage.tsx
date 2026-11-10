import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, MetricCard, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, useShellHeader, useToast } from '@betinhos/ui'
import { Clock, Copy, Paperclip, ReceiptText, RefreshCw, SearchX, UserCheck, Wallet } from 'lucide-react'
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
import { MENSAGEM_DECISAO, aplicarDecisao, proximaEsperando, type Decisao } from './domain/decisao'
import { resumo } from './domain/resumo'
import { useDespesas } from './useDespesas'
import { DespesasCards, DespesasTable, titulo } from './components/DespesasList'
import { DespesaDrawer } from './components/DespesaDrawer'
import type { Despesa } from './domain/types'
import '../pagantes/pagantes.css'
import './despesas.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

export function DespesasPage({ host }: { host: Host }) {
  return <ToastProvider><Despesas host={host} /></ToastProvider>
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. `q` e `periodo` continuam. */
const LEGACY_KEYS = ['operacional', 'financeiro', 'categoria', 'motorista', 'alertas'] as const
const isPeriodo = (v: string): v is Periodo => PERIODOS.some((p) => p.value === v)

function Despesas({ host }: { host: Host }) {
  const auditoria = useAuditoria()
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
  const visibleRef = useRef(visible)
  useEffect(() => { visibleRef.current = visible }, [visible])
  // Rolagem infinita: trocar filtro, busca ou ordenação volta ao primeiro lote; a lista crescer (carga em segundo
  // plano) ou recarregar não. A chave é texto para não mudar quando só a identidade dos filtros muda.
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  // Os cartões de totais só valem com o período inteiro: até lá ficam carregando.
  const pending = !despesas.complete && despesas.loading
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)

  // Grava a decisão, reflete na lista e, na revisão em lote, abre a próxima despesa esperando o gestor.
  const decidir = useCallback(async (d: Despesa, tipo: Decisao, motivo: string): Promise<boolean> => {
    try {
      await source.decidir(d.id, tipo, motivo)
    } catch (e) {
      const detalhe = e instanceof Error ? ` ${e.message}` : ''
      toast({ tone: 'danger', message: `Não foi possível gravar a decisão.${detalhe}${tipo === 'validar' ? '' : ' O motivo digitado foi mantido.'}` })
      return false
    }
    despesas.mutate((data) => ({ ...data, list: data.list.map((x) => (x.id === d.id ? aplicarDecisao(x, tipo, motivo) : x)) }))
    // Revisão em lote: a próxima da lista que se está vendo (visão e filtros valem), lida na hora para o callback não mudar a cada decisão.
    const lote = d.aguardandoGestor
    const proxima = lote ? proximaEsperando(visibleRef.current, d.id) : null
    // O toast diz para onde o drawer foi: ele cobre o título bem na hora em que a despesa troca.
    const seguinte = proxima ? visibleRef.current.find((x) => x.id === proxima) : undefined
    const depois = seguinte ? ` Agora: ${titulo(seguinte)}.` : lote ? ' Nenhuma outra espera o gestor nesta lista.' : ''
    toast({ tone: 'success', message: `${MENSAGEM_DECISAO[tipo]}${depois}` })
    if (lote) setSelectedId(proxima)
    return true
  }, [source, despesas.mutate, toast, setSelectedId])

  const refresh = useCallback(() => { setVersion((v) => v + 1); void despesas.reload() }, [despesas.reload])
  const loadingFirst = !choices
  const reloading = despesas.loading && !loadingFirst
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar despesas" title="Atualizar despesas" loading={reloading} onClick={refresh} />, [refresh, reloading])
  useShellHeader({ title: 'Despesas operacionais', actions: headerActions })
  const clearAll = () => { clearFilters(); setQuery('') }
  // Cada cartão de total abre a visão pronta correspondente; clicar de novo volta à visão padrão. Com a visão atual
  // alterada e não salva, pergunta antes de trocar.
  const [trocaPendente, setTrocaPendente] = useState<string | null>(null)
  const trocar = (pronta: string) => (view.active.id === pronta ? view.restore() : view.select(pronta))
  const kpi = (id: string) => {
    const pronta = `pronta:${id}`
    return { 'aria-pressed': view.active.id === pronta, onClick: () => (view.dirty ? setTrocaPendente(pronta) : trocar(pronta)) }
  }
  const kpiLoading = loadingFirst || pending
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
      <h1 className="dp-sr-only">Despesas operacionais</h1>
      <div role="toolbar" aria-label="Comandos de despesas" className="dp-barra">
        <ViewBar onAudit={() => auditoria({ entity: 'cr40f_despesaoperacional', onOpenRecord: setSelectedId })} view={view} columns={DESPESA_COLUMNS} catalog={extra.catalog} filters={choices ? { fields: allFields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="pg-filters__search" value={query} onChange={setQuery} placeholder="Buscar por despesa, local, motorista, reserva ou protocolo" aria-label="Buscar despesas" />
          <Select className="pg-filters__select" aria-label="Período do gasto" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? EMPTY_FILTERS.periodo)} />
          {/* O cabeçalho do shell (com o Atualizar de headerActions) só aparece no celular; no desktop o botão fica aqui. */}
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar despesas" title="Atualizar despesas" loading={reloading} onClick={refresh} />}
        </ViewBar>
      </div>
      {despesas.error && !choices ? null : (
        <div className="dp-kpis"><div className="dp-kpis__grid">
          <button type="button" className="dp-kpi" {...kpi('esperando-gestor')}><MetricCard icon={<UserCheck size={20} />} tone="warning" label="Esperando gestor" value={totais.esperandoGestor} hint="validar ou devolver" loading={kpiLoading} /></button>
          <MetricCard icon={<Wallet size={20} />} label="Total filtrado" value={formatMoney(totais.total)} hint={plural(totais.qtd, 'lançamento', 'lançamentos')} loading={kpiLoading} />
          <button type="button" className="dp-kpi" {...kpi('aguardando')}><MetricCard icon={<Clock size={20} />} tone="warning" label="A pagar" value={formatMoney(totais.aguardandoValor)} hint={plural(totais.aguardandoQtd, 'despesa', 'despesas')} loading={kpiLoading} /></button>
          <button type="button" className="dp-kpi" {...kpi('sem-comprovante')}><MetricCard icon={<Paperclip size={20} />} tone="warning" label="Sem comprovante" value={totais.semComprovante} hint="sem anexo completo" loading={kpiLoading} /></button>
          <button type="button" className="dp-kpi" {...kpi('duplicidade')}><MetricCard icon={<Copy size={20} />} tone="danger" label="Possível duplicidade" value={totais.duplicidade} hint="conferir antes de pagar" loading={kpiLoading} /></button>
        </div></div>
      )}
      {despesas.error && choices ? (
        <Alert tone="danger" title={despesas.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>
          {despesas.error} {despesas.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só as despesas que chegaram; busca, filtros e totais valem para elas.'}
        </Alert>
      ) : null}
      {body}
      <Dialog open={trocaPendente != null} onClose={() => setTrocaPendente(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setTrocaPendente(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { if (trocaPendente) trocar(trocaPendente); setTrocaPendente(null) }}>Descartar</Button>
        </>}>
        As colunas, filtros ou ordenação da visão “{view.active.name}” foram alterados e ainda não foram salvos.
      </Dialog>
      {choices ? <DespesaDrawer despesa={current} onClose={() => setSelectedId(null)} choices={choices} source={source} version={version} onDecidir={decidir} /> : null}
    </div>
  )
}
