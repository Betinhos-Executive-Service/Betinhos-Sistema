import { useCallback, useMemo, type ReactNode } from 'react'
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
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

export function InfracoesPage({ host }: { host: Host }) {
  return <ToastProvider><Infracoes host={host} /></ToastProvider>
}

/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. `q` continua. */
const LEGACY_KEYS = ['gravidade', 'competencia', 'responsabilidade', 'situacao', 'multas'] as const

/** `embutido`: aba Infrações dentro de Multas na Frota, que já tem página, cabeçalho e toasts próprios. */
export function Infracoes({ host, embutido = false }: { host: Host; embutido?: boolean }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const data = useInfracoes(source)

  // Visões, colunas e filtros (DS §10.9.1/§10.9.2); a Visão padrão mostra só as ativas. Busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_infracaodetransito', ids: data.list.map((i) => i.id) },
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
    const read = extra.read((row: (typeof data.list)[number], key: string) => readInfracao(row, key, multas), (i) => i.id)
    const list = data.list.filter((i) => matchesFilters(i, filters, allFields, read) && matchesKeyword(i, query))
    return extra.sort(sortInfracoes(list, view.config.sort, multas), view.config.sort, (i) => i.id)
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
          : <InfracoesTable list={slice} uso={uso} onOpen={open} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className={embutido ? 'if-page' : 'page page--full if-page'}>
      {embutido ? null : <CabecalhoShell actions={headerActions} />}
      <div role="toolbar" aria-label="Comandos de infrações">
        <ViewBar onAudit={() => auditoria({ entity: 'cr40f_infracaodetransito', onOpenRecord: (id) => setTarget({ mode: 'view', id }) })} view={view} columns={INFRACAO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}>
          {source.mock && !embutido ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
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

/** Só a página solta registra o cabeçalho do celular; embutida, quem registra é a Frota. */
function CabecalhoShell({ actions }: { actions: ReactNode }) {
  useShellHeader({ title: 'Infrações de trânsito', actions })
  return null
}
