import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader } from '@betinhos/ui'
import { FileWarning, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { INFRACAO_COLUMNS, INFRACAO_DEFAULT_FILTERS, INFRACAO_FIELDS, INFRACAO_SORT, TELA, builtinViews, fromLegacyFilters, matchesKeyword, readInfracao, sortInfracoes } from './domain/lista'
import { infracoesQuery } from './domain/query'
import { usoIndex } from './domain/uso'
import { useInfracoes } from './useInfracoes'
import { InfracoesCards, InfracoesTable } from './components/InfracoesList'
import { InfracaoDrawer } from './components/InfracaoDrawer'
import './infracoes.css'

export function InfracoesPage({ host }: { host: Host }) {
  return <ToastProvider><Infracoes host={host} /></ToastProvider>
}

/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. `q` continua. */
const LEGACY_KEYS = ['gravidade', 'competencia', 'responsabilidade', 'situacao', 'multas'] as const

function Infracoes({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const data = useInfracoes(source)

  // Visões, colunas e filtros (DS §10.9.1/§10.9.2); a Visão padrão mostra só as ativas. Busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    defaultName: 'Infrações ativas',
    tela: TELA,
    columns: INFRACAO_COLUMNS,
    defaultSort: INFRACAO_SORT,
    defaultFilters: INFRACAO_DEFAULT_FILTERS,
    fields: INFRACAO_FIELDS,
    ready: true,
    builtins: builtinViews,
    legacy: { keys: LEGACY_KEYS, read: (q) => fromLegacyFilters(infracoesQuery.ler(q)) },
  })
  const [query, setQuery] = useQueryTexto('q')

  const uso = useMemo(() => usoIndex(data.multas), [data.multas])
  const visible = useMemo(() => {
    const multas = (id: string) => uso.get(id)?.length ?? 0
    const list = data.list.filter((i) => matchesFilters(i, filters, INFRACAO_FIELDS, (row, key) => readInfracao(row, key, multas)) && matchesKeyword(i, query))
    return sortInfracoes(list, view.config.sort, multas)
  }, [data.list, filters, query, uso, view.config.sort])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }
  const ativas = useMemo(() => data.list.filter((i) => i.ativo).length, [data.list])
  const usoState = data.multasError ?? (data.loading && !data.loaded ? 'loading' : 'ok')

  const [target, setTarget] = useQueryAlvo()

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar infrações" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Infrações de trânsito', actions: headerActions })

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as infrações" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <InfracoesTable list={[]} uso={uso} onOpen={() => undefined} loading />
  } else if (!data.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileWarning size={36} />} title="Nenhuma infração cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova infração</Button>}>Cadastre os códigos do CTB para usar nas multas.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="if-num">{visible.length} de {data.list.length} · {ativas} ativas</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma infração com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <InfracoesCards list={slice} uso={uso} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <InfracoesTable list={slice} uso={uso} onOpen={open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page page--full if-page">
      <div role="toolbar" aria-label="Comandos de infrações">
        <ViewBar view={view} columns={INFRACAO_COLUMNS} filters={{ fields: INFRACAO_FIELDS }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="if-filters__search" value={query} onChange={setQuery} placeholder="Buscar por código, descrição ou artigo" aria-label="Buscar infrações" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={() => setTarget({ mode: 'create' })}>Nova infração</Button>
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {data.multasError && data.loaded ? <Alert tone="warning" title="Não foi possível carregar o uso nas multas">{data.multasError} A contagem de multas fica indisponível até atualizar.</Alert> : null}
      {body}
      {data.loaded ? <InfracaoDrawer target={target} onTarget={setTarget} list={data.list} uso={uso} usoState={usoState} source={source} onSaved={data.upsert} /> : null}
    </div>
  )
}
